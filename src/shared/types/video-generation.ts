export type VideoGenerationStatus = 'pending' | 'generating' | 'done' | 'error'

export interface VideoGenerationModel {
  provider: string
  modelId: string
}

export interface VideoGeneration {
  id: string
  prompt: string
  referenceImages: string[]
  generatedVideos: string[]
  createdAt: number
  model: VideoGenerationModel
  status: VideoGenerationStatus
  progress?: number
  duration: 5 | 10
  resolution: '480p' | '720p'
  ratio: '16:9'
  error?: string
  taskId?: string
  tokensUsed?: number
  billedAmount?: number
  billedAt?: number
  billingError?: string
}
