import { ModelProviderEnum } from '@shared/types'
import { purgeSuanbaoPreferences } from '@/components/suanbao/suanbaoStore'
import { clearKodRelayLocalState } from '@/hooks/useKodRelay'
import { deleteKodAccount } from '@/packages/remote'
import { accountSessionService } from '@/packages/session/accountSession'
import { closeSuanbaoRepository, getSuanbaoRepository } from '@/packages/suanbao/repositories/createSuanbaoRepository'
import { suanbaoRuntime } from '@/packages/suanbao/runtime'
import { deriveAccountKey } from '@/storage/accountKey'
import { purgeCurrentAccountData, resetMetaStorage } from '@/stores/chatStore'
import { purgeImageGenerationData, resetImageGenerationStorage } from '@/stores/imageGenerationStore'
import queryClient from '@/stores/queryClient'
import { settingsStore } from '@/stores/settingsStore'
import { purgeTaskSessionData, resetTaskSessionStorage } from '@/stores/taskSessionStore'

export const ACCOUNT_DELETE_CONFIRMATION = '确认删除'
const SERVER_ACCOUNT_DELETE_CONFIRMATION = 'DELETE'

export function canDeleteAccount(password: string, confirmation: string, acknowledged: boolean): boolean {
  return password.length > 0 && confirmation === ACCOUNT_DELETE_CONFIRMATION && acknowledged
}

export class AccountDeletedWithCleanupError extends Error {
  readonly serverAccountDeleted = true
  constructor(readonly cleanupErrors: unknown[]) {
    super('账号已删除，但部分本地数据未能清除。当前账号已退出，请重启应用或手动清理剩余数据。')
    this.name = 'AccountDeletedWithCleanupError'
  }
}

function clearAccountCaches() {
  clearKodRelayLocalState()
  settingsStore.setState((state) => ({
    hasExpiredLicense: false,
    licenseKey: state.licenseActivationMethod === 'login' ? undefined : state.licenseKey,
    licenseActivationMethod: state.licenseActivationMethod === 'login' ? undefined : state.licenseActivationMethod,
    providers: {
      ...(state.providers || {}),
      [ModelProviderEnum.ChatboxAI]: {
        ...(state.providers?.[ModelProviderEnum.ChatboxAI] || {}),
        apiHost: undefined,
        apiKey: undefined,
        models: [],
        excludedModels: [],
      },
    },
  }))
  queryClient.clear()
}

export async function deleteCurrentKodAccount(password: string): Promise<void> {
  const tokens = accountSessionService.getTokens()
  const email = accountSessionService.getSnapshot().account?.email || tokens?.email
  if (!tokens?.accessToken || !email) throw new Error('KOD 登录信息不可用，请重新登录后再试。')
  const accountKey = deriveAccountKey(email)

  await deleteKodAccount({
    accessToken: tokens.accessToken,
    password,
    confirmation: SERVER_ACCOUNT_DELETE_CONFIRMATION,
  })

  const cleanupErrors: unknown[] = []
  const cleanup = async (work: () => void | Promise<void>) => {
    try {
      await work()
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  await cleanup(async () => {
    await purgeCurrentAccountData()
  })
  await cleanup(() => purgeTaskSessionData(accountKey))
  await cleanup(() => purgeImageGenerationData(accountKey))
  await cleanup(async () => {
    await suanbaoRuntime.close()
    const repository = getSuanbaoRepository(accountKey)
    await closeSuanbaoRepository(accountKey, repository)
    await repository.deleteDatabase()
  })
  await cleanup(() => purgeSuanbaoPreferences(accountKey))
  await cleanup(clearAccountCaches)

  accountSessionService.logout()
  resetMetaStorage()
  resetTaskSessionStorage()
  resetImageGenerationStorage()

  if (cleanupErrors.length) throw new AccountDeletedWithCleanupError(cleanupErrors)
}
