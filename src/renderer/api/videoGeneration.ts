import { ofetch } from 'ofetch'
import { z } from 'zod'
import { getKodApiOrigin } from '@/packages/kodApiOrigin'
import { authInfoStore } from '@/stores/authInfoStore'

const decimalWire = z.union([z.number().finite(), z.string().regex(/^\d+(?:\.\d+)?$/)]).transform(Number)
const ResultEnvelopeSchema = z.object({
  code: z.number(),
  message: z.string().default(''),
  data: z.unknown().nullish(),
})
const TaskSchema = z.object({
  publicTaskId: z.string().uuid(),
  model: z.string(),
  durationSeconds: z.number().int().positive(),
  resolution: z.string(),
  ratio: z.string(),
  price: decimalWire,
  status: z.enum(['QUEUED', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'BILLING_FAILED']),
  progress: z.number().int().min(0).max(100),
  errorCode: z.string().nullish(),
  errorMessage: z.string().nullish(),
  billed: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
const AvailabilitySchema = z.object({
  available: z.boolean(),
  reason: z.string(),
  models: z.array(z.string()),
  durations: z.array(z.number().int().positive()),
  resolutions: z.array(z.string()),
  ratios: z.array(z.string()),
  maxReferenceImages: z.number().int().nonnegative(),
  maxReferenceImageBytes: z.number().int().nonnegative(),
})

export interface VideoSubmitInput {
  prompt: string
  model: string
  durationSeconds: number
  resolution: string
  ratio: string
  referenceImages: string[]
}

export class VideoGenerationApiError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly kind: 'auth' | 'business' | 'http' | 'schema' | 'network'
  ) {
    super(message)
    this.name = 'VideoGenerationApiError'
  }
}

async function jsonRequest<T extends z.ZodType>(
  path: string,
  schema: T,
  options: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {}
): Promise<z.infer<T>> {
  const token = accessToken()
  try {
    const response = await ofetch.raw(new URL(path, getKodApiOrigin()).toString(), {
      method: options.method ?? 'GET',
      body: options.body as Record<string, unknown> | undefined,
      signal: options.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ignoreResponseError: true,
      retry: options.method === 'POST' ? 0 : 1,
    })
    if (response.status === 401 || response.status === 403) throw invalidSession(token)
    if (response.status < 200 || response.status >= 300) {
      throw new VideoGenerationApiError(`视频服务请求失败（HTTP ${response.status}）`, response.status, 'http')
    }
    const envelope = ResultEnvelopeSchema.safeParse(response._data)
    if (!envelope.success) throw new VideoGenerationApiError('视频服务响应格式异常', 502, 'schema')
    if (envelope.data.code === 401 || envelope.data.code === 403) throw invalidSession(token)
    if (envelope.data.code !== 0) {
      throw new VideoGenerationApiError(envelope.data.message || '视频服务处理失败', envelope.data.code, 'business')
    }
    const data = schema.safeParse(envelope.data.data)
    if (!data.success) throw new VideoGenerationApiError('视频服务响应格式异常', 502, 'schema')
    return data.data
  } catch (error) {
    if (error instanceof VideoGenerationApiError) throw error
    throw new VideoGenerationApiError(error instanceof Error ? error.message : '视频服务网络请求失败', 0, 'network')
  }
}

async function content(publicTaskId: string, signal?: AbortSignal) {
  const token = accessToken()
  const response = await fetch(
    new URL(`/api/media/video/tasks/${encodeURIComponent(publicTaskId)}/content`, getKodApiOrigin()),
    { headers: { Authorization: `Bearer ${token}` }, signal }
  )
  if (response.status === 401 || response.status === 403) throw invalidSession(token)
  if ((response.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
    const envelope = ResultEnvelopeSchema.safeParse(await response.json().catch(() => null))
    if (!envelope.success) throw new VideoGenerationApiError('视频下载响应格式异常', 502, 'schema')
    if (envelope.data.code === 401 || envelope.data.code === 403) throw invalidSession(token)
    if (envelope.data.code !== 0) {
      throw new VideoGenerationApiError(envelope.data.message || '视频下载失败', envelope.data.code, 'business')
    }
    throw new VideoGenerationApiError('视频下载响应格式异常', 502, 'schema')
  }
  if (!response.ok)
    throw new VideoGenerationApiError(`视频下载失败（HTTP ${response.status}）`, response.status, 'http')
  return response.blob()
}

function accessToken() {
  const token = authInfoStore.getState().accessToken
  if (!token) throw new VideoGenerationApiError('请先登录 KOD 账号', 401, 'auth')
  return token
}

function invalidSession(rejectedToken: string) {
  if (authInfoStore.getState().accessToken === rejectedToken) authInfoStore.getState().clearTokens()
  return new VideoGenerationApiError('登录状态已失效，请重新登录', 401, 'auth')
}

export const videoGenerationApi = {
  availability: (signal?: AbortSignal) => jsonRequest('/api/media/video/availability', AvailabilitySchema, { signal }),
  submit: (input: VideoSubmitInput, signal?: AbortSignal) =>
    jsonRequest('/api/media/video/tasks', TaskSchema, { method: 'POST', body: input, signal }),
  status: (publicTaskId: string, signal?: AbortSignal) =>
    jsonRequest(`/api/media/video/tasks/${encodeURIComponent(publicTaskId)}`, TaskSchema, { signal }),
  content,
}

export type VideoProxyTask = z.infer<typeof TaskSchema>
export type VideoAvailability = z.infer<typeof AvailabilitySchema>
