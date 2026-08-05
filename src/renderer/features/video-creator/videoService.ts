import { z } from 'zod'

export const videoTaskStatusSchema = z.enum(['queued', 'processing', 'succeeded', 'failed'])
export const remoteVideoTaskStatusSchema = z.enum(['queued', 'in_progress', 'completed', 'failed', 'unknown'])

const videoApiResponseSchema = z
  .object({
    id: z.string().optional(),
    task_id: z.string().optional(),
    status: remoteVideoTaskStatusSchema,
    error: z.union([z.string(), z.object({ message: z.string() }).passthrough()]).optional(),
    message: z.string().optional(),
  })
  .passthrough()
  .transform((value, context) => {
    const id = value.id || value.task_id
    if (!id) {
      context.addIssue({ code: 'custom', message: 'Missing video task id' })
      return z.NEVER
    }
    return { ...value, id, status: mapVideoTaskStatus(value.status) }
  })

export const videoCreateInputSchema = z.object({
  prompt: z.string().trim().min(1),
  model: z.string().min(1),
  seconds: z.string().regex(/^\d+$/),
  ratio: z.string().min(1),
  resolution: z.string().min(1),
  watermark: z.boolean(),
  firstFrameDataUrl: z.string().startsWith('data:image/').optional(),
})

export type VideoTaskStatus = z.infer<typeof videoTaskStatusSchema>
export type VideoCreateInput = z.infer<typeof videoCreateInputSchema>

export interface VideoTask {
  id: string
  prompt: string
  model: string
  seconds: string
  ratio: string
  resolution: string
  watermark: boolean
  firstFrameName?: string
  firstFrameDataUrl?: string
  status: VideoTaskStatus
  error?: string
  createdAt: number
  updatedAt: number
}

export interface VideoApiConfig {
  apiHost: string
  apiKey: string
}

const requestTimeoutMs = 30_000

export function mapVideoTaskStatus(status: z.infer<typeof remoteVideoTaskStatusSchema>): VideoTaskStatus {
  if (status === 'in_progress') return 'processing'
  if (status === 'completed') return 'succeeded'
  if (status === 'failed') return 'failed'
  return 'queued'
}

export function joinVideoApiUrl(apiHost: string, path: string) {
  const host = apiHost.replace(/\/+$/, '')
  const normalizedPath = `/${path.replace(/^\/+/, '')}`
  if (host.endsWith('/v1') && normalizedPath.startsWith('/v1/')) {
    return `${host}${normalizedPath.slice(3)}`
  }
  return `${host}${normalizedPath}`
}

function linkSignals(signal?: AbortSignal, timeoutMs = requestTimeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs)
  const abort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', abort, { once: true })
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    },
  }
}

export function normalizeVideoError(error: unknown): string {
  if (error instanceof z.ZodError) return 'The video service returned an invalid response.'
  if (error instanceof DOMException && error.name === 'AbortError') return 'The request was stopped.'
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'The request timed out.'
  if (error instanceof Error && error.message) return error.message
  return 'Video generation failed.'
}

function extractErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  if ('message' in body && typeof body.message === 'string') return body.message
  if ('error' in body) {
    if (typeof body.error === 'string') return body.error
    if (body.error && typeof body.error === 'object' && 'message' in body.error) return String(body.error.message)
  }
  if ('data' in body && body.data && typeof body.data === 'object' && 'message' in body.data) {
    return String(body.data.message)
  }
  return undefined
}

async function parseResponse(response: Response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(extractErrorMessage(body) || `Video service request failed (${response.status}).`)
  }
  return videoApiResponseSchema.parse(body)
}

export async function createVideoTask(config: VideoApiConfig, rawInput: VideoCreateInput, signal?: AbortSignal) {
  const input = videoCreateInputSchema.parse(rawInput)
  const linked = linkSignals(signal)
  try {
    const response = await fetch(joinVideoApiUrl(config.apiHost, '/v1/videos'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        seconds: input.seconds,
        images: input.firstFrameDataUrl ? [input.firstFrameDataUrl] : [],
        metadata: { ratio: input.ratio, resolution: input.resolution, watermark: input.watermark },
      }),
      signal: linked.signal,
    })
    return await parseResponse(response)
  } finally {
    linked.cleanup()
  }
}

export async function getVideoTask(config: VideoApiConfig, taskId: string, signal?: AbortSignal) {
  const linked = linkSignals(signal)
  try {
    const response = await fetch(joinVideoApiUrl(config.apiHost, `/v1/videos/${encodeURIComponent(taskId)}`), {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: linked.signal,
    })
    return await parseResponse(response)
  } finally {
    linked.cleanup()
  }
}

export async function fetchVideoContent(config: VideoApiConfig, taskId: string, signal?: AbortSignal) {
  const linked = linkSignals(signal)
  try {
    const response = await fetch(
      joinVideoApiUrl(config.apiHost, `/v1/videos/${encodeURIComponent(taskId)}/content`),
      { headers: { Authorization: `Bearer ${config.apiKey}` }, signal: linked.signal }
    )
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new Error(extractErrorMessage(body) || `Video download failed (${response.status}).`)
    }
    return await response.blob()
  } finally {
    linked.cleanup()
  }
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error('Failed to read first-frame image.'))
    reader.readAsDataURL(file)
  })
}

const DB_NAME = 'kod-video-generation'
const STORE_NAME = 'tasks'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function taskStore(mode: IDBTransactionMode) {
  const db = await openDatabase()
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
}

export async function saveVideoTask(task: VideoTask): Promise<void> {
  const store = await taskStore('readwrite')
  await new Promise<void>((resolve, reject) => {
    const request = store.put(task)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function deleteVideoTask(id: string): Promise<void> {
  const store = await taskStore('readwrite')
  await new Promise<void>((resolve, reject) => {
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function listVideoTasks(): Promise<VideoTask[]> {
  const store = await taskStore('readonly')
  return new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve((request.result as VideoTask[]).sort((a, b) => b.createdAt - a.createdAt))
    request.onerror = () => reject(request.error)
  })
}

export function getVideoTaskError(response: z.infer<typeof videoApiResponseSchema>): string | undefined {
  return typeof response.error === 'string' ? response.error : response.error?.message || response.message
}
