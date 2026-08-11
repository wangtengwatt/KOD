import { Stack } from '@mantine/core'
import { type ModelProvider, ModelProviderEnum } from '@shared/types'
import { createFileRoute } from '@tanstack/react-router'
import useKodAIModels from '@/hooks/useKodAIModels'
import { useLanguage, useProviderSettings } from '@/stores/settingsStore'
import { LoggedInView } from './provider/kod-ai/-components/LoggedInView'
import { LoginView } from './provider/kod-ai/-components/LoginView'
import { ModelManagement } from './provider/kod-ai/-components/ModelManagement'
import { useAuthTokens } from './provider/kod-ai/-components/useAuthTokens'

export const Route = createFileRoute('/settings/kod-ai')({
  component: RouteComponent,
})

export function RouteComponent() {
  const language = useLanguage()
  const providerId: ModelProvider = ModelProviderEnum.ChatboxAI
  const { providerSettings, setProviderSettings } = useProviderSettings(providerId)
  const { isLoggedIn, clearAuthTokens, saveAuthTokens } = useAuthTokens()
  const { allKodAIModels, kodAIModels, refetch: refetchKodAIModels } = useKodAIModels()

  const deleteModel = (modelId: string) => {
    setProviderSettings({
      excludedModels: [...(providerSettings?.excludedModels || []), modelId],
    })
  }

  const resetModels = () => {
    setProviderSettings({
      models: [],
      excludedModels: [],
    })
  }

  return (
    <Stack gap="xxl" p="md">
      {isLoggedIn ? (
        <LoggedInView onLogout={clearAuthTokens} />
      ) : (
        <LoginView language={language} saveAuthTokens={saveAuthTokens} />
      )}

      <ModelManagement
        kodAIModels={kodAIModels}
        allKodAIModels={allKodAIModels}
        onDeleteModel={deleteModel}
        onResetModels={resetModels}
        onFetchModels={() => {
          void refetchKodAIModels()
        }}
        onAddModel={(model) =>
          setProviderSettings({
            excludedModels: (providerSettings?.excludedModels || []).filter((m) => m !== model.modelId),
          })
        }
        onRemoveModel={(modelId) =>
          setProviderSettings({
            excludedModels: [...(providerSettings?.excludedModels || []), modelId],
          })
        }
        showControls={isLoggedIn}
      />
    </Stack>
  )
}
