import type { RemoteConfig } from '@shared/types'

export type KnowledgeBaseManagedModels = NonNullable<RemoteConfig['knowledge_base_models']>

export interface KnowledgeBaseModelConfigState {
  available: boolean
  models: KnowledgeBaseManagedModels | null
  message: string | null
}

const UNAVAILABLE_MESSAGE = 'KOD AI 知识库托管模型暂未启用，请选择自定义模型。'

function isComplete(models: RemoteConfig['knowledge_base_models']): models is KnowledgeBaseManagedModels {
  return Boolean(models?.embedding.trim() && models.rerank.trim() && models.vision.trim())
}

export async function loadKnowledgeBaseModelConfig(
  fetchConfig: () => Promise<Pick<RemoteConfig, 'knowledge_base_models'>>
): Promise<KnowledgeBaseModelConfigState> {
  try {
    const config = await fetchConfig()
    if (isComplete(config.knowledge_base_models)) {
      return { available: true, models: config.knowledge_base_models, message: null }
    }
  } catch {
    // The managed model configuration is optional. A missing or temporarily older
    // backend must not break the local/custom knowledge-base workflow.
  }
  return { available: false, models: null, message: UNAVAILABLE_MESSAGE }
}
