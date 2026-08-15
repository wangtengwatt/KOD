import type { VideoGeneration, VideoGenerationModel } from '@shared/types'
import { walletApi } from '@/api/wallet'
import {
  downloadVideoAsDataUrl,
  getVideoServiceErrorMessage,
  pollVideoTaskUntilComplete,
  submitVideoTask,
} from '@/packages/model-calls/generate-video'
import storage from '@/storage'
import { StorageKeyGenerator } from '@/storage/StoreStorage'
import { authInfoStore } from '@/stores/authInfoStore'
import { queryClient } from './queryClient'
import {
  createVideoRecord,
  getVideoRecord,
  updateVideoRecord,
  VIDEO_GEN_LIST_QUERY_KEY,
  VIDEO_GEN_QUERY_KEY,
  videoGenerationStore,
} from './videoGenerationStore'

export class VideoLoginRequiredError extends Error {
  constructor() {
    super('请先登录 KOD 账号后再使用官方视频生成服务。')
    this.name = 'VideoLoginRequiredError'
  }
}

export class VideoBalanceInsufficientError extends Error {
  constructor() {
    super('KOD 钱包余额不足，请充值后再生成视频。')
    this.name = 'VideoBalanceInsufficientError'
  }
}

export interface GenerateVideoParams {
  prompt: string
  referenceImages: string[]
  model: VideoGenerationModel
  duration: 5 | 10
  resolution: '480p' | '720p'
  ratio: '16:9'
}

let activeController: AbortController | null = null

async function assertOfficialVideoAvailable() {
  if (!authInfoStore.getState().accessToken) throw new VideoLoginRequiredError()
  try {
    const wallet = await walletApi.getWallet()
    if (wallet.balance <= 0) throw new VideoBalanceInsufficientError()
  } catch (error) {
    if (error instanceof VideoBalanceInsufficientError) throw error
    // Match fd4e961: wallet service failure must not take the independent video provider down.
    console.warn('[Video] wallet availability check failed; continuing with upstream provider', error)
  }
}

async function resolveReferenceImages(keys: string[]) {
  const images: string[] = []
  for (const key of keys) {
    const image = await storage.getBlob(key)
    if (image) images.push(image)
  }
  return images
}

async function reportBilling(record: VideoGeneration, taskId: string, tokens: number) {
  if (!authInfoStore.getState().accessToken || tokens <= 0) return
  try {
    const result = await walletApi.reportVideoConsumption({
      requestId: `${record.id}:${taskId}`,
      model: record.model.modelId,
      tokens,
      upstreamTaskId: taskId,
      duration: record.duration,
      resolution: record.resolution,
      hasVideoInput: record.referenceImages.length > 0,
      hasAudio: true,
    })
    await updateVideoRecord(record.id, {
      billedAmount: result.amount,
      billedAt: Date.now(),
      billingError: undefined,
    })
    await queryClient.invalidateQueries({ queryKey: ['wallet'] })
  } catch (error) {
    await updateVideoRecord(record.id, {
      billingError: error instanceof Error ? error.message : String(error),
    })
  }
}

async function runGeneration(record: VideoGeneration) {
  const controller = new AbortController()
  activeController = controller
  try {
    await updateVideoRecord(record.id, { status: 'generating', progress: 0, error: undefined })
    const images = await resolveReferenceImages(record.referenceImages)
    const submitted = await submitVideoTask(
      {
        model: record.model.modelId,
        prompt: record.prompt,
        images: images.length ? images : undefined,
        duration: record.duration,
        resolution: record.resolution,
        ratio: record.ratio,
      },
      controller.signal
    )
    if (!submitted.id) throw new Error('视频服务未返回任务编号。')
    await updateVideoRecord(record.id, { taskId: submitted.id, progress: submitted.progress ?? 5 })

    const finalTask = await pollVideoTaskUntilComplete(submitted.id, {
      signal: controller.signal,
      onPoll: async (task) => {
        if (typeof task.progress === 'number') await updateVideoRecord(record.id, { progress: task.progress })
        await queryClient.invalidateQueries({ queryKey: [VIDEO_GEN_QUERY_KEY] })
      },
    })
    if (finalTask.status === 'failed' || !finalTask.videoUrl) {
      throw new Error(finalTask.errorMessage || '视频生成失败，上游未返回视频。')
    }

    let videoKey = finalTask.videoUrl
    try {
      const dataUrl = await downloadVideoAsDataUrl(finalTask.id, finalTask.videoUrl, controller.signal)
      videoKey = StorageKeyGenerator.video(`video-gen:${record.id}`)
      await storage.setBlob(videoKey, dataUrl)
      queryClient.setQueryData(['blob', videoKey], dataUrl)
    } catch (error) {
      console.warn('[Video] local download failed; retaining the temporary upstream URL', error)
    }

    const tokens = finalTask.usage?.totalTokens ?? finalTask.usage?.completionTokens ?? 0
    const completed = await updateVideoRecord(record.id, {
      status: 'done',
      progress: 100,
      generatedVideos: [videoKey],
      tokensUsed: tokens || undefined,
    })
    if (completed) await reportBilling(completed, finalTask.id, tokens)
  } catch (error) {
    if (!(error instanceof Error && error.name === 'AbortError')) {
      await updateVideoRecord(record.id, { status: 'error', error: getVideoServiceErrorMessage(error) })
    }
  } finally {
    activeController = null
    videoGenerationStore.setState({ currentGeneratingId: null })
    await queryClient.invalidateQueries({ queryKey: [VIDEO_GEN_LIST_QUERY_KEY] })
    await queryClient.invalidateQueries({ queryKey: [VIDEO_GEN_QUERY_KEY] })
  }
}

export async function createAndGenerateVideo(params: GenerateVideoParams) {
  if (videoGenerationStore.getState().currentGeneratingId) throw new Error('已有视频正在生成，请等待当前任务完成。')
  await assertOfficialVideoAvailable()
  const record = await createVideoRecord(params)
  videoGenerationStore.setState({ currentGeneratingId: record.id, currentRecordId: record.id })
  queryClient.setQueryData([VIDEO_GEN_QUERY_KEY, authInfoStore.getState().loginEmail || 'anonymous', record.id], record)
  void runGeneration(record)
  return record.id
}

export async function retryVideoGeneration(id: string) {
  if (videoGenerationStore.getState().currentGeneratingId) throw new Error('已有视频正在生成，请等待当前任务完成。')
  await assertOfficialVideoAvailable()
  const record = await getVideoRecord(id)
  if (!record) throw new Error('找不到这条视频历史记录。')
  const reset = await updateVideoRecord(id, {
    status: 'pending',
    progress: undefined,
    error: undefined,
    taskId: undefined,
    generatedVideos: [],
  })
  if (!reset) throw new Error('无法更新视频历史记录。')
  videoGenerationStore.setState({ currentGeneratingId: id, currentRecordId: id })
  void runGeneration(reset)
}

export function cancelVideoGeneration() {
  activeController?.abort()
  activeController = null
  videoGenerationStore.setState({ currentGeneratingId: null })
}
