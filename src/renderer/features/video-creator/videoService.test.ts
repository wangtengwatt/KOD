import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createVideoTask,
  deleteVideoTask,
  fetchVideoContent,
  getVideoTask,
  joinVideoApiUrl,
  listVideoTasks,
  mapVideoTaskStatus,
  saveVideoTask,
} from './videoService'

const config = { apiHost: 'https://relay.example/v1/', apiKey: 'secret' }

afterEach(() => vi.restoreAllMocks())

describe('video service', () => {
  it('joins API paths without duplicating v1', () => {
    expect(joinVideoApiUrl('https://relay.example/v1/', '/v1/videos')).toBe('https://relay.example/v1/videos')
    expect(joinVideoApiUrl('https://relay.example/', '/v1/videos')).toBe('https://relay.example/v1/videos')
  })

  it.each([
    ['queued', 'queued'],
    ['in_progress', 'processing'],
    ['completed', 'succeeded'],
    ['failed', 'failed'],
    ['unknown', 'queued'],
  ] as const)('maps remote status %s to %s', (remote, local) => {
    expect(mapVideoTaskStatus(remote)).toBe(local)
  })

  it('creates JSON with string seconds, images, and object metadata', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ task_id: 'task-1', status: 'in_progress' }), { status: 200 })
    )
    const result = await createVideoTask(config, {
      prompt: 'A moving cloud',
      model: 'seedance-1-0-pro',
      seconds: '5',
      ratio: '16:9',
      resolution: '720p',
      watermark: false,
      firstFrameDataUrl: 'data:image/png;base64,AA==',
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://relay.example/v1/videos')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'seedance-1-0-pro',
      prompt: 'A moving cloud',
      seconds: '5',
      images: ['data:image/png;base64,AA=='],
      metadata: { ratio: '16:9', resolution: '720p', watermark: false },
    })
    expect(result).toMatchObject({ id: 'task-1', status: 'processing' })
  })

  it('accepts id and maps completed status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'task-1', status: 'completed' }))
    )
    await expect(getVideoTask(config, 'task-1')).resolves.toMatchObject({ id: 'task-1', status: 'succeeded' })
  })

  it('normalizes both supported error envelopes', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 400, message: 'bad request', data: null }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'provider failed' } }), { status: 500 }))
    await expect(getVideoTask(config, 'one')).rejects.toThrow('bad request')
    await expect(getVideoTask(config, 'two')).rejects.toThrow('provider failed')
  })

  it('fetches protected content as a blob', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Blob(['video'])))
    const blob = await fetchVideoContent(config, 'task/1')
    expect(blob.size).toBe(5)
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer secret')
    expect(fetchMock.mock.calls[0][0]).toBe('https://relay.example/v1/videos/task%2F1/content')
  })

  it('persists, sorts, and deletes task history', async () => {
    await saveVideoTask({
      id: 'older', prompt: 'old', model: 'seedance', seconds: '5', ratio: '1:1', resolution: '720p',
      watermark: false, status: 'queued', createdAt: 1, updatedAt: 1,
    })
    await saveVideoTask({
      id: 'newer', prompt: 'new', model: 'seedance', seconds: '10', ratio: '16:9', resolution: '1080p',
      watermark: true, status: 'succeeded', createdAt: 2, updatedAt: 2,
    })
    expect((await listVideoTasks()).map((task) => task.id)).toEqual(['newer', 'older'])
    await deleteVideoTask('newer')
    expect((await listVideoTasks()).map((task) => task.id)).toEqual(['older'])
  })
})
