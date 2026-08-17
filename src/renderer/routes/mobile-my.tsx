import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core'
import {
  IconBell,
  IconBook2,
  IconBrain,
  IconCpu,
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
import { Modal } from '@/components/layout/Overlay'
import Page from '@/components/layout/Page'
import { isAndroidAgentAvailable } from '@/packages/android-agent/native'
import { checkAndroidUpdate, openAndroidUpdate } from '@/packages/androidUpdate'
import { getComputeAccount } from '@/packages/computeCenter'
import { EmailCodeLoginModal } from '@/routes/settings/provider/kod-ai/-components/EmailCodeLoginModal'
import type { AuthTokens } from '@/routes/settings/provider/kod-ai/-components/types'
import { useAuthTokens } from '@/routes/settings/provider/kod-ai/-components/useAuthTokens'
import { authInfoStore, useAuthInfoStore } from '@/stores/authInfoStore'
import { useLanguage } from '@/stores/settingsStore'

export const Route = createFileRoute('/mobile-my')({ component: MobileMyPage })

const entries = [
  { label: '账户与模型', description: '登录、零售站、节点与模型', path: '/settings/kod-ai', icon: IconUserCircle },
  { label: '人民币钱包', description: '余额、充值和交易记录', path: '/settings/wallet', icon: IconWallet },
  { label: '算力中心', description: '资产、收益、GPU 与订单', path: '/compute-center', icon: IconCpu },
  { label: '知识库', description: '导入手机文件并管理知识', path: '/settings/knowledge-base', icon: IconBook2 },
  { label: 'MCP 服务', description: '连接远程 HTTP/SSE MCP', path: '/settings/mcp', icon: IconBrain },
  { label: '蒜宝设置', description: '悬浮窗、权限与主动能力', path: '/settings/suanbao', icon: IconSparkles },
  { label: '通知中心', description: '审核、订单、额度与返佣通知', path: '/compute-center', icon: IconBell },
  { label: '全部设置', description: '外观、默认模型和隐私设置', path: '/settings', icon: IconSettings },
] as const

function formatAmount(value: number | undefined, digits = 3) {
  return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

const roleLabels = {
  BUYER: { label: '购买方', color: 'blue' },
  SUPPLIER: { label: '已认证供应方', color: 'teal' },
  ADMIN: { label: '算力管理员', color: 'violet' },
} as const

function MobileMyPage() {
  const navigate = useNavigate()
  const language = useLanguage()
  const { clearAuthTokens, saveAuthTokens } = useAuthTokens()
  const email = useAuthInfoStore((state) => state.loginEmail)
  const accessToken = useAuthInfoStore((state) => state.accessToken)
  const refreshToken = useAuthInfoStore((state) => state.refreshToken)
  const isLoggedIn = Boolean(accessToken && refreshToken)
  const account = useQuery({
    queryKey: ['compute', 'mobile-account', email],
    queryFn: getComputeAccount,
    enabled: isLoggedIn,
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
        setUpdateMessage(`当前已是最新版（${result.currentVersion}）`)
        return
      }
      setUpdateMessage(`发现新版本 ${result.release.version}，正在打开下载页。`)
      await openAndroidUpdate(result.release)
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : '检查更新失败')
    } finally {
      setCheckingUpdate(false)
    }
  }

  return (
    <Page title="我的">
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
                    {displayEmail || (isLoggedIn ? '已登录 KOD' : '尚未登录 KOD')}
                  </Title>
                  <Text size="sm" c="kod-tertiary">
                    官网、安卓端和算力中心共用同一账户与人民币钱包
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
              <Badge color={isLoggedIn ? 'green' : 'gray'}>{isLoggedIn ? '已登录' : '未登录'}</Badge>
            </Group>

            {isLoggedIn && (
              <Group justify="flex-end" gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconSwitch size={16} />}
                  onClick={() => setSwitchAccountOpened(true)}
                >
                  切换账号
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="red"
                  leftSection={<IconLogout size={16} />}
                  onClick={() => setLogoutConfirmOpened(true)}
                >
                  退出登录
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

        {account.data && (
          <Card withBorder radius="lg" padding="md">
            <Group justify="space-between" mb="sm">
              <div>
                <Text fw={700}>我的资产与收益</Text>
                <Text size="xs" c="kod-tertiary">
                  已与桌面端共用线上 KOD 账户账本
                </Text>
              </div>
              <Button size="compact-xs" variant="subtle" onClick={() => void account.refetch()}>
                刷新
              </Button>
            </Group>
            <SimpleGrid cols={3} spacing="xs">
              <AssetItem label="可用卡时" value={formatAmount(account.data.availableCardHours)} />
              <AssetItem label="冻结卡时" value={formatAmount(account.data.frozenCardHours)} />
              <AssetItem label="人民币余额" value={`¥${formatAmount(account.data.cnyBalance, 2)}`} />
              <AssetItem label="累计收益" value={formatAmount(account.data.lifetimeIncome)} />
              <AssetItem label="租金收益" value={formatAmount(account.data.rentalIncome)} />
              <AssetItem label="运行中 GPU" value={String(account.data.gpuAssetCounts.RUNNING || 0)} />
              <AssetItem label="待审核 GPU" value={String(account.data.gpuAssetCounts.PENDING || 0)} />
              <AssetItem label="待交付" value={String(account.data.gpuAssetCounts.PENDING_DELIVERY || 0)} />
              <AssetItem label="待处理" value={String(account.data.gpuAssetCounts.PENDING_ACTION || 0)} />
            </SimpleGrid>
          </Card>
        )}

        <Alert color="blue" title="移动端权限说明">
          蒜宝悬浮窗、无障碍和文件访问默认关闭，只在你主动使用对应功能时申请；拒绝授权不会影响对话、生图、视频和算力中心。
        </Alert>

        <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
          {entries.map((entry) => {
            const Icon = entry.icon
            return (
              <UnstyledButton key={entry.label} onClick={() => navigate({ to: entry.path })}>
                <Card withBorder radius="md" padding="md" h="100%">
                  <ThemeIcon variant="light" mb="sm">
                    <Icon size={19} />
                  </ThemeIcon>
                  <Text fw={700}>{entry.label}</Text>
                  <Text size="xs" c="kod-tertiary" mt={4}>
                    {entry.description}
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
                <Text fw={700}>蒜宝助手</Text>
                <Text size="xs" c="kod-tertiary" mt={4}>
                  手机任务、悬浮窗和授权管理
                </Text>
              </Card>
            </UnstyledButton>
          )}
        </SimpleGrid>

        <Card withBorder radius="md" padding="md">
          <Group justify="space-between">
            <div>
              <Text fw={700}>应用更新</Text>
              <Text size="xs" c="kod-tertiary">
                仅从 KOD 官网获取正式签名安装包
              </Text>
            </div>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconRefresh size={16} />}
              loading={checkingUpdate}
              onClick={() => void checkUpdate()}
            >
              检查更新
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
