/**
 * 该文件已废弃（采用了新的配置入口），请使用 `src/renderer/routes/settings/kod-ai.tsx` 文件代替
 */

import { Stack } from '@mantine/core'
import { type ModelProvider, ModelProviderEnum } from '@shared/types'
import { createFileRoute } from '@tanstack/react-router'
import useKodAIModels from '@/hooks/useKodAIModels'
import { useLanguage, useProviderSettings } from '@/stores/settingsStore'
import { deleteCurrentKodAccount } from './-components/accountDeletion'
import { LoggedInView } from './-components/LoggedInView'
import { LoginView } from './-components/LoginView'
import { ModelManagement } from './-components/ModelManagement'
import { useAuthTokens } from './-components/useAuthTokens'

export const Route = createFileRoute('/settings/provider/kod-ai/')({
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
        <LoggedInView onLogout={clearAuthTokens} onDeleteAccount={deleteCurrentKodAccount} />
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
