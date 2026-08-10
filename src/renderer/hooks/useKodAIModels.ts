import { ModelProviderEnum, type ProviderModelInfo } from '@shared/types'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { enrichModelsFromRegistry } from '@/packages/model-registry'
import { fetchKodRelayStationModels, getKodRelayStationConfig } from '@/packages/remote'
import { useAuthInfoStore } from '@/stores/authInfoStore'
import { useProviderSettings } from '@/stores/settingsStore'

const EMPTY_MODELS: ProviderModelInfo[] = []

const useKodAIModels = () => {
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

  const allKodAIModels = accessToken ? data?.models || EMPTY_MODELS : EMPTY_MODELS

  const kodAIModels = useMemo(
    () => allKodAIModels.filter((m) => m.type !== 'image' && !kodSettings?.excludedModels?.includes(m.modelId)),
    [allKodAIModels, kodSettings]
  )

  // 图像生成模型（type === 'image'），分拣到 image 组供 Image Creator / 图片会话使用
  const kodAIImageModels = useMemo(
    () => allKodAIModels.filter((m) => m.type === 'image'),
    [allKodAIModels]
  )

  return {
    allKodAIModels,
    kodAIModels,
    kodAIImageModels,
    ...others,
  }
}

export default useKodAIModels
