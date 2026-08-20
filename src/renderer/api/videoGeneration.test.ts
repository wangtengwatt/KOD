import { afterEach, describe, expect, it, vi } from 'vitest'
import { authInfoStore } from '@/stores/authInfoStore'
import { videoGenerationApi } from './videoGeneration'

const TASK_ONE = '11111111-1111-4111-8111-111111111111'
const TASK_TWO = '22222222-2222-4222-8222-222222222222'

const ok = (data: unknown) =>
  new Response(JSON.stringify({ code: 0, message: 'success', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

afterEach(() => {
  vi.unstubAllGlobals()
  authInfoStore.getState().clearTokens()
})

describe('authenticated video generation API', () => {
  it('submits only generation parameters to the KOD backend with the current bearer', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'kod-access', refreshToken: 'kod-refresh' })
    const fetchMock = vi.fn((_url, init) => {
      expect(String(_url)).toContain('/api/media/video/tasks')
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer kod-access')
      const body = JSON.parse(String(init?.body))
      expect(body).toEqual({
        prompt: '云海日出',
        model: 'seedance-2.0-asset-fast',
        durationSeconds: 5,
        resolution: '720p',
        ratio: '16:9',
        referenceImages: [],
      })
      expect(JSON.stringify(init)).not.toContain('api.tokenstar.world')
      return ok(task(TASK_ONE, 'QUEUED'))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      videoGenerationApi.submit({
        prompt: '云海日出',
        model: 'seedance-2.0-asset-fast',
        durationSeconds: 5,
        resolution: '720p',
        ratio: '16:9',
        referenceImages: [],
      })
    ).resolves.toMatchObject({ publicTaskId: TASK_ONE, status: 'QUEUED' })
  })

  it('normalizes status and downloads authenticated content from the KOD origin', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'kod-access', refreshToken: 'kod-refresh' })
    const fetchMock = vi.fn((url, init) => {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer kod-access')
      if (String(url).endsWith('/content')) {
        return new Response('video-bytes', { status: 200, headers: { 'Content-Type': 'video/mp4' } })
      }
      return ok(task(TASK_TWO, 'SUCCEEDED'))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(videoGenerationApi.status(TASK_TWO)).resolves.toMatchObject({ status: 'SUCCEEDED' })
    await expect(videoGenerationApi.content(TASK_TWO)).resolves.toBeInstanceOf(Blob)
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes(`/api/media/video/tasks/${TASK_TWO}`))).toBe(true)
  })

  it('keeps auth state for non-auth video failures', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'kod-access', refreshToken: 'kod-refresh' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(null))
    )

    await expect(videoGenerationApi.status('missing')).rejects.toThrow()
    expect(authInfoStore.getState().accessToken).toBe('kod-access')
  })

  it('does not treat a HTTP 200 business-error envelope as video content', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'kod-access', refreshToken: 'kod-refresh' })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 409, message: '视频尚未完成或结算', data: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
      )
    )

    await expect(videoGenerationApi.content(TASK_TWO)).rejects.toMatchObject({
      code: 409,
      kind: 'business',
    })
    expect(authInfoStore.getState().accessToken).toBe('kod-access')
  })
})

function task(publicTaskId: string, status: string) {
  return {
    publicTaskId,
    model: 'seedance-2.0-asset-fast',
    durationSeconds: 5,
    resolution: '720p',
    ratio: '16:9',
    price: 1.25,
    status,
    progress: status === 'SUCCEEDED' ? 100 : 0,
    errorCode: null,
    errorMessage: null,
    billed: status === 'SUCCEEDED',
    createdAt: 1,
    updatedAt: 2,
  }
}
