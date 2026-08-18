import { Badge, Button, Card, Group, SegmentedControl, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import type { Language } from '@shared/types'
import { IconLogout, IconSettings, IconSwitch, IconUserCircle, IconWallet } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Page from '@/components/layout/Page'
import { languageNameMap, languages } from '@/i18n/locales'
import { computeAccountQueryKey, getComputeAccount } from '@/packages/computeCenter'
import { useAccountSessionSnapshot } from '@/packages/session/accountSession'
import { EmailCodeLoginModal } from '@/routes/settings/provider/chatbox-ai/-components/EmailCodeLoginModal'
import type { AuthTokens } from '@/routes/settings/provider/chatbox-ai/-components/types'
import { useAuthTokens } from '@/routes/settings/provider/chatbox-ai/-components/useAuthTokens'
import { useLanguage, useSettingsStore } from '@/stores/settingsStore'

export const Route = createFileRoute('/mobile-my')({ component: MobileMyPage })

const roleLabels: Record<string, string> = {
  BUYER: '购买方',
  SUPPLIER: '已认证供应方',
  ADMIN: '算力管理员',
}

function amount(value?: number) {
  return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

function cardHours(value?: number) {
  return `${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} 卡时`
}

function MobileAssetMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={700}>{value}</Text>
    </div>
  )
}

export function MobileMyPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const language = useLanguage()
  const setSettings = useSettingsStore((state) => state.setSettings)
  const session = useAccountSessionSnapshot()
  const { clearAuthTokens, switchAccount } = useAuthTokens()
  const isLoggedIn = session.authenticated
  const accountQuery = useQuery({
    queryKey: computeAccountQueryKey,
    queryFn: getComputeAccount,
    enabled: isLoggedIn,
  })
  const account = accountQuery.data
  const email = session.account?.email || account?.email
  const roles = session.account?.roles.length ? session.account.roles : account?.roles || []
  const [switchAccountOpened, setSwitchAccountOpened] = useState(false)

  const completeAccountSwitch = async (tokens: AuthTokens) => {
    await switchAccount(tokens)
    setSwitchAccountOpened(false)
  }

  const logout = () => {
    if (!window.confirm(String(t('Are you sure you want to log out?')))) return
    clearAuthTokens()
  }

  return (
    <Page title={t('Mine')}>
      <Stack p="md" pb="calc(5.5rem + var(--mobile-safe-area-inset-bottom, 0px))" gap="md">
        <Card withBorder radius="lg" padding="lg">
          <Stack gap="md">
            <Group wrap="nowrap" align="flex-start">
              <ThemeIcon size={44} radius="xl" variant="light">
                <IconUserCircle size={26} />
              </ThemeIcon>
              <div>
                <Title order={4}>{email || t('Not logged in to KOD')}</Title>
                <Text size="sm" c="kod-tertiary">
                  {t('The Android app and desktop app use the same KOD account.')}
                </Text>
                {roles.length > 0 && (
                  <Group gap={6} mt="xs">
                    {roles.map((role) => (
                      <Badge key={role} size="sm" variant="light">
                        {roleLabels[role] || role}
                      </Badge>
                    ))}
                  </Group>
                )}
              </div>
            </Group>

            <Group justify="flex-end" gap="xs">
              <Button
                size="xs"
                variant="light"
                leftSection={<IconSwitch size={16} />}
                onClick={() => setSwitchAccountOpened(true)}
              >
                {isLoggedIn ? t('Switch account') : t('Login to KOD AI')}
              </Button>
              {isLoggedIn && (
                <Button size="xs" variant="light" color="red" leftSection={<IconLogout size={16} />} onClick={logout}>
                  {t('Log out')}
                </Button>
              )}
            </Group>
          </Stack>
        </Card>

        {isLoggedIn && (
          <Card withBorder radius="lg" padding="lg">
            <Group justify="space-between" mb="md">
              <Text fw={700}>我的资产与收益</Text>
              <Button
                size="compact-xs"
                variant="subtle"
                loading={accountQuery.isFetching}
                onClick={() => void accountQuery.refetch()}
              >
                {accountQuery.isError ? '重新同步' : '刷新'}
              </Button>
            </Group>
            {!account && accountQuery.isPending ? (
              <Text size="sm" c="dimmed">
                正在同步资产与收益…
              </Text>
            ) : !account && accountQuery.isError ? (
              <Text size="sm" c="red">
                资产与收益同步失败，请检查网络后重试。
              </Text>
            ) : account ? (
              <>
                {accountQuery.isError && (
                  <Text size="sm" c="orange" mb="sm">
                    最新资产同步失败，当前显示上次成功同步的数据。
                  </Text>
                )}
                <SimpleGrid cols={3} spacing="md">
                  <MobileAssetMetric label="人民币余额" value={`¥${amount(account.cnyBalance)}`} />
                  <MobileAssetMetric label="可用卡时" value={cardHours(account.availableCardHours)} />
                  <MobileAssetMetric label="冻结卡时" value={cardHours(account.frozenCardHours)} />
                  <MobileAssetMetric label="累计收益" value={`¥${amount(account.totalIncomeCny)}`} />
                  <MobileAssetMetric label="租金收益" value={cardHours(account.rentalIncome)} />
                  <MobileAssetMetric label="运行中 GPU" value={account.gpuAssetCounts?.RUNNING || 0} />
                  <MobileAssetMetric label="待审核 GPU" value={account.gpuAssetCounts?.PENDING || 0} />
                  <MobileAssetMetric label="待处理" value={account.gpuAssetCounts?.PENDING_ACTION || 0} />
                </SimpleGrid>
              </>
            ) : null}
          </Card>
        )}

        <Card withBorder radius="md" padding="md">
          <Text fw={700} mb="xs">
            {t('Language')}
          </Text>
          <SegmentedControl
            fullWidth
            value={language}
            onChange={(value) => setSettings({ language: value as Language })}
            data={languages.map((value) => ({ value, label: languageNameMap[value] }))}
          />
        </Card>

        <SimpleGrid cols={2} spacing="sm">
          <Button
            variant="light"
            leftSection={<IconWallet size={18} />}
            onClick={() => navigate({ to: '/settings/wallet' })}
          >
            {t('RMB Wallet')}
          </Button>
          <Button
            variant="light"
            leftSection={<IconSettings size={18} />}
            onClick={() => navigate({ to: '/settings' })}
          >
            {t('Settings')}
          </Button>
        </SimpleGrid>
      </Stack>

      <EmailCodeLoginModal
        opened={switchAccountOpened}
        onClose={() => setSwitchAccountOpened(false)}
        language={language}
        onLoginSuccess={completeAccountSwitch}
      />
    </Page>
  )
}
