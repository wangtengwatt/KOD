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
  IconRefresh,
  IconRobot,
  IconSettings,
  IconSparkles,
  IconUserCircle,
  IconWallet,
} from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Page from '@/components/layout/Page'
import { availableLanguages, languageNameMap } from '@/i18n/locales'
import { isAndroidAgentAvailable } from '@/packages/android-agent/native'
import { checkAndroidUpdate, openAndroidUpdate } from '@/packages/androidUpdate'
import { getComputeAccount } from '@/packages/computeCenter'
import { useAuthInfoStore } from '@/stores/authInfoStore'
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

function MobileMyPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const email = useAuthInfoStore((state) => state.loginEmail)
  const accessToken = useAuthInfoStore((state) => state.accessToken)
  const language = useLanguage()
  const setSettings = useSettingsStore((state) => state.setSettings)
  const account = useQuery({
    queryKey: ['compute', 'mobile-account', email],
    queryFn: getComputeAccount,
    enabled: Boolean(accessToken),
    retry: 1,
  })
  const [updateMessage, setUpdateMessage] = useState('')
  const [checkingUpdate, setCheckingUpdate] = useState(false)

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
          <Group justify="space-between" align="flex-start">
            <Group>
              <ThemeIcon size={44} radius="xl" variant="light">
                <IconUserCircle size={26} />
              </ThemeIcon>
              <div>
                <Title order={4}>{email || t('Not logged in to KOD')}</Title>
                <Text size="sm" c="kod-tertiary">
                  {t('The official website, Android app and Compute Center share the same account and RMB wallet.')}
                </Text>
              </div>
            </Group>
            <Badge color={email ? 'green' : 'gray'}>{email ? t('Logged in') : t('Not logged in')}</Badge>
          </Group>
        </Card>

        {account.data && (
          <Card withBorder radius="lg" padding="md">
            <Group justify="space-between" mb="sm">
              <Text fw={700}>{t('My assets and income')}</Text>
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
