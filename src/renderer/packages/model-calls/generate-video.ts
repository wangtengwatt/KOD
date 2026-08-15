import { createModelDependencies } from '@/adapters'
import { KOD_VIDEO_UPSTREAM } from './kod-video'

export type VideoProtocol = 'openai-videos' | 'volcengine-tasks'

export interface VideoUsage {
  completionTokens?: number
  totalTokens?: number
}

export interface NormalizedVideoTask {
  id: string
  status: 'queued' | 'in_progress' | 'completed' | 'failed'
  progress?: number
  errorMessage?: string
  errorCode?: string
  videoUrl?: string
  usage?: VideoUsage
}

export interface SubmitVideoParams {
  model: string
  prompt: string
  images?: string[]
  duration: 5 | 10
  resolution: '480p' | '720p'
  ratio: '16:9'
}

const protocolCache = new Map<string, VideoProtocol>()

async function videoRequest(method: 'GET' | 'POST', url: string, body?: unknown, signal?: AbortSignal) {
  if (!KOD_VIDEO_UPSTREAM.apiKey) {
    throw new Error('KOD 视频服务尚未配置，请联系管理员配置服务端视频代理')
  }
  const dependencies = await createModelDependencies()
  return dependencies.request.apiRequest({
    url,
    method,
    headers: {
      Authorization: `Bearer ${KOD_VIDEO_UPSTREAM.apiKey}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    retry: method === 'POST' ? 0 : 2,
  })
}

function isNotFoundError(error: unknown) {
  return error instanceof Error && /(?:status code )?404/i.test(error.message)
}

function volcTasksBase(apiHost: string) {
  if (apiHost.includes('/api/v3')) return apiHost.replace(/\/api\/v3.*$/, '/api/v3')
  return `${apiHost.replace(/\/v1\/?$/, '')}/api/v3`
}

export function buildOpenAIVideosBody(params: SubmitVideoParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    seconds: String(params.duration),
    metadata: {
      watermark: false,
      resolution: params.resolution,
      ratio: params.ratio,
      duration: params.duration,
    },
  }
  if (params.images?.length) {
    body.images = params.images
    body.image = params.images[0]
  }
  return body
}

export function buildVolcengineTasksBody(params: SubmitVideoParams): Record<string, unknown> {
  const content: Record<string, unknown>[] = (params.images || []).map((url) => ({
    type: 'image_url',
    image_url: { url },
  }))
  content.push({ type: 'text', text: params.prompt })
  return {
    model: params.model,
    content,
    watermark: false,
    resolution: params.resolution,
    ratio: params.ratio,
    duration: params.duration,
  }
}

export function normalizeOpenAIVideosResponse(json: Record<string, unknown>): NormalizedVideoTask {
  const error = json.error as { message?: string; code?: string } | null | undefined
  const metadata = json.metadata as Record<string, unknown> | null | undefined
  const rawStatus = typeof json.status === 'string' ? json.status : 'queued'
  const status: NormalizedVideoTask['status'] =
    rawStatus === 'completed' || rawStatus === 'failed' || rawStatus === 'in_progress' ? rawStatus : 'queued'
  return {
    id: String(json.id ?? ''),
    status,
    progress: typeof json.progress === 'number' ? json.progress : undefined,
    errorMessage: error?.message,
    errorCode: error?.code,
    videoUrl: typeof metadata?.url === 'string' && metadata.url ? metadata.url : undefined,
  }
}

export function normalizeVolcengineTasksResponse(json: Record<string, unknown>): NormalizedVideoTask {
  const error = json.error as { message?: string; code?: string } | null | undefined
  const content = json.content as { video_url?: string | null } | null | undefined
  const usage = json.usage as { completion_tokens?: number | null; total_tokens?: number | null } | null | undefined
  const statusMap: Record<string, NormalizedVideoTask['status']> = {
    queued: 'queued',
    pending: 'queued',
    running: 'in_progress',
    processing: 'in_progress',
    in_progress: 'in_progress',
    succeeded: 'completed',
    completed: 'completed',
    failed: 'failed',
  }
  const status = statusMap[String(json.status ?? 'queued')] ?? 'in_progress'
  return {
    id: String(json.id ?? ''),
    status,
    progress: status === 'completed' || status === 'failed' ? 100 : status === 'in_progress' ? 50 : 10,
    errorMessage: error?.message,
    errorCode: error?.code ? String(error.code) : undefined,
    videoUrl: content?.video_url || undefined,
    usage:
      usage && (typeof usage.completion_tokens === 'number' || typeof usage.total_tokens === 'number')
        ? {
            completionTokens: usage.completion_tokens ?? undefined,
            totalTokens: usage.total_tokens ?? undefined,
          }
        : undefined,
  }
}

async function submitWithProtocol(protocol: VideoProtocol, params: SubmitVideoParams, signal?: AbortSignal) {
  if (protocol === 'openai-videos') {
    const response = await videoRequest(
      'POST',
      `${KOD_VIDEO_UPSTREAM.apiHost}/videos`,
      buildOpenAIVideosBody(params),
      signal
    )
    return normalizeOpenAIVideosResponse((await response.json()) as Record<string, unknown>)
  }
  const response = await videoRequest(
    'POST',
    `${volcTasksBase(KOD_VIDEO_UPSTREAM.apiHost)}/contents/generations/tasks`,
    buildVolcengineTasksBody(params),
    signal
  )
  return normalizeVolcengineTasksResponse((await response.json()) as Record<string, unknown>)
}

export async function submitVideoTask(params: SubmitVideoParams, signal?: AbortSignal) {
  const cached = protocolCache.get(KOD_VIDEO_UPSTREAM.apiHost)
  const preferred = cached ?? 'openai-videos'
  try {
    const task = await submitWithProtocol(preferred, params, signal)
    protocolCache.set(KOD_VIDEO_UPSTREAM.apiHost, preferred)
    return task
  } catch (error) {
    if (cached || !isNotFoundError(error)) throw error
  }
  const task = await submitWithProtocol('volcengine-tasks', params, signal)
  protocolCache.set(KOD_VIDEO_UPSTREAM.apiHost, 'volcengine-tasks')
  return task
}

async function fetchWithProtocol(protocol: VideoProtocol, taskId: string, signal?: AbortSignal) {
  const url =
    protocol === 'openai-videos'
      ? `${KOD_VIDEO_UPSTREAM.apiHost}/videos/${taskId}`
      : `${volcTasksBase(KOD_VIDEO_UPSTREAM.apiHost)}/contents/generations/tasks/${taskId}`
  const response = await videoRequest('GET', url, undefined, signal)
  const json = (await response.json()) as Record<string, unknown>
  return protocol === 'openai-videos' ? normalizeOpenAIVideosResponse(json) : normalizeVolcengineTasksResponse(json)
}

export async function fetchVideoTask(taskId: string, signal?: AbortSignal) {
  const cached = protocolCache.get(KOD_VIDEO_UPSTREAM.apiHost)
  const preferred = cached ?? 'openai-videos'
  try {
    return await fetchWithProtocol(preferred, taskId, signal)
  } catch (error) {
    if (cached || preferred !== 'openai-videos' || !isNotFoundError(error)) throw error
  }
  const task = await fetchWithProtocol('volcengine-tasks', taskId, signal)
  protocolCache.set(KOD_VIDEO_UPSTREAM.apiHost, 'volcengine-tasks')
  return task
}

function abortableSleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Polling aborted', 'AbortError'))
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Polling aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function pollVideoTaskUntilComplete(
  taskId: string,
  options?: { signal?: AbortSignal; onPoll?: (task: NormalizedVideoTask) => void | Promise<void> }
) {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= 30 * 60 * 1000) {
    const task = await fetchVideoTask(taskId, options?.signal)
    await options?.onPoll?.(task)
    if (task.status === 'completed' || task.status === 'failed') return task
    await abortableSleep(2000, options?.signal)
  }
  throw new Error('Video generation timed out')
}

export async function downloadVideoAsDataUrl(taskId: string, videoUrl: string, signal?: AbortSignal) {
  const protocol = protocolCache.get(KOD_VIDEO_UPSTREAM.apiHost) ?? 'openai-videos'
  const urls = [
    { url: videoUrl, authenticated: false },
    ...(protocol === 'openai-videos'
      ? [{ url: `${KOD_VIDEO_UPSTREAM.apiHost}/videos/${taskId}/content`, authenticated: true }]
      : []),
  ]
  let lastError: unknown
  for (const candidate of urls) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(candidate.url, {
          headers: candidate.authenticated ? { Authorization: `Bearer ${KOD_VIDEO_UPSTREAM.apiKey}` } : undefined,
          signal,
        })
        if (!response.ok) throw new Error(`Download video failed: HTTP ${response.status}`)
        const blob = await response.blob()
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(blob)
        })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error
        lastError = error
        if (attempt < 2) await abortableSleep(1000 * 2 ** attempt, signal)
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('视频下载失败')
}

export function getVideoServiceErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.startsWith('内容未通过版权检查：')) return message
  if (isVideoCopyrightRestriction(message)) {
    const requestId = message.match(/request id:\s*([a-z0-9]+)/i)?.[1]
    return `内容未通过版权检查：描述或参考图可能包含受版权保护的影视、动漫、游戏角色。请改用原创角色和原创场景后重新生成。${requestId ? `（请求编号：${requestId}）` : ''}`
  }
  if (/401|403|unauthorized|forbidden/i.test(message)) return '视频服务认证失败，请联系管理员更新视频通道配置。'
  if (/404|not found/i.test(message)) return '视频服务接口暂不可用，请稍后重试。'
  if (/timed out|timeout/i.test(message)) return '视频生成超时，任务可能仍在处理中，请稍后从历史记录重试。'
  if (/network|fetch|connect|econn|dns/i.test(message)) return '无法连接视频服务，请检查网络后重试。'
  return message || '视频服务暂不可用，请稍后重试。'
}

export function isVideoCopyrightRestriction(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /SY_ERR:wechat_75|copyright restrictions?|版权(?:限制|检查|保护)|著作权/i.test(message)
}
