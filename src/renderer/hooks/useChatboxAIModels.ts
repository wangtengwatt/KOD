import { ModelProviderEnum, type ProviderModelInfo } from '@shared/types'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { enrichModelsFromRegistry } from '@/packages/model-registry'
import { fetchKodRelayStationModels, getKodRelayStationConfig } from '@/packages/remote'
import { useAuthInfoStore } from '@/stores/authInfoStore'
import { useProviderSettings } from '@/stores/settingsStore'

const EMPTY_MODELS: ProviderModelInfo[] = []

const useChatboxAIModels = () => {
  const accessToken = useAuthInfoStore((state) => state.accessToken)
  const { providerSettings: kodSettings, setProviderSettings } = useProviderSettings(ModelProviderEnum.ChatboxAI)

  const { data, ...others } = useQuery({
    queryKey: ['kod-ai-models', accessToken],
    enabled: Boolean(accessToken),
    queryFn: async () => {
      if (!accessToken) {
        return { models: EMPTY_MODELS }
      }

      const relayStation = await getKodRelayStationConfig(accessToken)
      const fetchedModels = await fetchKodRelayStationModels(relayStation)
      const models = enrichModelsFromRegistry(fetchedModels, ModelProviderEnum.ChatboxAI)

      setProviderSettings((previousSettings) => ({
        ...previousSettings,
        apiHost: relayStation.url,
        apiKey: relayStation.apiKey,
        models,
        excludedModels: previousSettings?.excludedModels?.filter((modelId) =>
          models.some((m) => m.modelId === modelId)
        ),
      }))

      return { relayStation, models }
    },
    staleTime: 3600 * 1000,
    retry: 1,
  })

  const allChatboxAIModels = accessToken ? data?.models || EMPTY_MODELS : EMPTY_MODELS

  const chatboxAIModels = useMemo(
    () =>
      allChatboxAIModels.filter(
        (model) =>
          model.type !== 'image' &&
          model.type !== 'video' &&
          !kodSettings?.excludedModels?.includes(model.modelId)
      ),
    [allChatboxAIModels, kodSettings]
  )

  const chatboxAIImageModels = useMemo(
    () => allChatboxAIModels.filter((model) => model.type === 'image'),
    [allChatboxAIModels]
  )

  const chatboxAIVideoModels = useMemo(
    () => allChatboxAIModels.filter((model) => model.type === 'video'),
    [allChatboxAIModels]
  )

  return {
    allChatboxAIModels,
    chatboxAIModels,
    chatboxAIImageModels,
    chatboxAIVideoModels,
    ...others,
  }
}

export default useChatboxAIModels
