import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core'
import type { Language } from '@shared/types'
import {
  IconBell,
  IconBook2,
  IconBrain,
  IconCpu,
  IconLanguage,
  IconLogout,
  IconRefresh,
  IconRobot,
  IconSettings,
  IconSparkles,
  IconSwitch,
  IconUserCircle,
  IconWallet,
} from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/layout/Overlay'
import Page from '@/components/layout/Page'
import { availableLanguages, languageNameMap } from '@/i18n/locales'
import { isAndroidAgentAvailable } from '@/packages/android-agent/native'
import { checkAndroidUpdate, openAndroidUpdate } from '@/packages/androidUpdate'
import { getComputeAccount } from '@/packages/computeCenter'
import { EmailCodeLoginModal } from '@/routes/settings/provider/kod-ai/-components/EmailCodeLoginModal'
import type { AuthTokens } from '@/routes/settings/provider/kod-ai/-components/types'
import { useAuthTokens } from '@/routes/settings/provider/kod-ai/-components/useAuthTokens'
import { authInfoStore, useAuthInfoStore } from '@/stores/authInfoStore'
import { useLanguage, useSettingsStore } from '@/stores/settingsStore'

export const Route = createFileRoute('/mobile-my')({ component: MobileMyPage })

const entries = [
  {
    labelKey: 'Account & Models',
    descriptionKey: 'Login, relay station, node and models',
    path: '/settings/kod-ai',
    icon: IconUserCircle,
  },
  {
    labelKey: 'RMB Wallet',
    descriptionKey: 'Balance, top-up and transactions',
    path: '/settings/wallet',
    icon: IconWallet,
  },
  {
    labelKey: 'Compute Center',
    descriptionKey: 'Assets, income, GPU and orders',
    path: '/compute-center',
    icon: IconCpu,
  },
  {
    labelKey: 'Knowledge Base',
    descriptionKey: 'Import phone files and manage knowledge',
    path: '/settings/knowledge-base',
    icon: IconBook2,
  },
  { labelKey: 'MCP Services', descriptionKey: 'Connect remote HTTP/SSE MCP', path: '/settings/mcp', icon: IconBrain },
  {
    labelKey: 'Suanbao Settings',
    descriptionKey: 'Overlay window, permissions and proactive abilities',
    path: '/settings/suanbao',
    icon: IconSparkles,
  },
  {
    labelKey: 'Notifications',
    descriptionKey: 'Reviews, orders, quota and referral notifications',
    path: '/compute-center',
    icon: IconBell,
  },
  {
    labelKey: 'All Settings',
    descriptionKey: 'Appearance, default models and privacy settings',
    path: '/settings',
    icon: IconSettings,
  },
] as const

function formatAmount(locale: string, value: number | undefined, digits = 3) {
  return Number(value || 0).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

const roleLabels = {
  BUYER: { label: '购买方', color: 'blue' },
  SUPPLIER: { label: '已认证供应方', color: 'teal' },
  ADMIN: { label: '算力管理员', color: 'violet' },
} as const

function MobileMyPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const language = useLanguage()
  const setSettings = useSettingsStore((state) => state.setSettings)
  const { clearAuthTokens, saveAuthTokens } = useAuthTokens()
  const email = useAuthInfoStore((state) => state.loginEmail)
  const accessToken = useAuthInfoStore((state) => state.accessToken)
  const refreshToken = useAuthInfoStore((state) => state.refreshToken)
  const isLoggedIn = Boolean(accessToken && refreshToken)
  const account = useQuery({
    queryKey: ['compute', 'account'],
    queryFn: getComputeAccount,
    enabled: isLoggedIn,
    networkMode: 'always',
    refetchOnMount: 'always',
    retry: 1,
  })
  const accountEmail = account.data?.email?.trim().toLowerCase() || null
  const displayEmail = email || accountEmail

  useEffect(() => {
    if (!email && accountEmail && accessToken && refreshToken) {
      authInfoStore.getState().setTokens({ accessToken, refreshToken, email: accountEmail })
    }
  }, [accessToken, accountEmail, email, refreshToken])
  const [updateMessage, setUpdateMessage] = useState('')
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [switchAccountOpened, setSwitchAccountOpened] = useState(false)
  const [logoutConfirmOpened, setLogoutConfirmOpened] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const switchAccount = async (tokens: AuthTokens) => {
    await clearAuthTokens({ preserveAccountData: true })
    await saveAuthTokens(tokens)
    setSwitchAccountOpened(false)
  }

  const logout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await clearAuthTokens({ preserveAccountData: true })
      setLogoutConfirmOpened(false)
    } finally {
      setLoggingOut(false)
    }
  }

  const checkUpdate = async () => {
    setCheckingUpdate(true)
    try {
      const result = await checkAndroidUpdate()
      if (!result.updateAvailable) {
        setUpdateMessage(String(t('You are on the latest version ({{version}})', { version: result.currentVersion })))
        return
      }
      setUpdateMessage(
        String(t('Found a new version {{version}}. Opening the download page.', { version: result.release.version }))
      )
      await openAndroidUpdate(result.release)
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : String(t('Failed to check for updates')))
    } finally {
      setCheckingUpdate(false)
    }
  }

  return (
    <Page title={t('Mine')}>
      <Stack p="md" pb="calc(5.5rem + var(--mobile-safe-area-inset-bottom, 0px))" gap="md">
        <Card withBorder radius="lg" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <Group wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                <ThemeIcon size={44} radius="xl" variant="light">
                  <IconUserCircle size={26} />
                </ThemeIcon>
                <div style={{ minWidth: 0 }}>
                  <Title order={4} style={{ overflowWrap: 'anywhere' }}>
                    {displayEmail || (isLoggedIn ? t('Logged in to KOD') : t('Not logged in to KOD'))}
                  </Title>
                  <Text size="sm" c="kod-tertiary">
                    {t('The official website, Android app and Compute Center share the same account and RMB wallet.')}
                  </Text>
                  {account.data && (
                    <Group gap={6} mt="xs">
                      {account.data.roles.map((role) => (
                        <Badge key={role} size="sm" color={roleLabels[role].color}>
                          {roleLabels[role].label}
                        </Badge>
                      ))}
                    </Group>
                  )}
                </div>
              </Group>
              <Badge color={isLoggedIn ? 'green' : 'gray'}>{isLoggedIn ? t('Logged in') : t('Not logged in')}</Badge>
            </Group>

            {isLoggedIn && (
              <Group justify="flex-end" gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconSwitch size={16} />}
                  onClick={() => setSwitchAccountOpened(true)}
                >
                  {t('Switch account')}
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="red"
                  leftSection={<IconLogout size={16} />}
                  onClick={() => setLogoutConfirmOpened(true)}
                >
                  {t('Log out')}
                </Button>
              </Group>
            )}
          </Stack>
        </Card>

        {isLoggedIn && account.isError && (
          <Alert color="red" title="账户数据同步失败">
            <Stack gap="xs">
              <Text size="sm">
                {account.error instanceof Error ? account.error.message : '暂时无法读取线上账户与算力资产。'}
              </Text>
              <Button size="compact-xs" variant="light" color="red" onClick={() => void account.refetch()}>
                重新同步
              </Button>
            </Stack>
          </Alert>
        )}

        {isLoggedIn && account.isPending && (
          <Alert color="blue" title="正在同步账户数据">
            正在从同一 KOD 线上账本读取角色、人民币余额、卡时、收益与 GPU 状态。
          </Alert>
        )}

        {account.data && (
          <Card withBorder radius="lg" padding="md">
            <Group justify="space-between" mb="sm">
              <div>
                <Text fw={700}>{t('My assets and income')}</Text>
                <Text size="xs" c="kod-tertiary">
                  {t('Synced with the desktop app through the same KOD online ledger')}
                </Text>
              </div>
              <Button size="compact-xs" variant="subtle" onClick={() => void account.refetch()}>
                {t('Refresh')}
              </Button>
            </Group>
            <SimpleGrid cols={3} spacing="xs">
              <AssetItem
                label={t('Available card hours')}
                value={formatAmount(language, account.data.availableCardHours)}
              />
              <AssetItem label={t('Frozen card hours')} value={formatAmount(language, account.data.frozenCardHours)} />
              <AssetItem label={t('RMB balance')} value={`¥${formatAmount(language, account.data.cnyBalance, 2)}`} />
              <AssetItem label={t('Lifetime income')} value={formatAmount(language, account.data.lifetimeIncome)} />
              <AssetItem label={t('Rental income')} value={formatAmount(language, account.data.rentalIncome)} />
              <AssetItem label={t('Running GPUs')} value={String(account.data.gpuAssetCounts.RUNNING || 0)} />
              <AssetItem label={t('Pending review GPUs')} value={String(account.data.gpuAssetCounts.PENDING || 0)} />
              <AssetItem
                label={t('Pending delivery')}
                value={String(account.data.gpuAssetCounts.PENDING_DELIVERY || 0)}
              />
              <AssetItem label={t('Pending action')} value={String(account.data.gpuAssetCounts.PENDING_ACTION || 0)} />
            </SimpleGrid>
          </Card>
        )}

        <Alert color="blue" title={t('Mobile permissions')}>
          {t(
            'Suanbao overlay, accessibility and file access are off by default and only requested when you actively use the corresponding feature. Declining a permission does not affect chat, image generation, video or the Compute Center.'
          )}
        </Alert>

        <Card withBorder radius="md" padding="md">
          <Group justify="space-between" mb="xs">
            <Group gap="xs">
              <ThemeIcon variant="light" size={28} radius="md">
                <IconLanguage size={16} />
              </ThemeIcon>
              <Text fw={700}>{t('Language')}</Text>
            </Group>
            <Text size="xs" c="kod-tertiary">
              {t('Simplified Chinese / English / Traditional Chinese')}
            </Text>
          </Group>
          <SegmentedControl
            fullWidth
            value={language}
            onChange={(val) => setSettings({ language: val as Language })}
            data={availableLanguages.map((item) => ({ value: item, label: languageNameMap[item] }))}
          />
        </Card>

        <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
          {entries.map((entry) => {
            const Icon = entry.icon
            return (
              <UnstyledButton key={entry.path} onClick={() => navigate({ to: entry.path })}>
                <Card withBorder radius="md" padding="md" h="100%">
                  <ThemeIcon variant="light" mb="sm">
                    <Icon size={19} />
                  </ThemeIcon>
                  <Text fw={700}>{t(entry.labelKey)}</Text>
                  <Text size="xs" c="kod-tertiary" mt={4}>
                    {t(entry.descriptionKey)}
                  </Text>
                </Card>
              </UnstyledButton>
            )
          })}

          {isAndroidAgentAvailable() && (
            <UnstyledButton onClick={() => navigate({ to: '/android-agent' })}>
              <Card withBorder radius="md" padding="md" h="100%">
                <ThemeIcon variant="light" color="violet" mb="sm">
                  <IconRobot size={19} />
                </ThemeIcon>
                <Text fw={700}>{t('Suanbao Assistant')}</Text>
                <Text size="xs" c="kod-tertiary" mt={4}>
                  {t('Phone tasks, overlay window and permission management')}
                </Text>
              </Card>
            </UnstyledButton>
          )}
        </SimpleGrid>

        <Card withBorder radius="md" padding="md">
          <Group justify="space-between">
            <div>
              <Text fw={700}>{t('App Update')}</Text>
              <Text size="xs" c="kod-tertiary">
                {t('Only official signed packages from the KOD website are used.')}
              </Text>
            </div>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconRefresh size={16} />}
              loading={checkingUpdate}
              onClick={() => void checkUpdate()}
            >
              {t('Check for updates')}
            </Button>
          </Group>
          {updateMessage && (
            <Text size="xs" mt="sm">
              {updateMessage}
            </Text>
          )}
        </Card>
      </Stack>

      <EmailCodeLoginModal
        opened={switchAccountOpened}
        onClose={() => setSwitchAccountOpened(false)}
        language={language}
        defaultIsFirstLogin={false}
        onLoginSuccess={switchAccount}
      />

      <Modal
        opened={logoutConfirmOpened}
        onClose={() => {
          if (!loggingOut) setLogoutConfirmOpened(false)
        }}
        centered
        title="确认退出登录"
        closeOnClickOutside={!loggingOut}
        closeOnEscape={!loggingOut}
        withCloseButton={!loggingOut}
      >
        <Stack gap="md">
          <Text size="sm">退出后需要重新登录才能使用账户钱包、零售站、节点与算力中心。</Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="light" color="gray" disabled={loggingOut} onClick={() => setLogoutConfirmOpened(false)}>
              取消
            </Button>
            <Button color="red" loading={loggingOut} onClick={() => void logout()}>
              确认退出
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Page>
  )
}

function AssetItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text size="xs" c="kod-tertiary">
        {label}
      </Text>
      <Text fw={700} size="sm">
        {value}
      </Text>
    </div>
  )
}
