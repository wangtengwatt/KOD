import { ModelProviderEnum, ModelProviderType, type ProviderModelInfo } from '@shared/types'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getModelManifest, type RemoteModelInfo } from '@/packages/remote'
import { useLanguage, useSettingsStore } from '@/stores/settingsStore'
import useKodAIModels from './useKodAIModels'
import { useProviders } from './useProviders'

export interface ImageModelOption {
  modelId: string
  displayName: string
}

export interface ImageModelGroup {
  label: string
  providerId: string
  isCustom?: boolean
  models: ImageModelOption[]
}

function remoteImageModelToOption(model: RemoteModelInfo): ImageModelOption {
  return {
    modelId: model.modelId,
    displayName: model.modelName || model.modelId,
  }
}

function manualImageModelToOption(model: ProviderModelInfo): ImageModelOption {
  return {
    modelId: model.modelId,
    displayName: model.nickname || model.modelId,
  }
}

function providerModelToOption(model: ProviderModelInfo): ImageModelOption {
  return {
    modelId: model.modelId,
    displayName: model.nickname || model.modelId,
  }
}

function mergeImageModels(remoteModels: ImageModelOption[], manualModels: ImageModelOption[]): ImageModelOption[] {
  const modelsById = new Map<string, ImageModelOption>()
  for (const model of remoteModels) {
    modelsById.set(model.modelId, model)
  }
  for (const model of manualModels) {
    modelsById.set(model.modelId, {
      ...modelsById.get(model.modelId),
      ...model,
    })
  }
  return [...modelsById.values()]
}

function preferChatboxDefaultImageModel(models: ImageModelOption[]): ImageModelOption[] {
  // Kod AI 生图走中转站 /v1/chat/completions（Gemini imagine），优先选网关白名单内的图片模型
  const preferredIds = [
    'gemini-2.5-flash-image',
    'gemini-3-pro-image-preview',
    'gemini-3.1-flash-image-preview',
    'gemini-2.0-flash-exp-image-generation',
  ]
  for (const preferredModelId of preferredIds) {
    const preferredModel = models.find((model) => model.modelId === preferredModelId)
    if (preferredModel) {
      return [preferredModel, ...models.filter((model) => model.modelId !== preferredModelId)]
    }
  }
  const geminiImage = models.find((model) => /gemini/i.test(model.modelId) && /image/i.test(model.modelId))
  if (geminiImage) {
    return [geminiImage, ...models.filter((model) => model.modelId !== geminiImage.modelId)]
  }
  return models
}

export function useProviderImageModels(provider: ModelProviderEnum, enabled: boolean): ImageModelOption[] {
  const language = useLanguage()
  const licenseKey = useSettingsStore((state) => state.licenseKey)

  const { data } = useQuery({
    queryKey: [
      'provider-image-models',
      provider,
      language,
      provider === ModelProviderEnum.ChatboxAI ? licenseKey || '' : '',
    ],
    enabled,
    staleTime: 3600 * 1000,
    queryFn: async () => {
      const manifest = await getModelManifest({
        aiProvider: provider,
        language,
        licenseKey: provider === ModelProviderEnum.ChatboxAI ? licenseKey : undefined,
      })
      return manifest.imageModels.map(remoteImageModelToOption)
    },
  })

  return data || []
}

export function useImageModelGroups(): ImageModelGroup[] {
  const { providers } = useProviders()
  const { kodAIImageModels } = useKodAIModels()
  const providerSettingsMap = useSettingsStore((state) => state.providers)

  const chatboxProvider = providers.find((p) => p.id === ModelProviderEnum.ChatboxAI)
  const openAIProvider = providers.find((p) => p.id === ModelProviderEnum.OpenAI)
  const geminiProvider = providers.find((p) => p.id === ModelProviderEnum.Gemini)
  const customGeminiProviders = providers.filter((p) => p.isCustom && p.type === ModelProviderType.Gemini)

  const openAIImageModels = useProviderImageModels(ModelProviderEnum.OpenAI, !!openAIProvider)
  const geminiImageModels = useProviderImageModels(
    ModelProviderEnum.Gemini,
    !!geminiProvider || customGeminiProviders.length > 0
  )

  return useMemo(() => {
    const groups: ImageModelGroup[] = []
    if (chatboxProvider) {
      const excluded = new Set(providerSettingsMap?.[ModelProviderEnum.ChatboxAI]?.excludedModels || [])
      const models = preferChatboxDefaultImageModel(
        kodAIImageModels.map(providerModelToOption).filter((model) => !excluded.has(model.modelId))
      )
      if (models.length > 0) {
        groups.push({
          label: chatboxProvider.name,
          providerId: chatboxProvider.id,
          models,
        })
      }
    }

    if (geminiProvider) {
      const manualModels = (providerSettingsMap?.[geminiProvider.id]?.models || [])
        .filter((model) => model.type === 'image')
        .map(manualImageModelToOption)
      const models = mergeImageModels(geminiImageModels, manualModels)
      if (models.length > 0) {
        groups.push({
          label: geminiProvider.name,
          providerId: geminiProvider.id,
          models,
        })
      }
    }

    for (const provider of customGeminiProviders) {
      const manualModels = (providerSettingsMap?.[provider.id]?.models || [])
        .filter((model) => model.type === 'image')
        .map(manualImageModelToOption)
      const models = mergeImageModels(geminiImageModels, manualModels)
      if (models.length > 0) {
        groups.push({
          label: provider.name,
          providerId: provider.id,
          isCustom: true,
          models,
        })
      }
    }

    if (openAIProvider) {
      const manualModels = (providerSettingsMap?.[openAIProvider.id]?.models || [])
        .filter((model) => model.type === 'image')
        .map(manualImageModelToOption)
      const models = mergeImageModels(openAIImageModels, manualModels)
      if (models.length > 0) {
        groups.push({
          label: openAIProvider.name,
          providerId: openAIProvider.id,
          models,
        })
      }
    }

    return groups
  }, [
    chatboxProvider,
    openAIProvider,
    geminiProvider,
    customGeminiProviders,
    providerSettingsMap,
    kodAIImageModels,
    openAIImageModels,
    geminiImageModels,
  ])
}
