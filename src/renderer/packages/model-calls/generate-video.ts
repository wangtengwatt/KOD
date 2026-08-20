import { VideoGenerationApiError, type VideoProxyTask, videoGenerationApi } from '@/api/videoGeneration'

export interface NormalizedVideoTask {
  id: string
  status: 'queued' | 'in_progress' | 'completed' | 'failed'
  progress?: number
  errorMessage?: string
  errorCode?: string
}

export interface SubmitVideoParams {
  model: string
  prompt: string
  images?: string[]
  duration: 5 | 10
  resolution: '480p' | '720p'
  ratio: '16:9'
}

export function getVideoAvailability(signal?: AbortSignal) {
  return videoGenerationApi.availability(signal)
}

export async function submitVideoTask(params: SubmitVideoParams, signal?: AbortSignal) {
  const task = await videoGenerationApi.submit(
    {
      prompt: params.prompt,
      model: params.model,
      durationSeconds: params.duration,
      resolution: params.resolution,
      ratio: params.ratio,
      referenceImages: params.images || [],
    },
    signal
  )
  return normalizeTask(task)
}

export async function fetchVideoTask(taskId: string, signal?: AbortSignal) {
  return normalizeTask(await videoGenerationApi.status(taskId, signal))
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
  throw new Error('视频生成超时，任务可能仍在处理中，请稍后从历史记录重试。')
}

export async function downloadVideoAsDataUrl(taskId: string, signal?: AbortSignal) {
  return blobToDataUrl(await videoGenerationApi.content(taskId, signal))
}

export function getVideoServiceErrorMessage(error: unknown) {
  if (error instanceof VideoGenerationApiError) {
    if (error.code === 402) return 'KOD 钱包余额不足，请充值后再生成视频。'
    if (error.code === 401 || error.code === 403) return '登录状态已失效，请重新登录 KOD 账号。'
    if (error.code === 429) return '视频任务正在处理中或服务繁忙，请稍后重试。'
    if (error.code === 503) return error.message || 'KOD 视频服务尚未启用，请联系管理员配置。'
    return error.message || '视频服务暂不可用，请稍后重试。'
  }
  const message = error instanceof Error ? error.message : String(error)
  if (message.startsWith('内容未通过版权检查：')) return message
  if (isVideoCopyrightRestriction(message)) {
    const requestId = message.match(/request id:\s*([a-z0-9]+)/i)?.[1]
    return `内容未通过版权检查：描述或参考图可能包含受版权保护的影视、动漫、游戏角色。请改用原创角色和原创场景后重新生成。${requestId ? `（请求编号：${requestId}）` : ''}`
  }
  if (/timed out|timeout|超时/i.test(message)) return '视频生成超时，任务可能仍在处理中，请稍后从历史记录重试。'
  if (/network|fetch|connect|econn|dns|网络/i.test(message)) return '无法连接 KOD 视频服务，请检查网络后重试。'
  return message || '视频服务暂不可用，请稍后重试。'
}

export function isVideoCopyrightRestriction(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /SY_ERR:wechat_75|copyright restrictions?|版权(?:限制|检查|保护)|著作权/i.test(message)
}

function normalizeTask(task: VideoProxyTask): NormalizedVideoTask {
  const status: NormalizedVideoTask['status'] =
    task.status === 'SUCCEEDED'
      ? 'completed'
      : task.status === 'FAILED' || task.status === 'BILLING_FAILED'
        ? 'failed'
        : task.status === 'IN_PROGRESS'
          ? 'in_progress'
          : 'queued'
  return {
    id: task.publicTaskId,
    status,
    progress: task.progress,
    errorCode: task.errorCode || undefined,
    errorMessage: task.errorMessage || undefined,
  }
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

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
