/**
 * 该文件已废弃（采用了新的配置入口），请使用 `src/renderer/routes/settings/chatbox-ai.tsx` 文件代替
 */

import { Stack } from '@mantine/core'
import { type ModelProvider, ModelProviderEnum } from '@shared/types'
import { createFileRoute } from '@tanstack/react-router'
import useChatboxAIModels from '@/hooks/useChatboxAIModels'
import { useLanguage, useProviderSettings } from '@/stores/settingsStore'
import { deleteCurrentKodAccount } from './-components/accountDeletion'
import { LoggedInView } from './-components/LoggedInView'
import { LoginView } from './-components/LoginView'
import { ModelManagement } from './-components/ModelManagement'
import { useAuthTokens } from './-components/useAuthTokens'

export const Route = createFileRoute('/settings/provider/chatbox-ai/')({
  component: RouteComponent,
})

export function RouteComponent() {
  const language = useLanguage()
  const providerId: ModelProvider = ModelProviderEnum.ChatboxAI
  const { providerSettings, setProviderSettings } = useProviderSettings(providerId)
  const { isLoggedIn, clearAuthTokens, saveAuthTokens } = useAuthTokens()
  const { allChatboxAIModels, chatboxAIModels, refetch: refetchChatboxAIModels } = useChatboxAIModels()

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
        chatboxAIModels={chatboxAIModels}
        allChatboxAIModels={allChatboxAIModels}
        onDeleteModel={deleteModel}
        onResetModels={resetModels}
        onFetchModels={() => {
          void refetchChatboxAIModels()
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
