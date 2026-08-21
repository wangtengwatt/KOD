import { describe, expect, it } from 'vitest'
import { loadKnowledgeBaseModelConfig } from './knowledgeBaseModelConfig'

const managedModels = {
  embedding: 'kod-relay:text-embedding-3-small',
  rerank: 'kod-relay:bge-reranker-v2-m3',
  vision: 'kod-relay:gemini-2.5-flash',
}

describe('loadKnowledgeBaseModelConfig', () => {
  it('keeps managed mode when the KOD backend returns a complete model configuration', async () => {
    await expect(
      loadKnowledgeBaseModelConfig(() => Promise.resolve({ knowledge_base_models: managedModels }))
    ).resolves.toEqual({ available: true, models: managedModels, message: null })
  })

  it('falls back to custom mode without surfacing the backend 500 response', async () => {
    await expect(
      loadKnowledgeBaseModelConfig(() => Promise.reject(new Error('FetchError: 500 No static resource')))
    ).resolves.toEqual({
      available: false,
      models: null,
      message: 'KOD AI 知识库托管模型暂未启用，请选择自定义模型。',
    })
  })

  it('treats an explicitly disabled or incomplete configuration as unavailable', async () => {
    await expect(loadKnowledgeBaseModelConfig(() => Promise.resolve({ knowledge_base_models: null }))).resolves.toEqual(
      {
        available: false,
        models: null,
        message: 'KOD AI 知识库托管模型暂未启用，请选择自定义模型。',
      }
    )
    await expect(
      loadKnowledgeBaseModelConfig(() =>
        Promise.resolve({
          knowledge_base_models: { embedding: 'kod-relay:embedding', rerank: '', vision: '' },
        })
      )
    ).resolves.toEqual({
      available: false,
      models: null,
      message: 'KOD AI 知识库托管模型暂未启用，请选择自定义模型。',
    })
  })
})
