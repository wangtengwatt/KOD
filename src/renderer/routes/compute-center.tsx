import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Divider,
  FileInput,
  Flex,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core'
import {
  IconBell,
  IconBuildingStore,
  IconCpu,
  IconDatabaseDollar,
  IconGauge,
  IconReceipt,
  IconServer,
  IconShieldCheck,
  IconTransfer,
  IconWallet,
} from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Page from '@/components/layout/Page'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import {
  acceptComputeTransfer,
  activateComputeApi,
  applyComputeSupplier,
  type CardHourTopUpQuote,
  type ComputeAccount,
  type ComputeAdminOverview,
  type ComputeApiUsage,
  ComputeCenterApiError,
  type ComputeGpuNode,
  type ComputeIdentity,
  type ComputeLedgerEntry,
  type ComputeNodeInput,
  type ComputeNotification,
  type ComputeOrder,
  type ComputeProduct,
  type ComputeReservation,
  type ComputeSupplier,
  type ComputeTransfer,
  type ComputeWithdrawal,
  cancelComputeReservation,
  cancelComputeTransfer,
  createAdminApiProduct,
  createComputeReservation,
  createComputeTransfer,
  createSupplierGpuProduct,
  createSupplierNode,
  createTestComputeIdentity,
  deliverComputeReservation,
  getAdminIdentity,
  getAdminIdentityDocument,
  getAdminNodeCredential,
  getComputeAccount,
  getComputeAdminOverview,
  getComputeConfig,
  getComputeIdentity,
  getComputeSupplier,
  grantAdminCardHours,
  listAdminIdentities,
  listAdminNodes,
  listAdminProducts,
  listAdminReservations,
  listAdminSuppliers,
  listAdminTransfers,
  listComputeApiUsage,
  listComputeLedger,
  listComputeNotifications,
  listComputeOrders,
  listComputePackageBalances,
  listComputeProducts,
  listComputeReservations,
  listComputeTransfers,
  listComputeWithdrawals,
  listSupplierNodes,
  listSupplierProducts,
  markComputeNotificationRead,
  type ProductType,
  purchaseCardHours,
  resolveAdminReservation,
  reviewAdminIdentity,
  reviewAdminNode,
  reviewAdminProduct,
  reviewAdminSupplier,
  reviewAdminTransfer,
  settleAdminReservation,
  submitComputeIdentity,
  updateAdminNodeStatus,
  updateComputeAdminSettings,
  withdrawComputeCardHours,
} from '@/packages/computeCenter'
import platform from '@/platform'
import { useAuthInfoStore } from '@/stores/authInfoStore'

export const Route = createFileRoute('/compute-center')({
  component: ComputeCenterPage,
})

type RunAction = (key: string, action: () => Promise<unknown>, success: string) => Promise<boolean>
type RunCardHourAction = (
  key: string,
  action: (autoTopUp: boolean) => Promise<unknown>,
  success: string
) => Promise<boolean>
type FeedbackMessage = { color: 'green' | 'red'; text: string }
type CardHourPrompt = {
  quote: CardHourTopUpQuote
  onConfirm: () => void
  onCancel: () => void
}

const roleLabels: Record<string, string> = {
  BUYER: '购买方',
  SUPPLIER: '已认证供应方',
  ADMIN: '算力管理员',
}

const deviceStatuses = [
  ['PENDING', '待审核'],
  ['DEPLOYING', '部署中'],
  ['RUNNING', '运行中'],
  ['PENDING_ACTION', '待处理'],
] as const

function ComputeCenterPage() {
  const isSmallScreen = useIsSmallScreen()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isLoggedIn = useAuthInfoStore((state) => Boolean(state.accessToken))
  const [activeTab, setActiveTab] = useState('market')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<FeedbackMessage | null>(null)
  const [cardHourPrompt, setCardHourPrompt] = useState<CardHourPrompt | null>(null)
  const closeMessage = useCallback(() => setMessage(null), [])

  const configQuery = useQuery({ queryKey: ['compute', 'config'], queryFn: getComputeConfig })
  const productsQuery = useQuery({ queryKey: ['compute', 'products'], queryFn: () => listComputeProducts() })
  const accountQuery = useQuery({
    queryKey: ['compute', 'account'],
    queryFn: getComputeAccount,
    enabled: isLoggedIn,
  })

  const run: RunAction = async (key, action, success) => {
    setBusy(key)
    setMessage(null)
    try {
      await action()
      setMessage({ color: 'green', text: success })
      await queryClient.invalidateQueries({ queryKey: ['compute'] })
      return true
    } catch (error) {
      setMessage({ color: 'red', text: error instanceof Error ? error.message : '操作失败' })
      return false
    } finally {
      setBusy(null)
    }
  }

  const runCardHourAction: RunCardHourAction = (key, action, success) => {
    const attempt = async (autoTopUp: boolean): Promise<boolean> => {
      setBusy(key)
      setMessage(null)
      try {
        await action(autoTopUp)
        setMessage({ color: 'green', text: success })
        await queryClient.invalidateQueries({ queryKey: ['compute'] })
        return true
      } catch (error) {
        if (
          error instanceof ComputeCenterApiError &&
          (error.code === 4601 || error.code === 4602) &&
          isCardHourTopUpQuote(error.data)
        ) {
          setBusy(null)
          const quote = error.data
          return await new Promise<boolean>((resolve) => {
            setCardHourPrompt({
              quote,
              onConfirm: () => {
                setCardHourPrompt(null)
                if (quote.canAutoTopUp) {
                  void attempt(true).then(resolve)
                } else {
                  void platform.openLink('https://kod.kai.com/console/wallet')
                  resolve(false)
                }
              },
              onCancel: () => {
                setCardHourPrompt(null)
                resolve(false)
              },
            })
          })
        }
        setMessage({ color: 'red', text: error instanceof Error ? error.message : '操作失败' })
        return false
      } finally {
        setBusy(null)
      }
    }

    return attempt(false)
  }

  const account = accountQuery.data
  const tabs = [
    { value: 'market', label: '算力市场', icon: <IconBuildingStore size={16} /> },
    { value: 'account', label: '我的资产', icon: <IconWallet size={16} />, login: true },
    { value: 'purchases', label: '购买记录', icon: <IconReceipt size={16} />, login: true },
    { value: 'reservations', label: '我的订单', icon: <IconServer size={16} />, login: true },
    { value: 'transfers', label: '转让', icon: <IconTransfer size={16} />, login: true },
    { value: 'supplier', label: '我的设备', icon: <IconCpu size={16} />, login: true },
    { value: 'notifications', label: '通知', icon: <IconBell size={16} />, login: true },
  ]

  return (
    <Page title="KOD 算力中心">
      <Container size="xl" py={isSmallScreen ? 'sm' : 'md'} px={isSmallScreen ? 'xs' : 'md'}>
        <Stack gap="md">
          <Hero account={account} rate={configQuery.data?.cardHourCnyRate} onOpen={setActiveTab} />

          {!isLoggedIn && (
            <Alert color="blue" title="公开浏览模式">
              <Flex align="center" justify="space-between" gap="md" wrap="wrap">
                <Text size="sm">你可以浏览商品；购买卡时、开通模型、预订、转让和供应方操作需要登录。</Text>
                <Button size="xs" onClick={() => navigate({ to: '/settings/provider/chatbox-ai' })}>
                  登录 KOD
                </Button>
              </Flex>
            </Alert>
          )}

          <FeedbackToast message={message} onClose={closeMessage} />
          <CardHourTopUpModal prompt={cardHourPrompt} />

          <Tabs value={activeTab} onChange={(value) => value && setActiveTab(value)} keepMounted={false}>
            <ScrollArea type="never" offsetScrollbars>
              <Tabs.List style={{ flexWrap: 'nowrap' }}>
                {tabs
                  .filter((tab) => !tab.login || isLoggedIn)
                  .map((tab) => (
                    <Tabs.Tab key={tab.value} value={tab.value} leftSection={tab.icon}>
                      {tab.label}
                      {tab.value === 'notifications' && (account?.unreadNotifications || 0) > 0 && (
                        <Badge size="xs" ml={6} circle>
                          {account?.unreadNotifications}
                        </Badge>
                      )}
                    </Tabs.Tab>
                  ))}
              </Tabs.List>
            </ScrollArea>

            <Tabs.Panel value="market" pt="md">
              <MarketPanel
                products={productsQuery.data || []}
                loading={productsQuery.isLoading}
                isLoggedIn={isLoggedIn}
                busy={busy}
                runCardHourAction={runCardHourAction}
              />
            </Tabs.Panel>

            {isLoggedIn && (
              <>
                <Tabs.Panel value="account" pt="md">
                  <AccountPanel account={account} busy={busy} run={run} onOpen={setActiveTab} />
                </Tabs.Panel>
                <Tabs.Panel value="purchases" pt="md">
                  <PurchasesPanel />
                </Tabs.Panel>
                <Tabs.Panel value="reservations" pt="md">
                  <ReservationsPanel busy={busy} run={run} />
                </Tabs.Panel>
                <Tabs.Panel value="transfers" pt="md">
                  <TransfersPanel account={account} busy={busy} run={run} runCardHourAction={runCardHourAction} />
                </Tabs.Panel>
                <Tabs.Panel value="supplier" pt="md">
                  <SupplierPanel busy={busy} run={run} />
                </Tabs.Panel>
                <Tabs.Panel value="notifications" pt="md">
                  <NotificationsPanel busy={busy} run={run} />
                </Tabs.Panel>
                {account?.isAdmin && (
                  <Tabs.Panel value="admin" pt="md">
                    <AdminPanel busy={busy} run={run} />
                  </Tabs.Panel>
                )}
              </>
            )}
          </Tabs>
        </Stack>
      </Container>
    </Page>
  )
}

function FeedbackToast({ message, onClose }: { message: FeedbackMessage | null; onClose: () => void }) {
  const toastRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!message) return

    const timeout = window.setTimeout(onClose, 3000)
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && !toastRef.current?.contains(target)) onClose()
    }
    document.addEventListener('pointerdown', handleOutsidePointerDown)

    return () => {
      window.clearTimeout(timeout)
      document.removeEventListener('pointerdown', handleOutsidePointerDown)
    }
  }, [message, onClose])

  if (!message) return null

  return (
    <>
      <style>{`@keyframes compute-feedback-slide-down {
        from { opacity: 0; transform: translateY(-28px); }
        to { opacity: 1; transform: translateY(0); }
      }`}</style>
      <Box
        pos="fixed"
        top={24}
        left="50%"
        style={{ zIndex: 10000, width: 'min(520px, calc(100vw - 32px))', transform: 'translateX(-50%)' }}
      >
        <Box
          key={`${message.color}-${message.text}`}
          ref={toastRef}
          style={{ animation: 'compute-feedback-slide-down 220ms ease-out' }}
        >
          <Alert
            color={message.color}
            withCloseButton
            onClose={onClose}
            styles={{
              root: {
                backgroundColor:
                  message.color === 'green' ? 'var(--mantine-color-green-light)' : 'var(--mantine-color-red-light)',
                boxShadow: 'var(--mantine-shadow-lg)',
              },
            }}
          >
            {message.text}
          </Alert>
        </Box>
      </Box>
    </>
  )
}

function isCardHourTopUpQuote(value: unknown): value is CardHourTopUpQuote {
  if (!value || typeof value !== 'object') return false
  const quote = value as Partial<CardHourTopUpQuote>
  return (
    typeof quote.requiredCardHours === 'number' &&
    typeof quote.availableCardHours === 'number' &&
    typeof quote.purchaseCardHours === 'number' &&
    typeof quote.cnyCost === 'number' &&
    typeof quote.cnyShortfall === 'number' &&
    typeof quote.canAutoTopUp === 'boolean'
  )
}

function CardHourTopUpModal({ prompt }: { prompt: CardHourPrompt | null }) {
  if (!prompt) return null
  const { quote } = prompt
  const roundedExtra = Math.max(0, quote.purchaseCardHours - quote.shortageCardHours)

  return (
    <Modal
      opened
      onClose={prompt.onCancel}
      centered
      title={quote.canAutoTopUp ? '卡时不足，是否自动补足？' : '卡时与人民币余额均不足'}
    >
      <Stack gap="md">
        <Alert color={quote.canAutoTopUp ? 'yellow' : 'red'}>
          {quote.canAutoTopUp
            ? '确认后将从人民币钱包购买刚好够用的卡时，并继续原操作。两步在同一事务中完成，原操作失败时不会扣款。'
            : `当前人民币余额无法补足所需卡时，还差 ¥${formatNumber(quote.cnyShortfall, 4)}。`}
        </Alert>
        <SimpleGrid cols={2} spacing="sm">
          <Metric label="本次需要" value={`${formatCardHours(quote.requiredCardHours)} 卡时`} />
          <Metric label="当前可用" value={`${formatCardHours(quote.availableCardHours)} 卡时`} />
          <Metric label="自动购买" value={`${formatCardHours(quote.purchaseCardHours)} 卡时`} />
          <Metric label="扣除人民币" value={`¥${formatNumber(quote.cnyCost, 4)}`} />
        </SimpleGrid>
        {roundedExtra > 0.0001 && quote.canAutoTopUp && (
          <Text size="xs" c="chatbox-tertiary">
            卡时按 0.1 向上取整，多出的 {formatCardHours(roundedExtra)} 卡时将留在账户中。
          </Text>
        )}
        {!quote.canAutoTopUp && (
          <Text size="sm">
            当前人民币余额：¥{formatNumber(quote.cnyBalance, 4)}；补足卡时需要 ¥{formatNumber(quote.cnyCost, 4)}。
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={prompt.onCancel}>
            取消
          </Button>
          <Button color={quote.canAutoTopUp ? 'blue' : 'orange'} onClick={prompt.onConfirm}>
            {quote.canAutoTopUp ? '兑换卡时并继续' : '去官网充值'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function Hero({ account, rate, onOpen }: { account?: ComputeAccount; rate?: number; onOpen: (value: string) => void }) {
  return (
    <Paper
      p="lg"
      radius="lg"
      className="bg-gradient-to-r from-chatbox-background-brand-secondary to-chatbox-background-secondary"
    >
      <Stack gap="md">
        <Box>
          <Group gap="sm" mb={4}>
            <ThemeIcon size="lg" variant="light" radius="xl">
              <IconGauge size={20} />
            </ThemeIcon>
            <Title order={2}>让每一份算力都有清晰价格与去向</Title>
          </Group>
          <Text c="chatbox-tertiary">模型按固定 Token 套餐销售、GPU 按预订时段结算，统一使用 KAI 标准卡时。</Text>
          <Text size="sm" c="chatbox-tertiary" mt={4}>
            1 KAI 标准卡时 = ¥{formatNumber(rate || account?.cardHourCnyRate || 1.002, 3)}
            ；卡时可按 ¥1.0000 兑换到 KOD 内部人民币钱包，不支持外部打款。
          </Text>
        </Box>
        {account && (
          <>
            <Divider />
            <Flex justify="space-between" align="center" gap="md" wrap="wrap">
              <Box>
                <Text fw={700}>{account.email}</Text>
                <Group gap="xs" mt={6}>
                  {account.roles.map((role) => (
                    <Badge key={role} color={role === 'ADMIN' ? 'violet' : role === 'SUPPLIER' ? 'teal' : 'blue'}>
                      {roleLabels[role] || role}
                    </Badge>
                  ))}
                </Group>
              </Box>
              {account.isAdmin && (
                <Button leftSection={<IconShieldCheck size={18} />} onClick={() => onOpen('admin')}>
                  进入算力管理后台
                </Button>
              )}
            </Flex>
            <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="md">
              <Metric label="可用卡时" value={formatCardHours(account.availableCardHours)} />
              <Metric label="冻结卡时" value={formatCardHours(account.frozenCardHours)} />
              <Metric label="人民币余额" value={`¥${formatNumber(account.cnyBalance, 4)}`} />
              <Metric label="累计收益" value={formatCardHours(account.lifetimeIncome)} />
              <Metric label="租金收益" value={formatCardHours(account.rentalIncome)} />
            </SimpleGrid>
          </>
        )}
      </Stack>
    </Paper>
  )
}

function AssetDashboard({ account, onOpen }: { account?: ComputeAccount; onOpen: (value: string) => void }) {
  if (!account) return <Text c="chatbox-tertiary">正在加载账户信息…</Text>

  const supplierEntryLabel =
    account.identityStatus === 'NONE' ? '实名认证' : account.identityStatus === 'APPROVED' ? '算力入驻' : '认证进度'

  return (
    <Stack gap="md">
      <Section title="设备状态">
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
          {deviceStatuses.map(([status, label]) => (
            <Card key={status} withBorder padding="md" style={{ cursor: 'pointer' }} onClick={() => onOpen('supplier')}>
              <Text size="xl" fw={700} c={status === 'PENDING_ACTION' ? 'red' : undefined}>
                {account.deviceCounts?.[status] || 0}
              </Text>
              <Text size="sm">{label}</Text>
            </Card>
          ))}
        </SimpleGrid>
      </Section>

      <Section title="常用功能">
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="sm">
          {[
            ['supplier', supplierEntryLabel],
            ['market', '购买算力'],
            ['reservations', '我的订单'],
            ['purchases', '购买记录'],
            ['transfers', '卡时转让'],
            ['notifications', '通知中心'],
          ].map(([value, label]) => (
            <Button key={value} variant="light" h={52} onClick={() => onOpen(value)}>
              {label}
            </Button>
          ))}
        </SimpleGrid>
      </Section>
    </Stack>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text size="xs" c="chatbox-tertiary">
        {label}
      </Text>
      <Text size="xl" fw={700}>
        {value}
      </Text>
    </Box>
  )
}

function MarketPanel({
  products,
  loading,
  isLoggedIn,
  busy,
  runCardHourAction,
}: {
  products: ComputeProduct[]
  loading: boolean
  isLoggedIn: boolean
  busy: string | null
  runCardHourAction: RunCardHourAction
}) {
  const [type, setType] = useState<ProductType | 'ALL'>('ALL')
  const [keyword, setKeyword] = useState('')
  const [reservationProduct, setReservationProduct] = useState<ComputeProduct | null>(null)
  const visible = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase('zh-CN')
    return products.filter((product) => {
      if (type !== 'ALL' && product.productType !== type) return false
      if (!normalizedKeyword) return true
      return [
        product.name,
        product.description,
        product.region,
        product.modelId,
        product.gpuModel,
        product.supplierName,
      ].some((value) => value?.toLocaleLowerCase('zh-CN').includes(normalizedKeyword))
    })
  }, [keyword, products, type])

  return (
    <Stack gap="md">
      <Flex justify="space-between" align="center" wrap="wrap" gap="sm">
        <Box>
          <Title order={4}>算力市场</Title>
          <Text size="sm" c="chatbox-tertiary">
            模型 API 先用卡时购买固定 Token 套餐；GPU 预订时按时段冻结卡时。
          </Text>
        </Box>
        <Group gap="sm">
          <TextInput
            placeholder="搜索商品、模型或供应方"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            w={240}
          />
          <Select
            value={type}
            onChange={(value) => setType((value || 'ALL') as ProductType | 'ALL')}
            data={[
              { value: 'ALL', label: '全部商品' },
              { value: 'API', label: '模型 API' },
              { value: 'GPU', label: 'GPU 资源' },
            ]}
            w={150}
          />
        </Group>
      </Flex>

      {loading ? (
        <Text c="chatbox-tertiary">正在加载市场商品…</Text>
      ) : visible.length === 0 ? (
        <EmptyState title="暂无已上架商品" description="管理员或已审核供应方发布并审核通过后，商品会显示在这里。" />
      ) : (
        <SimpleGrid type="container" cols={{ base: 1, '560px': 2, '960px': 3 }} spacing="md">
          {visible.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              isLoggedIn={isLoggedIn}
              busy={busy}
              runCardHourAction={runCardHourAction}
              onReserve={() => setReservationProduct(product)}
            />
          ))}
        </SimpleGrid>
      )}

      <ReservationModal
        product={reservationProduct}
        onClose={() => setReservationProduct(null)}
        busy={busy}
        runCardHourAction={runCardHourAction}
      />
    </Stack>
  )
}

function ProductCard({
  product,
  isLoggedIn,
  busy,
  runCardHourAction,
  onReserve,
}: {
  product: ComputeProduct
  isLoggedIn: boolean
  busy: string | null
  runCardHourAction: RunCardHourAction
  onReserve: () => void
}) {
  const actionKey = `product-${product.id}`
  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="sm" h="100%">
        <Flex justify="space-between" align="flex-start" gap="sm">
          <Badge color={product.productType === 'API' ? 'blue' : 'teal'} variant="light">
            {product.productType === 'API' ? '模型 API' : 'GPU 资源'}
          </Badge>
          <Text size="xs" c="chatbox-tertiary">
            {product.region || '区域待定'}
          </Text>
        </Flex>
        <Box>
          <Title order={4}>{product.name}</Title>
          <Text size="sm" c="chatbox-tertiary" lineClamp={3} mt={4}>
            {product.description || '暂无商品说明'}
          </Text>
        </Box>
        <Divider />
        {product.productType === 'API' ? (
          <Stack gap={4}>
            <DataRow label="模型" value={product.modelId || '-'} />
            <DataRow label="输入额度" value={`${formatTokens(product.packagePromptTokens)} Token`} />
            <DataRow label="输出额度" value={`${formatTokens(product.packageCompletionTokens)} Token`} />
            <DataRow label="套餐价" value={`${formatCardHours(product.packagePriceCardHours)} 卡时`} />
          </Stack>
        ) : (
          <Stack gap={4}>
            <DataRow label="规格" value={`${product.gpuModel || '-'} ${product.gpuMemoryGb || '-'}GB`} />
            <DataRow label="库存" value={`${product.gpuCount || 0} 张`} />
            <DataRow label="价格" value={`${formatCardHours(product.pricePerGpuHour)} 卡时 / GPU·小时`} />
          </Stack>
        )}
        <Text size="xs" c="chatbox-tertiary">
          供应方：{product.supplierName || 'KOD 官方'} · {product.slaDescription || 'SLA 待确认'}
        </Text>
        {Boolean(product.isTest) && (
          <Badge color="orange" variant="light">
            仅内测，不代表真实资源
          </Badge>
        )}
        <Button
          mt="auto"
          disabled={!isLoggedIn}
          loading={busy === actionKey}
          onClick={() =>
            product.productType === 'API'
              ? runCardHourAction(
                  actionKey,
                  (autoTopUp) => activateComputeApi(product.id, autoTopUp),
                  `${product.name} 套餐购买成功`
                )
              : onReserve()
          }
        >
          {!isLoggedIn ? '登录后操作' : product.productType === 'API' ? '用卡时购买套餐' : '预订 GPU'}
        </Button>
      </Stack>
    </Card>
  )
}

function ReservationModal({
  product,
  onClose,
  busy,
  runCardHourAction,
}: {
  product: ComputeProduct | null
  onClose: () => void
  busy: string | null
  runCardHourAction: RunCardHourAction
}) {
  const [gpuCount, setGpuCount] = useState(1)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  if (!product) return null
  const key = `reserve-${product.id}`
  const durationHours = Math.max(0, (new Date(endTime).getTime() - new Date(startTime).getTime()) / 3_600_000)
  const estimatedCardHours = Math.ceil(durationHours * gpuCount * Number(product.pricePerGpuHour || 0) * 1000) / 1000
  return (
    <Modal opened onClose={onClose} title={`预订 ${product.name}`} centered>
      <Stack>
        <Alert color="yellow">第一版按预订时段自动计费，不代表已自动开通真实 H100。</Alert>
        <NumberInput
          label="GPU 数量"
          min={1}
          max={product.gpuCount || 1}
          value={gpuCount}
          onChange={(value) => setGpuCount(Number(value) || 1)}
        />
        <TextInput
          label="开始时间"
          type="datetime-local"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
        <TextInput
          label="结束时间"
          type="datetime-local"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
        />
        <Text size="sm" fw={600}>
          预计冻结：{formatCardHours(estimatedCardHours)} 卡时（{formatNumber(durationHours, 2)} 小时 × {gpuCount} 张）
        </Text>
        <Button
          loading={busy === key}
          disabled={!startTime || !endTime}
          onClick={() =>
            runCardHourAction(
              key,
              (autoTopUp) =>
                createComputeReservation({ productId: product.id, gpuCount, startTime, endTime }, autoTopUp),
              'GPU 预订已提交，卡时已冻结'
            ).then((succeeded) => succeeded && onClose())
          }
        >
          确认预订并冻结卡时
        </Button>
      </Stack>
    </Modal>
  )
}

function AccountPanel({
  account,
  busy,
  run,
  onOpen,
}: {
  account?: ComputeAccount
  busy: string | null
  run: RunAction
  onOpen: (value: string) => void
}) {
  const ledgerQuery = useQuery({ queryKey: ['compute', 'ledger'], queryFn: listComputeLedger })
  const packagesQuery = useQuery({ queryKey: ['compute', 'package-balances'], queryFn: listComputePackageBalances })
  const usageQuery = useQuery({ queryKey: ['compute', 'api-usage'], queryFn: listComputeApiUsage })
  const withdrawalsQuery = useQuery({ queryKey: ['compute', 'withdrawals'], queryFn: listComputeWithdrawals })
  const [amount, setAmount] = useState(10)
  const [withdrawalAmount, setWithdrawalAmount] = useState(0.1)
  const estimated = amount * (account?.cardHourCnyRate || 1.002)
  const withdrawalCny = withdrawalAmount * (account?.cardHourRedeemRate || 1)

  return (
    <Stack gap="md">
      <AssetDashboard account={account} onOpen={onOpen} />

      <Alert color="orange" title="“提现”仅指内部钱包兑换">
        卡时按 1 卡时 = ¥{formatNumber(account?.cardHourRedeemRate || 1, 4)} 直接转入 KOD
        人民币钱包，不会打款到银行卡、支付宝或其他第三方账户。冻结卡时不能兑换。
      </Alert>

      <Tabs defaultValue="exchange" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="exchange">购买与提现</Tabs.Tab>
          <Tabs.Tab value="withdrawals">提现记录</Tabs.Tab>
          <Tabs.Tab value="packages">Token 套餐</Tabs.Tab>
          <Tabs.Tab value="ledger">资产流水</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="exchange" pt="md">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
            <Paper withBorder p="md" radius="md">
              <Stack>
                <Title order={5}>人民币钱包购买卡时</Title>
                <NumberInput
                  label="购买卡时"
                  description="至少 0.1，按 0.1 的倍数"
                  min={0.1}
                  step={0.1}
                  decimalScale={1}
                  value={amount}
                  onChange={(value) => setAmount(Number(value) || 0)}
                />
                <Text size="sm">
                  预计扣除：<b>¥{formatNumber(estimated, 4)}</b>
                </Text>
                <Button
                  loading={busy === 'purchase'}
                  onClick={() => run('purchase', () => purchaseCardHours(amount), `已购买 ${amount.toFixed(1)} 卡时`)}
                >
                  用人民币余额购买
                </Button>
              </Stack>
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Stack>
                <Title order={5}>提现申请</Title>
                <NumberInput
                  label="兑换卡时"
                  description={`当前可兑换 ${formatCardHours(account?.withdrawableCardHours)} 卡时`}
                  min={0.1}
                  step={0.1}
                  decimalScale={1}
                  value={withdrawalAmount}
                  onChange={(value) => setWithdrawalAmount(Number(value) || 0)}
                />
                <Text size="sm">
                  预计到账 KOD 钱包：<b>¥{formatNumber(withdrawalCny, 4)}</b>
                </Text>
                <Button
                  color="teal"
                  loading={busy === 'withdrawal'}
                  disabled={withdrawalAmount < 0.1 || withdrawalAmount > Number(account?.withdrawableCardHours || 0)}
                  onClick={() =>
                    run(
                      'withdrawal',
                      () => withdrawComputeCardHours(withdrawalAmount),
                      `${withdrawalAmount.toFixed(1)} 卡时已转入 KOD 人民币钱包`
                    )
                  }
                >
                  确认兑换并直接到账
                </Button>
              </Stack>
            </Paper>
          </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel value="withdrawals" pt="md">
          <WithdrawalTable entries={withdrawalsQuery.data || []} />
        </Tabs.Panel>

        <Tabs.Panel value="packages" pt="md">
          <Stack>
            <Section title="模型 Token 套餐余额（永久有效）">
              <SimpleTable
                columns={['模型', '输入剩余 / 总额', '输出剩余 / 总额', '累计支付卡时', '最后购买']}
                rows={(packagesQuery.data || []).map((item) => [
                  item.modelId,
                  `${formatTokens(item.promptTokensRemaining)} / ${formatTokens(item.promptTokensTotal)}`,
                  `${formatTokens(item.completionTokensRemaining)} / ${formatTokens(item.completionTokensTotal)}`,
                  formatCardHours(item.paidCardHours),
                  formatDate(item.lastPurchasedAt),
                ])}
                empty="尚未购买模型 Token 套餐"
              />
            </Section>
            <Section title="模型 API Token 记账">
              <ApiUsageTable entries={usageQuery.data || []} />
            </Section>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="ledger" pt="md">
          <LedgerTable entries={ledgerQuery.data || []} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}

function PurchasesPanel() {
  const ordersQuery = useQuery({ queryKey: ['compute', 'orders'], queryFn: listComputeOrders })
  return (
    <Stack>
      <Alert color="blue">统一展示人民币购买卡时、Token 套餐购买和 GPU 预订三类记录。</Alert>
      <OrdersTable orders={ordersQuery.data || []} />
    </Stack>
  )
}

function WithdrawalTable({ entries }: { entries: ComputeWithdrawal[] }) {
  return (
    <SimpleTable
      columns={['提现单号', '卡时', '到账人民币', '去向', '状态', '时间']}
      rows={entries.map((item) => [
        item.withdrawalNo,
        formatCardHours(item.cardHours),
        `¥${formatNumber(item.cnyAmount, 4)}`,
        'KOD 内部人民币钱包',
        statusLabel(item.status),
        formatDate(item.completedAt || item.createTime),
      ])}
      empty="暂无提现记录"
    />
  )
}

function ReservationsPanel({ busy, run }: { busy: string | null; run: RunAction }) {
  const reservationsQuery = useQuery({
    queryKey: ['compute', 'reservations', 'buyer'],
    queryFn: () => listComputeReservations('buyer'),
  })
  const reservations = reservationsQuery.data || []
  return (
    <Stack>
      <Alert color="blue" title="自动结算规则">
        买方下单先冻结卡时，预订时段正常结束后自动结算给供应方；定时任务漏跑时管理员可立即补偿结算。设备异常会暂停自动结算，由管理员选择全额退款、按实际使用或按原订单结算。
      </Alert>
      {reservations.length === 0 ? (
        <EmptyState title="暂无 GPU 预订" description="请从算力市场选择已上架的 GPU 商品。" />
      ) : (
        reservations.map((reservation) => (
          <ReservationCard key={reservation.id} reservation={reservation} busy={busy} run={run} view="buyer" />
        ))
      )}
    </Stack>
  )
}

function ReservationCard({
  reservation,
  busy,
  run,
  view,
}: {
  reservation: ComputeReservation
  busy: string | null
  run: RunAction
  view: 'buyer' | 'supplier'
}) {
  const [deliveryInfo, setDeliveryInfo] = useState('')
  const key = `${view}-reservation-${reservation.id}`
  const cancellable = ['PENDING_DELIVERY', 'CONFIRMED'].includes(reservation.status)
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Flex justify="space-between" align="flex-start" gap="md" wrap="wrap">
          <Box>
            <Group gap="xs">
              <Title order={5}>{reservation.productName}</Title>
              <StatusBadge status={reservation.status} />
            </Group>
            <Text size="sm" c="chatbox-tertiary">
              {reservation.gpuModel} × {reservation.gpuCount} · {formatDate(reservation.startTime)} 至{' '}
              {formatDate(reservation.endTime)}
            </Text>
          </Box>
          <Text fw={700}>{formatCardHours(reservation.frozenCardHours)} 卡时</Text>
        </Flex>
        {view === 'supplier' && reservation.buyerEmail && <Text size="sm">买方：{reservation.buyerEmail}</Text>}
        {reservation.incidentReason && (
          <Alert color="red">异常原因：{reservation.incidentReason}，等待管理员处理。</Alert>
        )}
        {reservation.deliveryInfo && (
          <Alert color="teal" title="交付信息">
            <Text style={{ whiteSpace: 'pre-wrap' }}>{reservation.deliveryInfo}</Text>
          </Alert>
        )}
        {view === 'buyer' && cancellable && (
          <Button
            variant="light"
            color="red"
            loading={busy === key}
            onClick={() => run(key, () => cancelComputeReservation(reservation.id), 'GPU 预订已取消，卡时已解冻')}
          >
            开始前取消预订
          </Button>
        )}
        {view === 'supplier' && reservation.status === 'PENDING_DELIVERY' && (
          <Stack gap="xs">
            <Textarea
              label="加密交付信息"
              description="可填写临时 SSH、Jupyter、API 或联系说明，仅订单双方可见"
              value={deliveryInfo}
              onChange={(e) => setDeliveryInfo(e.target.value)}
              autosize
              minRows={3}
            />
            <Button
              loading={busy === key}
              disabled={!deliveryInfo.trim()}
              onClick={() =>
                run(key, () => deliverComputeReservation(reservation.id, deliveryInfo), '交付信息已安全提交')
              }
            >
              确认资源并交付
            </Button>
          </Stack>
        )}
      </Stack>
    </Paper>
  )
}

function TransfersPanel({
  account,
  busy,
  run,
  runCardHourAction,
}: {
  account?: ComputeAccount
  busy: string | null
  run: RunAction
  runCardHourAction: RunCardHourAction
}) {
  const transfersQuery = useQuery({ queryKey: ['compute', 'transfers'], queryFn: listComputeTransfers })
  const [recipientEmail, setRecipientEmail] = useState('')
  const [amount, setAmount] = useState(1)
  const [transferMessage, setTransferMessage] = useState('')
  const transfers = transfersQuery.data || []
  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Title order={5} mb="sm">
          无偿转让卡时
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <TextInput
            label="接收方 KOD 邮箱"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
          />
          <NumberInput
            label="转让卡时"
            min={0.001}
            step={0.001}
            decimalScale={3}
            value={amount}
            onChange={(value) => setAmount(Number(value) || 0)}
          />
          <TextInput label="留言" value={transferMessage} onChange={(e) => setTransferMessage(e.target.value)} />
        </SimpleGrid>
        <Flex justify="space-between" align="center" mt="md" gap="md" wrap="wrap">
          <Text size="sm" c="chatbox-tertiary">
            可用 {formatCardHours(account?.availableCardHours)} 卡时；达到 1,000 卡时需管理员审核。
          </Text>
          <Button
            loading={busy === 'create-transfer'}
            disabled={!recipientEmail.trim() || amount <= 0}
            onClick={() =>
              runCardHourAction(
                'create-transfer',
                (autoTopUp) =>
                  createComputeTransfer({ recipientEmail, cardHours: amount, message: transferMessage }, autoTopUp),
                '转让已创建，卡时已冻结'
              )
            }
          >
            创建转让
          </Button>
        </Flex>
      </Paper>

      {transfers.length === 0 ? (
        <EmptyState title="暂无转让记录" description="转让仅限 KOD 已注册用户；转入卡时可兑换到 KOD 内部人民币钱包。" />
      ) : (
        transfers.map((transfer) => (
          <TransferCard key={transfer.id} transfer={transfer} currentUserId={account?.userId} busy={busy} run={run} />
        ))
      )}
    </Stack>
  )
}

function TransferCard({
  transfer,
  currentUserId,
  busy,
  run,
}: {
  transfer: ComputeTransfer
  currentUserId?: number
  busy: string | null
  run: RunAction
}) {
  const isSender = transfer.senderUserId === currentUserId
  const isRecipient = transfer.recipientUserId === currentUserId
  const key = `transfer-${transfer.id}`
  return (
    <Paper withBorder p="md" radius="md">
      <Flex justify="space-between" align="center" gap="md" wrap="wrap">
        <Box>
          <Group gap="xs">
            <Text fw={600}>{formatCardHours(transfer.amount)} 卡时</Text>
            <StatusBadge status={transfer.status} />
          </Group>
          <Text size="sm" c="chatbox-tertiary">
            {transfer.senderEmail} → {transfer.recipientEmail} · {formatDate(transfer.createTime)}
          </Text>
          {transfer.message && <Text size="sm">{transfer.message}</Text>}
          {transfer.reviewReason && (
            <Text size="sm" c="red">
              审核说明：{transfer.reviewReason}
            </Text>
          )}
        </Box>
        <Group>
          {isRecipient && transfer.status === 'PENDING_RECIPIENT' && (
            <Button
              loading={busy === key}
              onClick={() => run(key, () => acceptComputeTransfer(transfer.id), '卡时已接收')}
            >
              接收
            </Button>
          )}
          {isSender && ['PENDING_REVIEW', 'PENDING_RECIPIENT'].includes(transfer.status) && (
            <Button
              variant="light"
              color="red"
              loading={busy === key}
              onClick={() => run(key, () => cancelComputeTransfer(transfer.id), '转让已撤回，卡时已解冻')}
            >
              撤回
            </Button>
          )}
        </Group>
      </Flex>
    </Paper>
  )
}

function SupplierPanel({ busy, run }: { busy: string | null; run: RunAction }) {
  const identityQuery = useQuery({ queryKey: ['compute', 'identity'], queryFn: getComputeIdentity })
  const supplierQuery = useQuery({ queryKey: ['compute', 'supplier'], queryFn: getComputeSupplier })
  const accountQuery = useQuery({ queryKey: ['compute', 'account'], queryFn: getComputeAccount })
  const nodesQuery = useQuery({ queryKey: ['compute', 'supplier-nodes'], queryFn: listSupplierNodes })
  const productsQuery = useQuery({ queryKey: ['compute', 'supplier-products'], queryFn: listSupplierProducts })
  const reservationsQuery = useQuery({
    queryKey: ['compute', 'reservations', 'supplier'],
    queryFn: () => listComputeReservations('supplier'),
  })
  const supplier = supplierQuery.data
  const identity = identityQuery.data
  const approvedIdentity = identity?.status === 'APPROVED' || identity?.status === 'TEST_APPROVED'
  const [displayName, setDisplayName] = useState('')
  const [contact, setContact] = useState('')
  const [description, setDescription] = useState('')
  const [realName, setRealName] = useState('')
  const [identityNo, setIdentityNo] = useState('')
  const [identityFront, setIdentityFront] = useState<File | null>(null)
  const [identityBack, setIdentityBack] = useState<File | null>(null)
  const [node, setNode] = useState<ComputeNodeInput>({
    nodeName: '内部 H100 流程测试节点',
    region: '待确认',
    gpuModel: 'H100',
    gpuMemoryGb: 80,
    gpuCount: 1,
    cpuDescription: '仅内测占位数据',
    ramGb: 0,
    storageGb: 0,
    networkDescription: '仅内测占位数据',
    sshHost: '127.0.0.1',
    sshPort: 22,
    sshUsername: 'test-only',
    sshAuthType: 'PASSWORD',
    sshCredential: 'TEST_ONLY_DO_NOT_CONNECT',
  })
  const [gpu, setGpu] = useState({
    nodeId: 0,
    name: 'H100 GPU 资源',
    description: '公司内部 H100 测试资源，第一版按预订时段结算。',
    region: '待确认',
    gpuModel: 'H100',
    gpuMemoryGb: 80,
    gpuCount: 1,
    pricePerGpuHour: 1,
    availableFrom: '',
    availableTo: '',
    deliveryMode: '供应方加密填写交付信息',
    slaDescription: '内部测试，SLA 待验证',
  })

  if (!identity || !approvedIdentity) {
    const canSubmit = !identity || ['NONE', 'REJECTED', 'REVOKED'].includes(identity.status)
    return (
      <Stack gap="md">
        <Alert color="orange" title="先完成实名认证">
          供应方入驻前必须由管理员人工审核身份材料。同一身份证最多认证五个账号；拒绝或注销后，敏感材料 30 天后自动删除。
        </Alert>
        {identity && identity.status !== 'NONE' && (
          <Alert color={identity.status === 'PENDING' ? 'yellow' : 'red'}>
            当前状态：{statusLabel(identity.status)}
            {identity.rejectionReason ? `；${identity.rejectionReason}` : ''}
          </Alert>
        )}
        {canSubmit && (
          <Section title="提交真实身份材料">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput label="真实姓名" value={realName} onChange={(e) => setRealName(e.target.value)} />
              <TextInput label="身份证号" value={identityNo} onChange={(e) => setIdentityNo(e.target.value)} />
              <FileInput
                label="身份证正面"
                accept="image/jpeg,image/png"
                value={identityFront}
                onChange={setIdentityFront}
              />
              <FileInput
                label="身份证反面"
                accept="image/jpeg,image/png"
                value={identityBack}
                onChange={setIdentityBack}
              />
            </SimpleGrid>
            <Group mt="md">
              <Button
                loading={busy === 'identity-submit'}
                disabled={!realName.trim() || !identityNo.trim() || !identityFront || !identityBack}
                onClick={() => {
                  if (!identityFront || !identityBack) return
                  return run(
                    'identity-submit',
                    () => submitComputeIdentity({ realName, identityNo, front: identityFront, back: identityBack }),
                    '实名认证已提交审核'
                  )
                }}
              >
                提交真实材料
              </Button>
              <Button
                color="orange"
                variant="light"
                loading={busy === 'identity-test'}
                onClick={() => run('identity-test', createTestComputeIdentity, '仅内测模拟认证已提交审核')}
              >
                创建“仅内测、非真实认证”材料
              </Button>
            </Group>
          </Section>
        )}
      </Stack>
    )
  }

  if (!supplier || supplier.status === 'NONE') {
    return (
      <Paper withBorder p="lg" radius="md">
        <Stack>
          <Title order={4}>申请成为算力供应方</Title>
          <Text c="chatbox-tertiary">
            身份状态：{statusLabel(identity.status)}。入驻通过后先提交 GPU 节点验机，再基于已验机节点发布商品。
          </Text>
          <TextInput label="供应方名称" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <TextInput label="联系方式" value={contact} onChange={(e) => setContact(e.target.value)} />
          <Textarea label="资源与团队说明" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Button
            loading={busy === 'supplier-apply'}
            disabled={!displayName.trim()}
            onClick={() =>
              run(
                'supplier-apply',
                () => applyComputeSupplier({ displayName, contact, description }),
                '供应方申请已提交'
              )
            }
          >
            提交申请
          </Button>
        </Stack>
      </Paper>
    )
  }

  return (
    <Stack gap="md">
      <Alert color={supplier.status === 'APPROVED' ? 'green' : supplier.status === 'REJECTED' ? 'red' : 'yellow'}>
        供应方状态：{statusLabel(supplier.status)}
        {supplier.rejectionReason ? `；原因：${supplier.rejectionReason}` : ''}
      </Alert>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <SummaryCard
          icon={<IconDatabaseDollar />}
          label="累计卡时收益"
          value={formatCardHours(accountQuery.data?.lifetimeIncome)}
        />
        <SummaryCard icon={<IconServer />} label="托管节点" value={String((nodesQuery.data || []).length)} />
        <SummaryCard
          icon={<IconBuildingStore />}
          label="已发布商品"
          value={String((productsQuery.data || []).length)}
        />
      </SimpleGrid>

      <Tabs defaultValue="devices" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="devices">设备与验机</Tabs.Tab>
          <Tabs.Tab value="products">产品发布</Tabs.Tab>
          <Tabs.Tab value="orders">出租订单</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="devices" pt="md">
          <Stack>
            {supplier.status === 'REJECTED' && (
              <Button
                variant="light"
                onClick={() =>
                  run(
                    'supplier-reapply',
                    () =>
                      applyComputeSupplier({
                        displayName: supplier.displayName || '',
                        contact: supplier.contact || '',
                        description: supplier.description || '',
                      }),
                    '已重新提交供应方申请'
                  )
                }
              >
                修改资料后重新提交
              </Button>
            )}

            {supplier.status === 'APPROVED' && (
              <Section title="提交 GPU 节点人工验机">
                {identity.status === 'TEST_APPROVED' && (
                  <Alert color="orange" mb="sm">
                    模拟认证只能创建、上架明确标记为“仅内测”的节点和商品。
                  </Alert>
                )}
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <TextInput
                    label="节点名称"
                    value={node.nodeName}
                    onChange={(e) => setNode({ ...node, nodeName: e.target.value })}
                  />
                  <TextInput
                    label="区域"
                    value={node.region}
                    onChange={(e) => setNode({ ...node, region: e.target.value })}
                  />
                  <TextInput
                    label="GPU 型号"
                    value={node.gpuModel}
                    onChange={(e) => setNode({ ...node, gpuModel: e.target.value })}
                  />
                  <NumberInput
                    label="显存 GB"
                    min={1}
                    value={node.gpuMemoryGb}
                    onChange={(value) => setNode({ ...node, gpuMemoryGb: Number(value) || 0 })}
                  />
                  <NumberInput
                    label="GPU 数量"
                    min={1}
                    value={node.gpuCount}
                    onChange={(value) => setNode({ ...node, gpuCount: Number(value) || 0 })}
                  />
                  <TextInput
                    label="CPU 信息"
                    value={node.cpuDescription}
                    onChange={(e) => setNode({ ...node, cpuDescription: e.target.value })}
                  />
                  <NumberInput
                    label="内存 GB"
                    min={0}
                    value={node.ramGb}
                    onChange={(value) => setNode({ ...node, ramGb: Number(value) || 0 })}
                  />
                  <NumberInput
                    label="存储 GB"
                    min={0}
                    value={node.storageGb}
                    onChange={(value) => setNode({ ...node, storageGb: Number(value) || 0 })}
                  />
                  <TextInput
                    label="网络说明"
                    value={node.networkDescription}
                    onChange={(e) => setNode({ ...node, networkDescription: e.target.value })}
                  />
                  <TextInput
                    label="SSH 地址"
                    value={node.sshHost}
                    onChange={(e) => setNode({ ...node, sshHost: e.target.value })}
                  />
                  <NumberInput
                    label="SSH 端口"
                    min={1}
                    max={65535}
                    value={node.sshPort}
                    onChange={(value) => setNode({ ...node, sshPort: Number(value) || 22 })}
                  />
                  <TextInput
                    label="SSH 用户名"
                    value={node.sshUsername}
                    onChange={(e) => setNode({ ...node, sshUsername: e.target.value })}
                  />
                  <Select
                    label="认证方式"
                    value={node.sshAuthType}
                    data={[
                      { value: 'PASSWORD', label: '密码' },
                      { value: 'PRIVATE_KEY', label: '私钥' },
                    ]}
                    onChange={(value) =>
                      setNode({ ...node, sshAuthType: (value || 'PASSWORD') as 'PASSWORD' | 'PRIVATE_KEY' })
                    }
                  />
                  <Textarea
                    label="密码 / 私钥"
                    value={node.sshCredential}
                    onChange={(e) => setNode({ ...node, sshCredential: e.target.value })}
                  />
                </SimpleGrid>
                <Button
                  mt="md"
                  loading={busy === 'supplier-node'}
                  disabled={
                    !node.nodeName.trim() ||
                    !node.sshHost.trim() ||
                    !node.sshUsername.trim() ||
                    !node.sshCredential.trim()
                  }
                  onClick={() => run('supplier-node', () => createSupplierNode(node), 'GPU 节点已提交人工验机')}
                >
                  提交验机
                </Button>
              </Section>
            )}

            <Section title="我的托管节点">
              <SimpleTable
                columns={['节点', '规格', '区域', '类型', '状态', '验机说明']}
                rows={(nodesQuery.data || []).map((item) => [
                  item.nodeName,
                  `${item.gpuModel} ${item.gpuMemoryGb}GB × ${item.gpuCount}`,
                  item.region,
                  item.isTest ? '仅内测' : '正式',
                  statusLabel(item.status),
                  item.verificationNote || item.reviewReason || '-',
                ])}
                empty="尚未提交 GPU 节点"
              />
            </Section>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="products" pt="md">
          <Stack>
            {supplier.status === 'APPROVED' && (
              <Section title="基于已验机节点发布 GPU 商品">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <Select
                    label="已验机节点"
                    placeholder="选择节点"
                    value={gpu.nodeId ? String(gpu.nodeId) : null}
                    data={(nodesQuery.data || [])
                      .filter((item) => item.status === 'RUNNING')
                      .map((item) => ({
                        value: String(item.id),
                        label: `${item.nodeName} · ${item.gpuModel} ${item.gpuMemoryGb}GB × ${item.gpuCount}`,
                      }))}
                    onChange={(value) => {
                      const selected = (nodesQuery.data || []).find((item) => item.id === Number(value))
                      setGpu({
                        ...gpu,
                        nodeId: Number(value) || 0,
                        ...(selected
                          ? {
                              gpuModel: selected.gpuModel,
                              gpuMemoryGb: selected.gpuMemoryGb,
                              gpuCount: selected.gpuCount,
                              region: selected.region,
                            }
                          : {}),
                      })
                    }}
                  />
                  <TextInput
                    label="商品名称"
                    value={gpu.name}
                    onChange={(e) => setGpu({ ...gpu, name: e.target.value })}
                  />
                  <TextInput
                    label="区域"
                    value={gpu.region}
                    onChange={(e) => setGpu({ ...gpu, region: e.target.value })}
                  />
                  <TextInput
                    label="GPU 型号"
                    value={gpu.gpuModel}
                    onChange={(e) => setGpu({ ...gpu, gpuModel: e.target.value })}
                  />
                  <NumberInput
                    label="显存 GB"
                    min={1}
                    value={gpu.gpuMemoryGb}
                    onChange={(value) => setGpu({ ...gpu, gpuMemoryGb: Number(value) || 0 })}
                  />
                  <NumberInput
                    label="GPU 数量"
                    min={1}
                    value={gpu.gpuCount}
                    onChange={(value) => setGpu({ ...gpu, gpuCount: Number(value) || 0 })}
                  />
                  <NumberInput
                    label="卡时 / GPU·小时"
                    min={0.001}
                    step={0.001}
                    decimalScale={3}
                    value={gpu.pricePerGpuHour}
                    onChange={(value) => setGpu({ ...gpu, pricePerGpuHour: Number(value) || 0 })}
                  />
                  <TextInput
                    label="可用开始时间"
                    type="datetime-local"
                    value={gpu.availableFrom}
                    onChange={(e) => setGpu({ ...gpu, availableFrom: e.target.value })}
                  />
                  <TextInput
                    label="可用结束时间"
                    type="datetime-local"
                    value={gpu.availableTo}
                    onChange={(e) => setGpu({ ...gpu, availableTo: e.target.value })}
                  />
                </SimpleGrid>
                <Textarea
                  mt="sm"
                  label="商品说明"
                  value={gpu.description}
                  onChange={(e) => setGpu({ ...gpu, description: e.target.value })}
                />
                <SimpleGrid cols={{ base: 1, sm: 2 }} mt="sm">
                  <TextInput
                    label="交付方式"
                    value={gpu.deliveryMode}
                    onChange={(e) => setGpu({ ...gpu, deliveryMode: e.target.value })}
                  />
                  <TextInput
                    label="SLA 说明"
                    value={gpu.slaDescription}
                    onChange={(e) => setGpu({ ...gpu, slaDescription: e.target.value })}
                  />
                </SimpleGrid>
                <Button
                  mt="md"
                  loading={busy === 'supplier-product'}
                  disabled={!gpu.nodeId}
                  onClick={() => run('supplier-product', () => createSupplierGpuProduct(gpu), 'GPU 商品已提交审核')}
                >
                  提交商品审核
                </Button>
              </Section>
            )}

            <Section title="我的商品">
              <SimpleTable
                columns={['商品', '类型', '规格/模型', '价格', '状态', '审核说明']}
                rows={(productsQuery.data || []).map((product) => [
                  product.name,
                  product.productType,
                  product.productType === 'GPU'
                    ? `${product.gpuModel} ${product.gpuMemoryGb}GB × ${product.gpuCount}`
                    : product.modelId,
                  product.productType === 'GPU'
                    ? `${formatCardHours(product.pricePerGpuHour)} / GPU·小时`
                    : `${formatCardHours(product.promptRatePerMillion)} / 百万 Token`,
                  statusLabel(product.status),
                  product.rejectionReason || '-',
                ])}
                empty="尚未发布商品"
              />
            </Section>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="orders" pt="md">
          <Section title="待交付与历史预订">
            <Stack>
              {(reservationsQuery.data || []).length === 0 ? (
                <Text c="chatbox-tertiary">暂无买方预订</Text>
              ) : (
                (reservationsQuery.data || []).map((reservation) => (
                  <ReservationCard
                    key={reservation.id}
                    reservation={reservation}
                    busy={busy}
                    run={run}
                    view="supplier"
                  />
                ))
              )}
            </Stack>
          </Section>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}

function NotificationsPanel({ busy, run }: { busy: string | null; run: RunAction }) {
  const query = useQuery({ queryKey: ['compute', 'notifications'], queryFn: listComputeNotifications })
  const notifications = query.data || []
  return (
    <Stack>
      {notifications.length === 0 ? (
        <EmptyState title="暂无通知" description="订单、转让和审核状态变化会显示在这里。" />
      ) : (
        notifications.map((notification) => (
          <NotificationCard key={notification.id} notification={notification} busy={busy} run={run} />
        ))
      )}
    </Stack>
  )
}

function NotificationCard({
  notification,
  busy,
  run,
}: {
  notification: ComputeNotification
  busy: string | null
  run: RunAction
}) {
  const unread = notification.isRead === 0
  const key = `notification-${notification.id}`
  return (
    <Paper withBorder p="md" radius="md" bg={unread ? 'var(--chatbox-background-brand-secondary)' : undefined}>
      <Flex justify="space-between" align="center" gap="md" wrap="wrap">
        <Box>
          <Group gap="xs">
            <Text fw={unread ? 700 : 500}>{notification.title}</Text>
            {unread && <Badge size="xs">未读</Badge>}
          </Group>
          <Text size="sm">{notification.content}</Text>
          <Text size="xs" c="chatbox-tertiary">
            {formatDate(notification.createTime)}
          </Text>
        </Box>
        {unread && (
          <Button
            size="xs"
            variant="light"
            loading={busy === key}
            onClick={() => run(key, () => markComputeNotificationRead(notification.id), '已标记为已读')}
          >
            标为已读
          </Button>
        )}
      </Flex>
    </Paper>
  )
}

function AdminPanel({ busy, run }: { busy: string | null; run: RunAction }) {
  const overviewQuery = useQuery({ queryKey: ['compute', 'admin-overview'], queryFn: getComputeAdminOverview })
  const identitiesQuery = useQuery({ queryKey: ['compute', 'admin-identities'], queryFn: listAdminIdentities })
  const nodesQuery = useQuery({ queryKey: ['compute', 'admin-nodes'], queryFn: listAdminNodes })
  const suppliersQuery = useQuery({ queryKey: ['compute', 'admin-suppliers'], queryFn: listAdminSuppliers })
  const productsQuery = useQuery({ queryKey: ['compute', 'admin-products'], queryFn: listAdminProducts })
  const transfersQuery = useQuery({ queryKey: ['compute', 'admin-transfers'], queryFn: listAdminTransfers })
  const reservationsQuery = useQuery({ queryKey: ['compute', 'admin-reservations'], queryFn: listAdminReservations })
  const [api, setApi] = useState({
    name: 'KOD 测试模型 API',
    description: '内部测试模型，购买固定 Token 套餐后使用。',
    region: 'KAI 公司中转站',
    modelId: '',
    packagePromptTokens: 1000000,
    packageCompletionTokens: 500000,
    packagePriceCardHours: 1,
    slaDescription: '内部测试价与 SLA，正式使用前需重新确认',
  })
  const [grant, setGrant] = useState({ recipientEmail: '', cardHours: 100, expiresAt: '', reason: '内部 MVP 测试' })

  return (
    <Stack gap="md">
      <AdminOverview overview={overviewQuery.data} />
      <Alert color="violet" title="管理员可以处理什么">
        审核实名认证、供应方、设备和商品；维护设备部署/运行/待处理状态；处理异常 GPU
        订单。本人提交的资料、设备和商品必须由另一名管理员审核。
      </Alert>
      <Tabs defaultValue="reviews" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="reviews">审核中心</Tabs.Tab>
          <Tabs.Tab value="operations">设备与订单</Tabs.Tab>
          <Tabs.Tab value="settings">运营设置</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="settings" pt="md">
          <Stack>
            <AdminSettings overview={overviewQuery.data} busy={busy} run={run} />

            <Section title="发放测试卡时">
              <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="sm">
                <TextInput
                  label="接收方邮箱"
                  value={grant.recipientEmail}
                  onChange={(e) => setGrant({ ...grant, recipientEmail: e.target.value })}
                />
                <NumberInput
                  label="卡时"
                  min={0.001}
                  decimalScale={3}
                  value={grant.cardHours}
                  onChange={(value) => setGrant({ ...grant, cardHours: Number(value) || 0 })}
                />
                <TextInput
                  label="到期时间（可选）"
                  type="datetime-local"
                  value={grant.expiresAt}
                  onChange={(e) => setGrant({ ...grant, expiresAt: e.target.value })}
                />
                <TextInput
                  label="发放原因"
                  value={grant.reason}
                  onChange={(e) => setGrant({ ...grant, reason: e.target.value })}
                />
              </SimpleGrid>
              <Button
                mt="md"
                loading={busy === 'admin-grant'}
                disabled={!grant.recipientEmail.trim() || !grant.reason.trim()}
                onClick={() =>
                  run(
                    'admin-grant',
                    () => grantAdminCardHours({ ...grant, expiresAt: grant.expiresAt || null }),
                    '测试卡时已发放'
                  )
                }
              >
                确认发放
              </Button>
            </Section>

            <Section title="创建公司模型 API 商品">
              <Alert color="yellow" mb="sm">
                模型 ID 必须与公司中转站用量日志中的 model_name 完全一致，否则无法路由到卡时账本。
              </Alert>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <TextInput
                  label="商品名称"
                  value={api.name}
                  onChange={(e) => setApi({ ...api, name: e.target.value })}
                />
                <TextInput
                  label="中转站模型 ID"
                  value={api.modelId}
                  onChange={(e) => setApi({ ...api, modelId: e.target.value })}
                />
                <NumberInput
                  label="套餐输入 Token"
                  min={1}
                  value={api.packagePromptTokens}
                  onChange={(value) => setApi({ ...api, packagePromptTokens: Number(value) || 0 })}
                />
                <NumberInput
                  label="套餐输出 Token"
                  min={1}
                  value={api.packageCompletionTokens}
                  onChange={(value) => setApi({ ...api, packageCompletionTokens: Number(value) || 0 })}
                />
                <NumberInput
                  label="套餐价格（卡时）"
                  min={0.001}
                  step={0.001}
                  decimalScale={3}
                  value={api.packagePriceCardHours}
                  onChange={(value) => setApi({ ...api, packagePriceCardHours: Number(value) || 0 })}
                />
              </SimpleGrid>
              <Textarea
                mt="sm"
                label="商品说明"
                value={api.description}
                onChange={(e) => setApi({ ...api, description: e.target.value })}
              />
              <TextInput
                mt="sm"
                label="SLA 说明"
                value={api.slaDescription}
                onChange={(e) => setApi({ ...api, slaDescription: e.target.value })}
              />
              <Button
                mt="md"
                loading={busy === 'admin-api-product'}
                disabled={!api.modelId.trim() || !api.name.trim()}
                onClick={() => run('admin-api-product', () => createAdminApiProduct(api), '模型 API 商品已上架')}
              >
                创建并上架
              </Button>
            </Section>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="reviews" pt="md">
          <Stack>
            <AdminIdentityReviews identities={identitiesQuery.data || []} busy={busy} run={run} />
            <AdminSupplierReviews suppliers={suppliersQuery.data || []} busy={busy} run={run} />
            <AdminNodeReviews nodes={nodesQuery.data || []} busy={busy} run={run} />
            <AdminProductReviews products={productsQuery.data || []} busy={busy} run={run} />
            <AdminTransferReviews transfers={transfersQuery.data || []} busy={busy} run={run} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="operations" pt="md">
          <Stack>
            <AdminNodeOperations nodes={nodesQuery.data || []} busy={busy} run={run} />
            <AdminReservationOperations reservations={reservationsQuery.data || []} busy={busy} run={run} />
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}

function AdminNodeOperations({ nodes, busy, run }: { nodes: ComputeGpuNode[]; busy: string | null; run: RunAction }) {
  const manageable = nodes.filter((item) => !['PENDING', 'REJECTED'].includes(item.status))
  const [targets, setTargets] = useState<Record<number, string>>({})
  const [reasons, setReasons] = useState<Record<number, string>>({})
  return (
    <Section title={`设备状态管理（${manageable.length}）`}>
      <Alert color="blue" mb="md">
        验机通过先进入“部署中”；只有“运行中”设备可以上架和接受新订单。切为“待处理”或“已离线”会暂停商品，并把现有订单交给异常订单处理。
      </Alert>
      <Stack>
        {manageable.length === 0 ? (
          <Text c="chatbox-tertiary">暂无已验机设备</Text>
        ) : (
          manageable.map((item) => {
            const target = targets[item.id] || item.status
            return (
              <Paper key={item.id} withBorder p="md" radius="md">
                <Flex justify="space-between" align="end" gap="md" wrap="wrap">
                  <Box style={{ minWidth: 220 }}>
                    <Group gap="xs">
                      <Text fw={600}>{item.nodeName}</Text>
                      <StatusBadge status={item.status} />
                    </Group>
                    <Text size="sm" c="chatbox-tertiary">
                      {item.email} · {item.gpuModel} {item.gpuMemoryGb}GB × {item.gpuCount}
                    </Text>
                  </Box>
                  <Select
                    label="切换状态"
                    w={190}
                    value={target}
                    data={[
                      { value: 'DEPLOYING', label: '部署中' },
                      { value: 'RUNNING', label: '运行中' },
                      { value: 'PENDING_ACTION', label: '待处理' },
                      { value: 'OFFLINE', label: '已离线' },
                    ]}
                    onChange={(value) => setTargets({ ...targets, [item.id]: value || item.status })}
                  />
                  <TextInput
                    label="原因/说明"
                    placeholder="待处理、离线时必填"
                    value={reasons[item.id] || ''}
                    onChange={(e) => setReasons({ ...reasons, [item.id]: e.target.value })}
                    style={{ flex: 1, minWidth: 220 }}
                  />
                  <Button
                    loading={busy === `node-status-${item.id}`}
                    disabled={
                      target === item.status ||
                      (['PENDING_ACTION', 'OFFLINE'].includes(target) && !reasons[item.id]?.trim())
                    }
                    onClick={() =>
                      run(
                        `node-status-${item.id}`,
                        () => updateAdminNodeStatus(item.id, target, reasons[item.id] || ''),
                        '设备状态已更新'
                      )
                    }
                  >
                    保存状态
                  </Button>
                </Flex>
              </Paper>
            )
          })
        )}
      </Stack>
    </Section>
  )
}

function AdminReservationOperations({
  reservations,
  busy,
  run,
}: {
  reservations: ComputeReservation[]
  busy: string | null
  run: RunAction
}) {
  const actionable = reservations.filter(
    (item) =>
      item.status === 'EXCEPTION_PENDING' ||
      (['CONFIRMED', 'IN_USE'].includes(item.status) && new Date(item.endTime).getTime() <= Date.now())
  )
  const [resolutions, setResolutions] = useState<Record<number, 'FULL_REFUND' | 'ACTUAL_USAGE' | 'FULL_SETTLEMENT'>>({})
  const [actuals, setActuals] = useState<Record<number, number>>({})
  const [reasons, setReasons] = useState<Record<number, string>>({})
  return (
    <Section title={`异常与待结算订单（${actionable.length}）`}>
      {actionable.length === 0 ? (
        <Text c="chatbox-tertiary">暂无需要人工处理的订单</Text>
      ) : (
        <Stack>
          {actionable.map((item) => {
            const exception = item.status === 'EXCEPTION_PENDING'
            const resolution = resolutions[item.id] || 'FULL_REFUND'
            return (
              <Paper key={item.id} withBorder p="md" radius="md">
                <Stack gap="sm">
                  <Flex justify="space-between" gap="md" wrap="wrap">
                    <Box>
                      <Group gap="xs">
                        <Text fw={600}>{item.productName}</Text>
                        <StatusBadge status={item.status} />
                      </Group>
                      <Text size="sm" c="chatbox-tertiary">
                        买方 {item.buyerEmail} · 供应方 {item.supplierEmail || '-'} · {formatDate(item.startTime)} 至{' '}
                        {formatDate(item.endTime)}
                      </Text>
                    </Box>
                    <Text fw={700}>冻结 {formatCardHours(item.frozenCardHours)} 卡时</Text>
                  </Flex>
                  {item.incidentReason && <Alert color="red">异常原因：{item.incidentReason}</Alert>}
                  {exception ? (
                    <>
                      <SimpleGrid cols={{ base: 1, sm: 3 }}>
                        <Select
                          label="处理方式"
                          value={resolution}
                          data={[
                            { value: 'FULL_REFUND', label: '全额退还买方' },
                            { value: 'ACTUAL_USAGE', label: '按实际使用结算' },
                            { value: 'FULL_SETTLEMENT', label: '按原订单正常结算' },
                          ]}
                          onChange={(value) =>
                            setResolutions({
                              ...resolutions,
                              [item.id]: (value || 'FULL_REFUND') as 'FULL_REFUND' | 'ACTUAL_USAGE' | 'FULL_SETTLEMENT',
                            })
                          }
                        />
                        <NumberInput
                          label="实际结算卡时"
                          disabled={resolution !== 'ACTUAL_USAGE'}
                          min={0.001}
                          max={item.frozenCardHours}
                          decimalScale={3}
                          value={actuals[item.id] || 0}
                          onChange={(value) => setActuals({ ...actuals, [item.id]: Number(value) || 0 })}
                        />
                        <TextInput
                          label="处理原因"
                          value={reasons[item.id] || ''}
                          onChange={(e) => setReasons({ ...reasons, [item.id]: e.target.value })}
                        />
                      </SimpleGrid>
                      <Button
                        loading={busy === `resolve-${item.id}`}
                        disabled={
                          !reasons[item.id]?.trim() || (resolution === 'ACTUAL_USAGE' && !(actuals[item.id] > 0))
                        }
                        onClick={() =>
                          run(
                            `resolve-${item.id}`,
                            () =>
                              resolveAdminReservation(item.id, {
                                resolution,
                                actualCardHours: actuals[item.id],
                                reason: reasons[item.id] || '',
                              }),
                            '异常订单已处理并完成账务结算'
                          )
                        }
                      >
                        确认处理
                      </Button>
                    </>
                  ) : (
                    <Button
                      loading={busy === `settle-${item.id}`}
                      onClick={() => run(`settle-${item.id}`, () => settleAdminReservation(item.id), '订单已立即结算')}
                    >
                      立即结算（定时任务补偿）
                    </Button>
                  )}
                </Stack>
              </Paper>
            )
          })}
        </Stack>
      )}
    </Section>
  )
}

function AdminOverview({ overview }: { overview?: ComputeAdminOverview }) {
  const items = [
    ['待审实名认证', overview?.identitiesPending || 0],
    ['待审供应方', overview?.suppliersPending || 0],
    ['待验机设备', overview?.nodesPending || 0],
    ['待审产品', overview?.productsPending || 0],
    ['待处理设备', overview?.nodesPendingAction || 0],
  ]
  return (
    <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="sm">
      {items.map(([label, value]) => (
        <Paper key={String(label)} withBorder p="md" radius="md">
          <Text size="xs" c="chatbox-tertiary">
            {label}
          </Text>
          <Text size="xl" fw={700}>
            {value}
          </Text>
        </Paper>
      ))}
    </SimpleGrid>
  )
}

function AdminSettings({
  overview,
  busy,
  run,
}: {
  overview?: ComputeAdminOverview
  busy: string | null
  run: RunAction
}) {
  const [transferReviewThreshold, setTransferReviewThreshold] = useState(1000)
  const [platformFeePercent, setPlatformFeePercent] = useState(0)

  useEffect(() => {
    if (!overview) return
    setTransferReviewThreshold(Number(overview.transferReviewThreshold))
    setPlatformFeePercent(Number(overview.platformFeeRate) * 100)
  }, [overview])

  return (
    <Section title="结算规则">
      <Flex align="end" gap="md" wrap="wrap">
        <NumberInput
          label="大额转让审核阈值（卡时）"
          min={0.001}
          decimalScale={3}
          value={transferReviewThreshold}
          onChange={(value) => setTransferReviewThreshold(Number(value) || 0)}
          w={240}
        />
        <NumberInput
          label="平台服务费（%）"
          description="内部 MVP 默认 0%"
          min={0}
          max={100}
          decimalScale={4}
          value={platformFeePercent}
          onChange={(value) => setPlatformFeePercent(Number(value) || 0)}
          w={220}
        />
        <Button
          loading={busy === 'admin-settings'}
          disabled={transferReviewThreshold <= 0 || platformFeePercent < 0 || platformFeePercent > 100}
          onClick={() =>
            run(
              'admin-settings',
              () =>
                updateComputeAdminSettings({
                  transferReviewThreshold,
                  platformFeeRate: platformFeePercent / 100,
                }),
              '结算规则已更新'
            )
          }
        >
          保存规则
        </Button>
      </Flex>
    </Section>
  )
}

function AdminIdentityReviews({
  identities,
  busy,
  run,
}: {
  identities: ComputeIdentity[]
  busy: string | null
  run: RunAction
}) {
  const pending = identities.filter((item) => item.status === 'PENDING')
  const [reasons, setReasons] = useState<Record<number, string>>({})
  const [details, setDetails] = useState<Record<number, ComputeIdentity>>({})
  const openDocument = async (identityId: number, side: 'front' | 'back') => {
    const blob = await getAdminIdentityDocument(identityId, side)
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  const review = (item: ComputeIdentity, approved: boolean) => {
    const identityId = item.id
    if (!identityId) return Promise.resolve(false)
    return run(
      `identity-${identityId}`,
      () => reviewAdminIdentity(identityId, approved, approved ? '' : reasons[identityId] || ''),
      approved ? (item.verificationType === 'TEST' ? '仅内测认证已通过' : '实名认证已通过') : '实名认证已拒绝'
    )
  }
  return (
    <Section title={`实名认证审核（${pending.length}）`}>
      {pending.length === 0 ? (
        <Text c="chatbox-tertiary">暂无待审核实名认证</Text>
      ) : (
        <Stack>
          {pending.map((item) => (
            <Paper key={item.id} withBorder p="md" radius="md">
              <Stack gap="xs">
                <Group>
                  <Text fw={600}>{item.email}</Text>
                  <Badge color={item.verificationType === 'TEST' ? 'orange' : 'blue'}>
                    {item.verificationType === 'TEST' ? '仅内测模拟认证' : '真实认证'}
                  </Badge>
                </Group>
                <Text size="sm">证件号：{item.identityNoMasked || '-'}</Text>
                {item.id && details[item.id] && (
                  <Alert color="yellow">
                    姓名：{details[item.id].realName}；完整证件号：{details[item.id].identityNo}（仅限本次审核查看）
                  </Alert>
                )}
                <Group>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={async () =>
                      item.id && setDetails({ ...details, [item.id]: await getAdminIdentity(item.id) })
                    }
                  >
                    查看解密详情
                  </Button>
                  <Button size="xs" variant="light" onClick={() => item.id && openDocument(item.id, 'front')}>
                    查看正面
                  </Button>
                  <Button size="xs" variant="light" onClick={() => item.id && openDocument(item.id, 'back')}>
                    查看反面
                  </Button>
                </Group>
                <TextInput
                  placeholder="拒绝时必须填写原因"
                  value={reasons[item.id || 0] || ''}
                  onChange={(e) => setReasons({ ...reasons, [item.id || 0]: e.target.value })}
                />
                <Group justify="flex-end">
                  <Button
                    color="red"
                    variant="light"
                    disabled={!reasons[item.id || 0]?.trim()}
                    loading={busy === `identity-${item.id}`}
                    onClick={() => review(item, false)}
                  >
                    拒绝
                  </Button>
                  <Button loading={busy === `identity-${item.id}`} onClick={() => review(item, true)}>
                    通过
                  </Button>
                </Group>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Section>
  )
}

function AdminNodeReviews({ nodes, busy, run }: { nodes: ComputeGpuNode[]; busy: string | null; run: RunAction }) {
  const pending = nodes.filter((item) => item.status === 'PENDING')
  const [reasons, setReasons] = useState<Record<number, string>>({})
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [credentials, setCredentials] = useState<Record<number, string>>({})
  return (
    <Section title={`GPU 节点验机（${pending.length}）`}>
      {pending.length === 0 ? (
        <Text c="chatbox-tertiary">暂无待验机节点</Text>
      ) : (
        <Stack>
          {pending.map((item) => (
            <Paper key={item.id} withBorder p="md" radius="md">
              <Stack gap="xs">
                <Group>
                  <Text fw={600}>
                    {item.nodeName} · {item.email}
                  </Text>
                  {Boolean(item.isTest) && <Badge color="orange">仅内测</Badge>}
                </Group>
                <Text size="sm">
                  {item.gpuModel} {item.gpuMemoryGb}GB × {item.gpuCount}；CPU {item.cpuDescription || '-'}；内存{' '}
                  {item.ramGb}GB；存储 {item.storageGb}GB
                </Text>
                {credentials[item.id] && <Alert color="yellow">{credentials[item.id]}</Alert>}
                <Button
                  size="xs"
                  variant="light"
                  w="fit-content"
                  onClick={async () => {
                    const value = await getAdminNodeCredential(item.id)
                    setCredentials({
                      ...credentials,
                      [item.id]: `${value.sshUsername}@${value.sshHost}:${value.sshPort}；${value.sshAuthType}；凭据：${value.sshCredential}`,
                    })
                  }}
                >
                  临时解密 SSH 凭据
                </Button>
                <TextInput
                  label="验机说明"
                  value={notes[item.id] || ''}
                  onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })}
                />
                <TextInput
                  placeholder="拒绝时必须填写原因"
                  value={reasons[item.id] || ''}
                  onChange={(e) => setReasons({ ...reasons, [item.id]: e.target.value })}
                />
                <Group justify="flex-end">
                  <Button
                    color="red"
                    variant="light"
                    disabled={!reasons[item.id]?.trim()}
                    loading={busy === `node-${item.id}`}
                    onClick={() =>
                      run(
                        `node-${item.id}`,
                        () => reviewAdminNode(item.id, false, reasons[item.id] || '', notes[item.id] || ''),
                        '节点验机已拒绝'
                      )
                    }
                  >
                    拒绝
                  </Button>
                  <Button
                    loading={busy === `node-${item.id}`}
                    onClick={() =>
                      run(
                        `node-${item.id}`,
                        () => reviewAdminNode(item.id, true, '', notes[item.id] || ''),
                        '节点验机已通过'
                      )
                    }
                  >
                    通过
                  </Button>
                </Group>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Section>
  )
}

function AdminSupplierReviews({
  suppliers,
  busy,
  run,
}: {
  suppliers: ComputeSupplier[]
  busy: string | null
  run: RunAction
}) {
  const pending = suppliers.filter((supplier) => supplier.status === 'PENDING')
  return (
    <Section title={`供应方审核（${pending.length}）`}>
      <ReviewList
        empty="暂无待审核供应方"
        items={pending.map((supplier) => ({
          key: `supplier-${supplier.id}`,
          title: `${supplier.displayName} · ${supplier.email}`,
          description: `${supplier.contact || '未留联系方式'}；${supplier.description || '无说明'}`,
          onReview: (approved, reason) =>
            run(
              `admin-supplier-${supplier.id}`,
              () => reviewAdminSupplier(supplier.id || 0, approved, reason),
              approved ? '供应方已通过' : '供应方已拒绝'
            ),
          loading: busy === `admin-supplier-${supplier.id}`,
        }))}
      />
    </Section>
  )
}

function AdminProductReviews({
  products,
  busy,
  run,
}: {
  products: ComputeProduct[]
  busy: string | null
  run: RunAction
}) {
  const pending = products.filter((product) => product.status === 'PENDING')
  return (
    <Section title={`商品审核（${pending.length}）`}>
      <ReviewList
        empty="暂无待审核商品"
        items={pending.map((product) => ({
          key: `product-${product.id}`,
          title: `${product.name} · ${product.productType}`,
          description:
            product.productType === 'GPU'
              ? `${product.gpuModel} ${product.gpuMemoryGb}GB × ${product.gpuCount}，${formatCardHours(product.pricePerGpuHour)} 卡时/GPU·小时`
              : `${product.modelId}`,
          onReview: (approved, reason) =>
            run(
              `admin-product-${product.id}`,
              () => reviewAdminProduct(product.id, approved, reason),
              approved ? '商品已上架' : '商品已拒绝'
            ),
          loading: busy === `admin-product-${product.id}`,
        }))}
      />
    </Section>
  )
}

function AdminTransferReviews({
  transfers,
  busy,
  run,
}: {
  transfers: ComputeTransfer[]
  busy: string | null
  run: RunAction
}) {
  return (
    <Section title={`大额转让审核（${transfers.length}）`}>
      <ReviewList
        empty="暂无待审核大额转让"
        items={transfers.map((transfer) => ({
          key: `transfer-${transfer.id}`,
          title: `${formatCardHours(transfer.amount)} 卡时 · ${transfer.senderEmail} → ${transfer.recipientEmail}`,
          description: transfer.message || '无留言',
          onReview: (approved, reason) =>
            run(
              `admin-transfer-${transfer.id}`,
              () => reviewAdminTransfer(transfer.id, approved, reason),
              approved ? '大额转让已通过' : '大额转让已拒绝'
            ),
          loading: busy === `admin-transfer-${transfer.id}`,
        }))}
      />
    </Section>
  )
}

function ReviewList({
  items,
  empty,
}: {
  items: Array<{
    key: string
    title: string
    description: string
    loading: boolean
    onReview: (approved: boolean, reason: string) => Promise<unknown>
  }>
  empty: string
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({})
  if (items.length === 0) return <Text c="chatbox-tertiary">{empty}</Text>
  return (
    <Stack>
      {items.map((item) => (
        <Paper key={item.key} withBorder p="md" radius="md">
          <Stack gap="xs">
            <Text fw={600}>{item.title}</Text>
            <Text size="sm" c="chatbox-tertiary">
              {item.description}
            </Text>
            <TextInput
              placeholder="拒绝时必须填写原因"
              value={reasons[item.key] || ''}
              onChange={(e) => setReasons({ ...reasons, [item.key]: e.target.value })}
            />
            <Group justify="flex-end">
              <Button
                variant="light"
                color="red"
                loading={item.loading}
                disabled={!reasons[item.key]?.trim()}
                onClick={() => item.onReview(false, reasons[item.key] || '')}
              >
                拒绝
              </Button>
              <Button loading={item.loading} onClick={() => item.onReview(true, '')}>
                通过
              </Button>
            </Group>
          </Stack>
        </Paper>
      ))}
    </Stack>
  )
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Group align="flex-start">
        <ThemeIcon variant="light" size="lg">
          {icon}
        </ThemeIcon>
        <Box>
          <Text size="xs" c="chatbox-tertiary">
            {label}
          </Text>
          <Text size="xl" fw={700}>
            {value}
          </Text>
        </Box>
      </Group>
    </Paper>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Title order={5} mb="sm">
        {title}
      </Title>
      {children}
    </Paper>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Paper withBorder p="xl" radius="md" ta="center">
      <ThemeIcon variant="light" radius="xl" size="xl" mx="auto" mb="sm">
        <IconCpu />
      </ThemeIcon>
      <Text fw={600}>{title}</Text>
      <Text size="sm" c="chatbox-tertiary">
        {description}
      </Text>
    </Paper>
  )
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <Flex justify="space-between" gap="md">
      <Text size="sm" c="chatbox-tertiary">
        {label}
      </Text>
      <Text size="sm" fw={500} ta="right">
        {value}
      </Text>
    </Flex>
  )
}

function SimpleTable({
  columns,
  rows,
  empty,
}: {
  columns: string[]
  rows: Array<Array<React.ReactNode>>
  empty: string
}) {
  if (rows.length === 0) return <Text c="chatbox-tertiary">{empty}</Text>
  return (
    <ScrollArea>
      <Table striped highlightOnHover miw={720}>
        <Table.Thead>
          <Table.Tr>
            {columns.map((column) => (
              <Table.Th key={column}>{column}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row, rowIndex) => (
            <Table.Tr key={`${rowIndex}-${String(row[0])}`}>
              {row.map((cell, cellIndex) => (
                <Table.Td key={`${cellIndex}-${String(cell)}`}>{cell}</Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  )
}

function LedgerTable({ entries }: { entries: ComputeLedgerEntry[] }) {
  return (
    <SimpleTable
      columns={['时间', '类型', '变动', '可用余额', '冻结余额', '说明']}
      rows={entries.map((entry) => [
        formatDate(entry.createTime),
        statusLabel(entry.entryType),
        <Text key="amount" c={entry.direction === 'CREDIT' ? 'green' : 'red'}>
          {entry.direction === 'CREDIT' ? '+' : '-'}
          {formatCardHours(entry.amount)}
        </Text>,
        formatCardHours(entry.availableAfter),
        formatCardHours(entry.frozenAfter),
        entry.description,
      ])}
      empty="暂无卡时流水"
    />
  )
}

function ApiUsageTable({ entries }: { entries: ComputeApiUsage[] }) {
  return (
    <SimpleTable
      columns={['时间', '模型', '输入（扣除/赠送）', '输出（扣除/赠送）', '状态']}
      rows={entries.map((entry) => [
        formatDate(entry.createTime),
        entry.modelId,
        `${formatTokens(entry.deductedPromptTokens)} / ${formatTokens(entry.giftedPromptTokens)}`,
        `${formatTokens(entry.deductedCompletionTokens)} / ${formatTokens(entry.giftedCompletionTokens)}`,
        statusLabel(entry.status),
      ])}
      empty="尚无模型 API Token 用量"
    />
  )
}

function OrdersTable({ orders }: { orders: ComputeOrder[] }) {
  return (
    <SimpleTable
      columns={['时间', '订单号', '类型', '商品', '卡时', '人民币', '状态']}
      rows={orders.map((order) => [
        formatDate(order.createTime),
        order.orderNo,
        statusLabel(order.orderType),
        order.productName || '-',
        formatCardHours(order.cardHours),
        `¥${formatNumber(order.cnyAmount, 4)}`,
        statusLabel(order.status),
      ])}
      empty="暂无订单"
    />
  )
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status.includes('COMPLETED') || status === 'PUBLISHED' || status === 'APPROVED'
      ? 'green'
      : status.includes('REJECT') || status.includes('CANCEL') || status === 'EXPIRED'
        ? 'red'
        : status.includes('PENDING')
          ? 'yellow'
          : 'blue'
  return (
    <Badge color={color} variant="light">
      {statusLabel(status)}
    </Badge>
  )
}

const STATUS_LABELS: Record<string, string> = {
  NONE: '未申请',
  PENDING: '待审核',
  APPROVED: '已通过',
  TEST_APPROVED: '仅内测认证已通过',
  REVOKED: '已注销',
  SUSPENDED: '已暂停',
  OFFLINE: '已离线/下架',
  DEPLOYING: '部署中',
  RUNNING: '运行中',
  PENDING_ACTION: '待处理',
  PAUSED: '已暂停接单',
  PUBLISHED: '已上架',
  REJECTED: '已拒绝',
  ACTIVE: '使用中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  EXPIRED: '已过期',
  PENDING_REVIEW: '待管理员审核',
  PENDING_RECIPIENT: '待接收方确认',
  PENDING_DELIVERY: '待供应方交付',
  CONFIRMED: '已确认',
  IN_USE: '使用中',
  EXCEPTION_PENDING: '异常待处理',
  REFUNDED: '已退款',
  FROZEN: '已冻结',
  CARD_HOUR_PURCHASE: '购买卡时',
  API_ACTIVATION: '开通 API',
  API_PACKAGE: 'Token 套餐',
  API_PACKAGE_PURCHASE: '购买 Token 套餐',
  GPU_RESERVATION: 'GPU 预订',
  PURCHASE: '购买',
  ADMIN_GRANT: '管理员发放',
  API_USAGE: 'API 消耗',
  PAID: '已从套餐扣除',
  GIFTED_OVERAGE: '额度耗尽，超额已赠送',
  NO_PACKAGE: '无套餐，未扣人民币',
  PARTIAL: '部分额度已耗尽',
  EXHAUSTED: '已耗尽',
  SUPPLIER_INCOME: '供应方收入',
  GPU_RENTAL_INCOME: 'GPU 租金收益',
  API_SALES_INCOME: 'Token 套餐销售收益',
  WITHDRAWAL: '提现到内部钱包',
  GPU_SETTLEMENT: 'GPU 订单结算',
  GPU_REFUND: 'GPU 订单退款',
  AUTO_SETTLEMENT: '自动结算',
  FULL_REFUND: '全额退款',
  ACTUAL_USAGE: '按实际使用结算',
  FULL_SETTLEMENT: '按原订单结算',
  TRANSFER_IN: '转入',
  TRANSFER_OUT: '转出',
  FREEZE: '冻结',
  UNFREEZE: '解冻',
  CONSUME_FROZEN: '冻结结算',
  EXPIRE: '到期',
}

function statusLabel(status?: string | null) {
  if (!status) return '-'
  return STATUS_LABELS[status] || status
}

function formatNumber(value: number | string | null | undefined, digits = 3) {
  const number = Number(value || 0)
  return Number.isFinite(number)
    ? number.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '-'
}

function formatCardHours(value: number | string | null | undefined) {
  return formatNumber(value, 3)
}

function formatTokens(value: number | string | null | undefined) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? Math.trunc(number).toLocaleString('zh-CN') : '-'
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value.replace('T', ' ') : date.toLocaleString('zh-CN', { hour12: false })
}
