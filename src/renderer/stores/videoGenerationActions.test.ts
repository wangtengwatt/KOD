import type { VideoGeneration } from '@shared/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authInfoStore } from '@/stores/authInfoStore'

const mocks = vi.hoisted(() => ({
  availability: vi.fn(),
  submit: vi.fn(),
  poll: vi.fn(),
  download: vi.fn(),
  getBlob: vi.fn(),
  setBlob: vi.fn(),
  createRecord: vi.fn(),
  getRecord: vi.fn(),
  updateRecord: vi.fn(),
  invalidateQueries: vi.fn(),
  setQueryData: vi.fn(),
  state: { currentGeneratingId: null as string | null, currentRecordId: null as string | null },
}))

vi.mock('@/packages/model-calls/generate-video', () => ({
  getVideoAvailability: mocks.availability,
  submitVideoTask: mocks.submit,
  pollVideoTaskUntilComplete: mocks.poll,
  downloadVideoAsDataUrl: mocks.download,
  getVideoServiceErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}))

vi.mock('@/storage', () => ({
  default: {
    getBlob: mocks.getBlob,
    setBlob: mocks.setBlob,
  },
}))

vi.mock('./queryClient', () => ({
  queryClient: {
    invalidateQueries: mocks.invalidateQueries,
    setQueryData: mocks.setQueryData,
  },
}))

vi.mock('./videoGenerationStore', () => ({
  VIDEO_GEN_LIST_QUERY_KEY: 'video-generation-list',
  VIDEO_GEN_QUERY_KEY: 'video-generation',
  videoGenerationStore: {
    getState: () => mocks.state,
    setState: (updates: Partial<typeof mocks.state>) => Object.assign(mocks.state, updates),
  },
  createVideoRecord: mocks.createRecord,
  getVideoRecord: mocks.getRecord,
  updateVideoRecord: mocks.updateRecord,
}))

import { createAndGenerateVideo, VideoLoginRequiredError } from './videoGenerationActions'

const record: VideoGeneration = {
  id: 'local-video-1',
  createdAt: 1,
  status: 'pending',
  prompt: '原创城市日出',
  referenceImages: ['picture:video-creator-ref:one'],
  model: { provider: 'openai', modelId: 'seedance-2.0-asset-fast' },
  duration: 5,
  resolution: '720p',
  ratio: '16:9',
  generatedVideos: [],
}

describe('official video generation actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authInfoStore.getState().clearTokens()
    Object.assign(mocks.state, { currentGeneratingId: null, currentRecordId: null })
    mocks.createRecord.mockResolvedValue(record)
    mocks.updateRecord.mockImplementation(async (_id: string, updates: Partial<VideoGeneration>) => ({
      ...record,
      ...updates,
    }))
    mocks.getBlob.mockResolvedValue('data:image/png;base64,cmVm')
  })

  afterEach(() => {
    authInfoStore.getState().clearTokens()
  })

  it('stops before availability or task creation when the KOD account is logged out', async () => {
    await expect(
      createAndGenerateVideo({
        prompt: record.prompt,
        referenceImages: record.referenceImages,
        model: record.model,
        duration: record.duration,
        resolution: record.resolution,
        ratio: record.ratio,
      })
    ).rejects.toBeInstanceOf(VideoLoginRequiredError)

    expect(mocks.availability).not.toHaveBeenCalled()
    expect(mocks.createRecord).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('shows the backend unavailable reason and never creates or submits a task when the server key is absent', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'kod-access', refreshToken: 'kod-refresh' })
    mocks.availability.mockResolvedValue({
      available: false,
      reason: '视频服务未配置上游 API Key',
      models: [],
      durations: [],
      resolutions: [],
      ratios: [],
      maxReferenceImages: 0,
      maxReferenceImageBytes: 0,
    })

    await expect(
      createAndGenerateVideo({
        prompt: record.prompt,
        referenceImages: record.referenceImages,
        model: record.model,
        duration: record.duration,
        resolution: record.resolution,
        ratio: record.ratio,
      })
    ).rejects.toThrow('视频服务未配置上游 API Key')

    expect(mocks.createRecord).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('uses the backend task flow after availability succeeds and stores only the downloaded result locally', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'kod-access', refreshToken: 'kod-refresh' })
    mocks.availability.mockResolvedValue({
      available: true,
      reason: '',
      models: ['seedance-2.0-asset-fast'],
      durations: [5],
      resolutions: ['720p'],
      ratios: ['16:9'],
      maxReferenceImages: 2,
      maxReferenceImageBytes: 10_000_000,
    })
    mocks.submit.mockResolvedValue({ id: 'public-task-1', status: 'queued', progress: 0 })
    mocks.poll.mockResolvedValue({ id: 'public-task-1', status: 'completed', progress: 100 })
    mocks.download.mockResolvedValue('data:video/mp4;base64,dmlkZW8=')

    await expect(
      createAndGenerateVideo({
        prompt: record.prompt,
        referenceImages: record.referenceImages,
        model: record.model,
        duration: record.duration,
        resolution: record.resolution,
        ratio: record.ratio,
      })
    ).resolves.toBe(record.id)

    await vi.waitFor(() => expect(mocks.setBlob).toHaveBeenCalledTimes(1))
    expect(mocks.submit).toHaveBeenCalledWith(
      {
        model: 'seedance-2.0-asset-fast',
        prompt: '原创城市日出',
        images: ['data:image/png;base64,cmVm'],
        duration: 5,
        resolution: '720p',
        ratio: '16:9',
      },
      expect.any(AbortSignal)
    )
    expect(mocks.poll).toHaveBeenCalledWith(
      'public-task-1',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(mocks.download).toHaveBeenCalledWith('public-task-1', expect.any(AbortSignal))
    expect(JSON.stringify(mocks.submit.mock.calls)).not.toMatch(/api[_-]?key|tokenstar|https?:\/\//i)
    expect(mocks.updateRecord).toHaveBeenCalledWith(
      record.id,
      expect.objectContaining({ status: 'done', progress: 100 }),
      null
    )
  })

  it('aborts an in-flight task on account switch and marks only the owner history retryable', async () => {
    authInfoStore.setState({
      accessToken: 'account-a-access',
      refreshToken: 'account-a-refresh',
      loginEmail: 'account-a@kod.test',
    })
    mocks.availability.mockResolvedValue({
      available: true,
      reason: '',
      models: ['seedance-2.0-asset-fast'],
      durations: [5],
      resolutions: ['720p'],
      ratios: ['16:9'],
      maxReferenceImages: 2,
      maxReferenceImageBytes: 10_000_000,
    })
    mocks.submit.mockResolvedValue({ id: 'account-a-task', status: 'queued', progress: 0 })
    mocks.poll.mockImplementation(
      (_id: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
            once: true,
          })
        })
    )

    await createAndGenerateVideo({
      prompt: record.prompt,
      referenceImages: record.referenceImages,
      model: record.model,
      duration: record.duration,
      resolution: record.resolution,
      ratio: record.ratio,
    })
    await vi.waitFor(() => expect(mocks.poll).toHaveBeenCalledTimes(1))

    authInfoStore.setState({
      accessToken: 'account-b-access',
      refreshToken: 'account-b-refresh',
      loginEmail: 'account-b@kod.test',
    })

    await vi.waitFor(() =>
      expect(mocks.updateRecord).toHaveBeenCalledWith(
        record.id,
        expect.objectContaining({ status: 'error' }),
        'account-a@kod.test'
      )
    )
    expect(mocks.download).not.toHaveBeenCalled()
    expect(mocks.updateRecord.mock.calls.every((call) => call[2] === 'account-a@kod.test')).toBe(true)
    expect(mocks.state.currentGeneratingId).toBeNull()
  })

  it('keeps the owner task running when only that account tokens rotate', async () => {
    authInfoStore.setState({
      accessToken: 'account-a-access',
      refreshToken: 'account-a-refresh',
      loginEmail: 'account-a@kod.test',
    })
    mocks.availability.mockResolvedValue({
      available: true,
      reason: '',
      models: ['seedance-2.0-asset-fast'],
      durations: [5],
      resolutions: ['720p'],
      ratios: ['16:9'],
      maxReferenceImages: 2,
      maxReferenceImageBytes: 10_000_000,
    })
    mocks.submit.mockResolvedValue({ id: 'account-a-task', status: 'queued', progress: 0 })
    let resolvePoll: ((task: { id: string; status: 'completed'; progress: number }) => void) | undefined
    mocks.poll.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePoll = resolve
        })
    )
    mocks.download.mockResolvedValue('data:video/mp4;base64,dmlkZW8=')

    await createAndGenerateVideo({
      prompt: record.prompt,
      referenceImages: record.referenceImages,
      model: record.model,
      duration: record.duration,
      resolution: record.resolution,
      ratio: record.ratio,
    })
    await vi.waitFor(() => expect(mocks.poll).toHaveBeenCalledTimes(1))

    authInfoStore.setState({
      accessToken: 'account-a-access-refreshed',
      refreshToken: 'account-a-refresh-refreshed',
      loginEmail: 'account-a@kod.test',
    })
    resolvePoll?.({ id: 'account-a-task', status: 'completed', progress: 100 })

    await vi.waitFor(() =>
      expect(mocks.updateRecord).toHaveBeenCalledWith(
        record.id,
        expect.objectContaining({ status: 'done' }),
        'account-a@kod.test'
      )
    )
    expect(mocks.updateRecord).not.toHaveBeenCalledWith(
      record.id,
      expect.objectContaining({ status: 'error' }),
      'account-a@kod.test'
    )
  })
})
