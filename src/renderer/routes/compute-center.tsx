import {
  ActionIcon,
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
  MultiSelect,
  NumberInput,
  Paper,
  ScrollArea,
  SegmentedControl,
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
  UnstyledButton,
} from '@mantine/core'
import {
  IconBell,
  IconBuildingStore,
  IconChartLine,
  IconChevronDown,
  IconCopy,
  IconCpu,
  IconDatabaseDollar,
  IconExternalLink,
  IconGauge,
  IconGift,
  IconReceipt,
  IconRefresh,
  IconServer,
  IconShieldCheck,
  IconThumbUp,
  IconWallet,
} from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { AdminProductReviewCard, AdminReviewHistory } from '@/components/compute/AdminMarketplaceReview'
import { CardHourAdminPanel, CardHourBusiness, CardHourMarketplace } from '@/components/compute/CardHourBusiness'
import { HostedComputePanel } from '@/components/compute/HostedComputePanel'
import { MarketplaceOrderWorkspace } from '@/components/compute/MarketplaceOrderWorkspace'
import Page from '@/components/layout/Page'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import {
  acceptComputeTransfer,
  activateComputeApi,
  applyComputeSupplier,
  bindComputeReferral,
  type CardHourTopUpQuote,
  type ComputeAccount,
  type ComputeAdminOverview,
  type ComputeApiUsage,
  ComputeCenterApiError,
  type ComputeGpuNode,
  type ComputeIdentity,
  type ComputeLedgerEntry,
  type ComputeMarketPricePoint,
  type ComputeMarketPriceQuote,
  type ComputeMarketPriceRange,
  type ComputeMarketPriceSource,
  type ComputeMarketRentalTerm,
  type ComputeNodeInput,
  type ComputeNotification,
  type ComputeOrder,
  type ComputePackageCredential,
  type ComputePackagePurchase,
  type ComputeProduct,
  type ComputeReferralPreview,
  type ComputeReferralProfile,
  type ComputeReferralReward,
  type ComputeReservation,
  type ComputeSupplier,
  type ComputeSuspendedProxyKey,
  type ComputeTransfer,
  type ComputeUpstreamOption,
  type ComputeWithdrawal,
  cancelComputeReservation,
  cancelComputeTransfer,
  configureAdminProductUpstream,
  confirmComputeReservation,
  createAdminApiProduct,
  createComputeReservation,
  createComputeTransfer,
  createSupplierGpuProduct,
  createSupplierNode,
  createTestComputeIdentity,
  deliverComputeReservation,
  disputeComputeReservation,
  getAdminIdentity,
  getAdminIdentityDocument,
  getAdminNodeProof,
  getComputeAccount,
  getComputeAdminOverview,
  getComputeConfig,
  getComputeIdentity,
  getComputeMarketPriceHistory,
  getComputeMarketPrices,
  getComputePackageCredential,
  getComputeProductImageUrl,
  getComputeReferralProfile,
  getComputeSupplier,
  grantAdminCardHours,
  listAdminIdentities,
  listAdminNodes,
  listAdminProducts,
  listAdminReservations,
  listAdminSuppliers,
  listAdminSuspendedProxyKeys,
  listAdminTransfers,
  listAdminUpstreams,
  listComputeApiUsage,
  listComputeLedger,
  listComputeNotifications,
  listComputeOrders,
  listComputePackagePurchases,
  listComputeProducts,
  listComputeReferralRewards,
  listComputeReservations,
  listComputeTransfers,
  listComputeWithdrawals,
  listSupplierNodes,
  listSupplierProducts,
  markComputeNotificationRead,
  type ProductType,
  previewComputeReferral,
  purchaseCardHours,
  regenerateComputePackageKey,
  repairAdminProxyKey,
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
import { addHoursToLocalDateTime, resolvePackageDurationHours } from '@/packages/computeDeliveryTime'
import { ORDER_MESSAGE_NOTIFICATION, shouldNotifyOrderUnread } from '@/packages/computeMarketplace/projections'
import {
  COMPUTE_MARKET_DEFAULT_REGION,
  type ComputeMarketComparisonPoint,
  type ComputeMarketGetDeployingVastComparison,
  compareGetDeployingAndVastPrices,
  buildComputeMarketMonotoneSvgPath,
  deriveComputeMarketRegions,
  filterComputeMarketPricePoints,
  getComputeMarketDisplayCnyPrice,
  getComputeMarketExactSpecKey,
  getComputeMarketRegionCode,
  getComputeMarketRegionLabel,
  getComputeMarketRentalTerm,
  groupComputeMarketPricePointsBySource,
  mergeComputeMarketPricePoints,
} from '@/packages/computeMarketPriceComparison'
import {
  COMPUTE_PRODUCT_LIKE_COUNTS_KEY,
  COMPUTE_PRODUCT_SORT_OPTIONS,
  type ComputeProductLikeCounts,
  type ComputeProductSortMode,
  filterAndSortComputeProducts,
  getComputeProductLikeCount,
  incrementComputeProductLikeCount,
  normalizeComputeProductLikeCounts,
} from '@/packages/computeMarketState'
import { classifyComputeReservationReview } from '@/packages/computeReservationReview'
import { copyToClipboard } from '@/packages/navigator'
import platform from '@/platform'
import { useAuthInfoStore } from '@/stores/authInfoStore'

const computeSearchSchema = z.object({
  invite: z.string().max(64).optional(),
})

export const Route = createFileRoute('/compute-center')({
  component: ComputeCenterPage,
  validateSearch: zodValidator(computeSearchSchema),
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

const gpuAssetStatuses = [
  ['PENDING', '待审核', 'yellow'],
  ['REJECTED', '审核失败', 'red'],
  ['RUNNING', '可发布', 'teal'],
  ['PENDING_DELIVERY', '待交付', 'orange'],
  ['ACTIVE_RENTAL', '运行中', 'green'],
  ['PENDING_ACTION', '待处理', 'red'],
  ['OFFLINE', '已关闭', 'gray'],
] as const

function ComputeCenterPage() {
  const search = Route.useSearch()
  const isSmallScreen = useIsSmallScreen()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isLoggedIn = useAuthInfoStore((state) => Boolean(state.accessToken))
  const [activeTab, setActiveTab] = useState('market')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<FeedbackMessage | null>(null)
  const [cardHourPrompt, setCardHourPrompt] = useState<CardHourPrompt | null>(null)
  const previousUnreadOrderMessages = useRef<number | null>(null)
  const [productLikeCounts, setProductLikeCounts] = useState<ComputeProductLikeCounts>({})
  const [productLikeCountsLoaded, setProductLikeCountsLoaded] = useState(false)
  const productLikeCountsRef = useRef<ComputeProductLikeCounts>({})
  const productLikeWriteQueueRef = useRef<Promise<void>>(Promise.resolve())
  const closeMessage = useCallback(() => setMessage(null), [])

  useEffect(() => {
    let cancelled = false
    void platform
      .getStoreValue(COMPUTE_PRODUCT_LIKE_COUNTS_KEY)
      .then((value) => {
        if (cancelled) return
        const storedCounts = normalizeComputeProductLikeCounts(value)
        productLikeCountsRef.current = storedCounts
        setProductLikeCounts(storedCounts)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setProductLikeCountsLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleProductLike = useCallback((productId: number) => {
    const nextCounts = incrementComputeProductLikeCount(productLikeCountsRef.current, productId)
    productLikeCountsRef.current = nextCounts
    setProductLikeCounts(nextCounts)

    productLikeWriteQueueRef.current = productLikeWriteQueueRef.current
      .catch(() => undefined)
      .then(() => platform.setStoreValue(COMPUTE_PRODUCT_LIKE_COUNTS_KEY, nextCounts))
      .catch((error) => {
        console.error('Failed to persist compute product like counts:', error)
      })
  }, [])

  const configQuery = useQuery({ queryKey: ['compute', 'config'], queryFn: getComputeConfig })
  const productsQuery = useQuery({
    queryKey: ['compute', 'products'],
    queryFn: () => listComputeProducts(),
    retry: 1,
  })
  const accountQuery = useQuery({
    queryKey: ['compute', 'account'],
    queryFn: getComputeAccount,
    enabled: isLoggedIn,
    refetchInterval: 5000,
  })
  const referralPreviewQuery = useQuery({
    queryKey: ['compute', 'referral-preview', search.invite],
    queryFn: () => previewComputeReferral(search.invite || ''),
    enabled: isLoggedIn && Boolean(search.invite),
    retry: false,
  })

  useEffect(() => {
    if (isLoggedIn && search.invite) setActiveTab('account')
  }, [isLoggedIn, search.invite])

  useEffect(() => {
    if (!isLoggedIn) {
      previousUnreadOrderMessages.current = null
      return
    }
    const unread = accountQuery.data?.unreadOrderMessages
    if (unread === undefined) return
    const previous = previousUnreadOrderMessages.current
    previousUnreadOrderMessages.current = unread
    if (
      shouldNotifyOrderUnread(previous, unread) &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      new Notification(ORDER_MESSAGE_NOTIFICATION.title, { body: ORDER_MESSAGE_NOTIFICATION.body })
    }
  }, [accountQuery.data?.unreadOrderMessages, isLoggedIn])

  useEffect(() => {
    if (!isLoggedIn) return
    const refreshWallet = () => void queryClient.invalidateQueries({ queryKey: ['compute', 'account'] })
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshWallet()
    }
    window.addEventListener('focus', refreshWallet)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', refreshWallet)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [isLoggedIn, queryClient])

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
    { value: 'card-hours', label: '卡时资产', icon: <IconDatabaseDollar size={16} /> },
    { value: 'account', label: '我的资产', icon: <IconWallet size={16} />, login: true },
    { value: 'purchases', label: '购买记录', icon: <IconReceipt size={16} />, login: true },
    { value: 'reservations', label: '租赁订单', icon: <IconServer size={16} />, login: true },
    { value: 'supplier', label: '我的设备', icon: <IconCpu size={16} />, login: true },
    { value: 'notifications', label: '通知', icon: <IconBell size={16} />, login: true },
  ]

  return (
    <Page title="KOD 算力中心">
      <Container size="xl" py={isSmallScreen ? 'sm' : 'md'} px={isSmallScreen ? 'xs' : 'md'}>
        <Stack gap="md">
          <Hero
            account={account}
            rate={configQuery.data?.cardHourCnyRate}
            onOpen={setActiveTab}
            refreshing={accountQuery.isFetching}
            onRefresh={() => void accountQuery.refetch()}
          />

          {!isLoggedIn && (
            <Alert color="blue" title="公开浏览模式">
              <Flex align="center" justify="space-between" gap="md" wrap="wrap">
                <Text size="sm">你可以浏览商品；购买卡时、购买套餐、转让和资源商操作需要登录。</Text>
                <Button size="xs" onClick={() => navigate({ to: '/settings/provider/chatbox-ai' })}>
                  登录 KOD
                </Button>
              </Flex>
            </Alert>
          )}

          <FeedbackToast message={message} onClose={closeMessage} />
          <CardHourTopUpModal prompt={cardHourPrompt} />
          <ReferralInviteModal
            opened={isLoggedIn && Boolean(search.invite)}
            preview={referralPreviewQuery.data}
            loading={referralPreviewQuery.isLoading}
            error={referralPreviewQuery.error}
            busy={busy === 'referral-bind'}
            onClose={() => navigate({ to: '/compute-center', search: {} })}
            onConfirm={() => {
              if (!search.invite) return
              void run(
                'referral-bind',
                async () => {
                  const config = await platform.getConfig()
                  await bindComputeReferral(search.invite || '', config.uuid)
                },
                '邀请关系绑定成功'
              ).then((success) => {
                if (success) navigate({ to: '/compute-center', search: {} })
              })
            }}
          />

          <Tabs value={activeTab} onChange={(value) => value && setActiveTab(value)} keepMounted={false}>
            <ScrollArea type="never" offsetScrollbars>
              <Tabs.List style={{ flexWrap: 'nowrap' }}>
                {tabs
                  .filter((tab) => !tab.login || isLoggedIn)
                  .map((tab) => (
                    <Tabs.Tab key={tab.value} value={tab.value} leftSection={tab.icon}>
                      {tab.label}
                      {tab.value === 'reservations' && (account?.unreadOrderMessages || 0) > 0 && (
                        <Badge size="xs" ml={6} circle color="orange">
                          {account?.unreadOrderMessages}
                        </Badge>
                      )}
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
              <Tabs defaultValue="gpu-products" keepMounted={false}>
                <ScrollArea type="never" offsetScrollbars>
                  <Tabs.List style={{ flexWrap: 'nowrap' }}>
                    <Tabs.Tab value="gpu-products" leftSection={<IconCpu size={15} />}>
                      GPU 算力商品
                    </Tabs.Tab>
                    <Tabs.Tab value="api-products" leftSection={<IconGauge size={15} />}>
                      模型 API 套餐
                    </Tabs.Tab>
                    <Tabs.Tab value="live-prices" leftSection={<IconChartLine size={15} />}>
                      实时行情
                    </Tabs.Tab>
                    <Tabs.Tab value="card-hour-market">卡时现货与询价</Tabs.Tab>
                  </Tabs.List>
                </ScrollArea>
                <Tabs.Panel value="gpu-products" pt="md">
                  <MarketPanel
                    products={productsQuery.data || []}
                    loading={productsQuery.isLoading}
                    error={productsQuery.error}
                    productType="GPU"
                    isLoggedIn={isLoggedIn}
                    busy={busy}
                    runCardHourAction={runCardHourAction}
                    likeCounts={productLikeCounts}
                    likeCountsLoaded={productLikeCountsLoaded}
                    onLike={handleProductLike}
                    onRetry={() => void productsQuery.refetch()}
                  />
                </Tabs.Panel>
                <Tabs.Panel value="api-products" pt="md">
                  <MarketPanel
                    products={productsQuery.data || []}
                    loading={productsQuery.isLoading}
                    error={productsQuery.error}
                    productType="API"
                    isLoggedIn={isLoggedIn}
                    busy={busy}
                    runCardHourAction={runCardHourAction}
                    likeCounts={productLikeCounts}
                    likeCountsLoaded={productLikeCountsLoaded}
                    onLike={handleProductLike}
                    onRetry={() => void productsQuery.refetch()}
                  />
                </Tabs.Panel>
                <Tabs.Panel value="live-prices" pt="md">
                  <MarketPricePanel />
                </Tabs.Panel>
                <Tabs.Panel value="card-hour-market" pt="md">
                  <CardHourMarketplace
                    account={account}
                    isLoggedIn={isLoggedIn}
                    busy={busy}
                    run={run}
                    runCardHourAction={runCardHourAction}
                  />
                </Tabs.Panel>
              </Tabs>
            </Tabs.Panel>

            <Tabs.Panel value="card-hours" pt="md">
              <CardHourBusiness
                account={account}
                isLoggedIn={isLoggedIn}
                busy={busy}
                run={run}
                runCardHourAction={runCardHourAction}
                directTransferPanel={
                  isLoggedIn ? (
                    <TransfersPanel account={account} busy={busy} run={run} runCardHourAction={runCardHourAction} />
                  ) : undefined
                }
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
                  <ReservationsPanel currentUserId={account?.userId} busy={busy} run={run} />
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

function ReferralInviteModal({
  opened,
  preview,
  loading,
  error,
  busy,
  onClose,
  onConfirm,
}: {
  opened: boolean
  preview?: ComputeReferralPreview
  loading: boolean
  error: unknown
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const errorMessage = error instanceof Error ? error.message : ''
  return (
    <Modal opened={opened} onClose={onClose} title="确认邀请关系" centered closeOnClickOutside={!busy}>
      <Stack>
        {loading ? (
          <Text c="chatbox-tertiary">正在验证邀请链接…</Text>
        ) : errorMessage ? (
          <Alert color="red">{errorMessage}</Alert>
        ) : preview ? (
          <>
            <Alert color={preview.canBind ? 'blue' : 'orange'}>
              邀请人：<b>{preview.inviterEmail}</b>
              <br />
              绑定后永久不能更改。你首次充值成功并经过 7 天确认期后，邀请人将获得充值金额 5% 的人民币返佣，单人最高
              ¥100。
            </Alert>
            {!preview.canBind && <Text c="red">{preview.reason}</Text>}
          </>
        ) : null}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={onConfirm} loading={busy} disabled={!preview?.canBind}>
            确认绑定
          </Button>
        </Group>
      </Stack>
    </Modal>
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

function Hero({
  account,
  rate,
  onOpen,
  refreshing,
  onRefresh,
}: {
  account?: ComputeAccount
  rate?: number
  onOpen: (value: string) => void
  refreshing: boolean
  onRefresh: () => void
}) {
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
          <Text c="chatbox-tertiary">模型与 GPU 均按固定套餐交易，统一使用 KAI 标准卡时。</Text>
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
              <Group>
                <Button
                  variant="light"
                  leftSection={<IconRefresh size={18} />}
                  loading={refreshing}
                  onClick={onRefresh}
                >
                  刷新官网余额
                </Button>
                {account.isAdmin && (
                  <Button leftSection={<IconShieldCheck size={18} />} onClick={() => onOpen('admin')}>
                    进入算力管理后台
                  </Button>
                )}
              </Group>
            </Flex>
            <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="md">
              <Metric label="人民币余额" value={`¥${formatNumber(account.cnyBalance, 4)}`} />
              <Metric label="可用卡时" value={`${formatCardHours(account.availableCardHours)} 卡时`} />
              <Metric label="冻结卡时" value={`${formatCardHours(account.frozenCardHours)} 卡时`} />
              <Metric label="累计收益" value={`¥${formatNumber(account.totalIncomeCny, 4)}`} />
              <Metric
                label="租金收益"
                value={`${formatCardHours(account.rentalIncome)} 卡时 / ≈¥${formatNumber(account.rentalIncomeCnyEquivalent, 4)}`}
              />
              <Metric label="佣金收益" value={`¥${formatNumber(account.commissionIncome, 4)}`} />
            </SimpleGrid>
          </>
        )}
      </Stack>
    </Paper>
  )
}

function AssetDashboard({
  account,
  referral,
  onOpen,
}: {
  account?: ComputeAccount
  referral?: ComputeReferralProfile
  onOpen: (value: string) => void
}) {
  if (!account) return <Text c="chatbox-tertiary">正在加载账户信息…</Text>

  const supplierEntryLabel =
    account.identityStatus === 'NONE' ? '实名认证' : account.identityStatus === 'APPROVED' ? '算力入驻' : '认证进度'

  return (
    <Stack gap="md">
      <Section title="我的收益">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
          <Card withBorder padding="md">
            <Text size="sm" c="chatbox-tertiary">
              累计收益
            </Text>
            <Text size="xl" fw={700}>
              ¥{formatNumber(account.totalIncomeCny, 4)}
            </Text>
            <Text size="xs" c="chatbox-tertiary">
              租金按当前回购汇率折算后与佣金合计
            </Text>
          </Card>
          <Card withBorder padding="md">
            <Text size="sm" c="chatbox-tertiary">
              租金收益
            </Text>
            <Text size="xl" fw={700}>
              {formatCardHours(account.rentalIncome)} 卡时
            </Text>
            <Text size="xs" c="chatbox-tertiary">
              约 ¥{formatNumber(account.rentalIncomeCnyEquivalent, 4)}
            </Text>
          </Card>
          <Card withBorder padding="md">
            <Text size="sm" c="chatbox-tertiary">
              佣金收益
            </Text>
            <Text size="xl" fw={700}>
              ¥{formatNumber(account.commissionIncome, 4)}
            </Text>
            <Text size="xs" c="chatbox-tertiary">
              已进入人民币钱包
            </Text>
          </Card>
          <Card withBorder padding="md">
            <Text size="sm" c="chatbox-tertiary">
              待发放佣金
            </Text>
            <Text size="xl" fw={700}>
              ¥{formatNumber(account.pendingCommission, 4)}
            </Text>
            <Text size="xs" c="chatbox-tertiary">
              首次充值成功后等待 7 天
            </Text>
          </Card>
        </SimpleGrid>
      </Section>

      <Section title="我的 GPU">
        <SimpleGrid cols={{ base: 2, sm: 4, lg: 7 }} spacing="sm">
          {gpuAssetStatuses.map(([status, label, color]) => (
            <Card key={status} withBorder padding="md" style={{ cursor: 'pointer' }} onClick={() => onOpen('supplier')}>
              <Text size="xl" fw={700} c={color}>
                {account.gpuAssetCounts?.[status] || 0}
              </Text>
              <Text size="sm">{label}</Text>
            </Card>
          ))}
        </SimpleGrid>
        <Text size="xs" c="chatbox-tertiary" mt="sm">
          “可发布”表示资源审核通过；“待交付、运行中、待处理”来自你作为供应方的租赁订单。平台不替商家远程部署 GPU。
        </Text>
      </Section>

      <Section title="邀请好友返佣">
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Group gap="sm">
              <ThemeIcon variant="light" color="violet">
                <IconGift size={18} />
              </ThemeIcon>
              <Box>
                <Text fw={700}>首次充值返佣 5%</Text>
                <Text size="xs" c="chatbox-tertiary">
                  被邀请人确认绑定且首次充值后，等待 7 天发放；每名好友最高奖励 ¥100。
                </Text>
              </Box>
            </Group>
            {referral ? (
              <>
                <TextInput
                  label="我的专属邀请链接"
                  readOnly
                  value={referral.inviteLink}
                  rightSection={
                    <ActionIcon
                      variant="subtle"
                      aria-label="复制邀请链接"
                      onClick={() => copyToClipboard(referral.inviteLink)}
                    >
                      <IconCopy size={17} />
                    </ActionIcon>
                  }
                />
                <Group gap="xl">
                  <Metric label="已邀请" value={`${referral.invitedCount} 人`} />
                  <Metric label="待发放" value={`¥${formatNumber(referral.pendingCommission, 4)}`} />
                  <Metric label="已到账" value={`¥${formatNumber(referral.paidCommission, 4)}`} />
                </Group>
                {referral.bound && (
                  <Text size="sm" c="chatbox-tertiary">
                    我的邀请人：{referral.inviterEmail} · 绑定时间 {formatDate(referral.boundAt)}
                  </Text>
                )}
              </>
            ) : (
              <Text size="sm" c="chatbox-tertiary">
                正在生成专属邀请链接…
              </Text>
            )}
          </Stack>
        </Paper>
      </Section>

      <Section title="常用功能">
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="sm">
          {[
            ['card-hours', '卡时资产'],
            ['supplier', supplierEntryLabel],
            ['market', '购买算力'],
            ['reservations', '租赁订单'],
            ['purchases', '购买记录'],
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
  error,
  productType,
  isLoggedIn,
  busy,
  runCardHourAction,
  likeCounts,
  likeCountsLoaded,
  onLike,
  onRetry,
}: {
  products: ComputeProduct[]
  loading: boolean
  error: Error | null
  productType: ProductType
  isLoggedIn: boolean
  busy: string | null
  runCardHourAction: RunCardHourAction
  likeCounts: ComputeProductLikeCounts
  likeCountsLoaded: boolean
  onLike: (productId: number) => void
  onRetry: () => void
}) {
  const isSmallScreen = useIsSmallScreen()
  const [keyword, setKeyword] = useState('')
  const [sortMode, setSortMode] = useState<ComputeProductSortMode>('heat')
  const [reservationProduct, setReservationProduct] = useState<ComputeProduct | null>(null)

  const visible = useMemo(
    () =>
      filterAndSortComputeProducts({
        products,
        productType,
        keyword,
        sortMode,
        likeCounts,
      }),
    [keyword, likeCounts, productType, products, sortMode]
  )

  return (
    <Stack gap="md">
      <Flex
        justify="space-between"
        align={isSmallScreen ? 'stretch' : 'center'}
        direction={isSmallScreen ? 'column' : 'row'}
        wrap="wrap"
        gap="sm"
      >
        <Box style={{ flex: isSmallScreen ? undefined : '1 1 420px', minWidth: 0 }}>
          <Title order={4}>算力市场</Title>
          <Text size="sm" c="chatbox-tertiary">
            {productType === 'GPU'
              ? '已认证供应方发布固定 GPU 套餐并自主交付，平台提供卡时担保、确认结算与争议处理。'
              : '购买指定模型的固定 Token 套餐，交付独立代理地址与密钥，不影响 KOD 原有对话和生图链路。'}
          </Text>
        </Box>
        <Group
          gap="sm"
          wrap="nowrap"
          w={isSmallScreen ? '100%' : undefined}
          style={{ flex: isSmallScreen ? undefined : '0 1 396px', minWidth: 0 }}
        >
          <TextInput
            aria-label="搜索算力商品"
            placeholder="搜索商品、模型或供应方"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            style={{ flex: '1 1 240px', minWidth: 0 }}
          />
          <Select
            aria-label="商品排序方式"
            data={COMPUTE_PRODUCT_SORT_OPTIONS}
            value={sortMode}
            onChange={(value) => value && setSortMode(value as ComputeProductSortMode)}
            allowDeselect={false}
            w={isSmallScreen ? 132 : 144}
          />
        </Group>
      </Flex>

      {!loading && !(error && products.length === 0) && (
        <Text size="xs" c="chatbox-tertiary" aria-live="polite">
          共 {visible.length} 个商品
        </Text>
      )}

      {loading ? (
        <Text c="chatbox-tertiary">正在加载市场商品…</Text>
      ) : error && products.length === 0 ? (
        <Alert color="red" title="商品加载失败">
          <Flex align="center" justify="space-between" gap="md" wrap="wrap">
            <Text size="sm">暂时无法连接算力服务，请检查网络或稍后重试。</Text>
            <Button size="xs" variant="light" color="red" onClick={onRetry}>
              重新加载
            </Button>
          </Flex>
        </Alert>
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
              likeCount={getComputeProductLikeCount(product, likeCounts)}
              likeDisabled={!likeCountsLoaded}
              onLike={() => onLike(product.id)}
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
  likeCount,
  likeDisabled,
  onLike,
  onReserve,
}: {
  product: ComputeProduct
  isLoggedIn: boolean
  busy: string | null
  runCardHourAction: RunCardHourAction
  likeCount: number
  likeDisabled: boolean
  onLike: () => void
  onReserve: () => void
}) {
  const actionKey = `product-${product.id}`
  const isApi = product.productType === 'API'
  return (
    <Card withBorder radius="lg" padding={0} style={{ overflow: 'hidden' }}>
      <Stack gap={0} h="100%">
        {product.coverImageId ? (
          <Box
            component="img"
            src={getComputeProductImageUrl(product.id, product.coverImageId)}
            alt={product.name}
            h={184}
            style={{ width: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Flex
            h={184}
            align="center"
            justify="center"
            direction="column"
            gap={8}
            style={{
              background: isApi
                ? 'linear-gradient(135deg, var(--mantine-color-blue-0), var(--mantine-color-indigo-1))'
                : 'linear-gradient(135deg, var(--mantine-color-cyan-0), var(--mantine-color-blue-1))',
            }}
          >
            <ThemeIcon size={54} radius="xl" variant="white" color={isApi ? 'blue' : 'cyan'}>
              {isApi ? <IconGauge size={30} /> : <IconCpu size={30} />}
            </ThemeIcon>
            <Text fw={800} size="lg">
              {isApi ? product.modelId || '模型 API' : product.gpuModel || 'GPU 算力'}
            </Text>
            <Text size="xs" c="chatbox-tertiary">
              商品图片由供应方上传
            </Text>
          </Flex>
        )}
        <Stack gap="sm" p="lg" style={{ flex: 1 }}>
          <Flex justify="space-between" align="center" gap="sm">
            <Group gap={6}>
              <Badge color={isApi ? 'blue' : 'teal'} variant="light">
                {isApi ? '模型 API' : 'GPU 算力'}
              </Badge>
              {Boolean(product.isTest) && (
                <Badge color="orange" variant="light">
                  仅内测
                </Badge>
              )}
            </Group>
            <Text size="xs" c="chatbox-tertiary">
              {product.region || '区域待定'}
            </Text>
          </Flex>
          <Box>
            <Title order={3} lineClamp={1}>
              {product.name}
            </Title>
            <Text size="sm" c="chatbox-tertiary" lineClamp={2} mt={5} mih={42}>
              {product.description || '暂无商品说明'}
            </Text>
          </Box>
          <Paper radius="md" p="sm" bg={isApi ? 'blue.0' : 'cyan.0'}>
            <Text size="xs" c="chatbox-tertiary">
              固定套餐价
            </Text>
            <Group gap={6} align="baseline">
              <Text size="xl" fw={800} c={isApi ? 'blue.8' : 'cyan.9'}>
                {formatCardHours(product.packagePriceCardHours)}
              </Text>
              <Text size="sm" fw={600}>
                卡时
              </Text>
            </Group>
          </Paper>
          {isApi ? (
            <SimpleGrid cols={2} spacing="xs">
              <ProductSpec label="指定模型" value={product.modelId || '-'} />
              <ProductSpec label="有效期" value="永久有效" />
              <ProductSpec label="输入额度" value={formatTokens(product.packagePromptTokens)} />
              <ProductSpec label="输出额度" value={formatTokens(product.packageCompletionTokens)} />
            </SimpleGrid>
          ) : (
            <SimpleGrid cols={2} spacing="xs">
              <ProductSpec label="GPU 规格" value={`${product.gpuModel || '-'} ${product.gpuMemoryGb || '-'}GB`} />
              <ProductSpec label="GPU 数量" value={`${product.gpuCount || 0} 张`} />
              <ProductSpec label="套餐时长" value={`${product.packageDurationHours || 0} 小时`} />
              <ProductSpec label="交付时效" value={`${product.deliveryDeadlineHours || 0} 小时内`} />
            </SimpleGrid>
          )}
          <Divider />
          <Text size="xs" c="chatbox-tertiary" lineClamp={2}>
            供应方：{product.supplierName || 'KOD 官方'} · {product.slaDescription || 'SLA 待确认'}
          </Text>
          <Group justify="flex-end">
            <Button
              type="button"
              variant="light"
              color={isApi ? 'blue' : 'cyan'}
              size="compact-sm"
              leftSection={<IconThumbUp size={16} aria-hidden="true" />}
              aria-label={`为${product.name}点赞，当前${likeCount}次`}
              disabled={likeDisabled}
              onClick={(event) => {
                event.stopPropagation()
                onLike()
              }}
            >
              {likeCount}
            </Button>
          </Group>
          {isApi && !product.upstreamKeyId && <Alert color="orange">管理员尚未配置零售站上游，当前不可购买。</Alert>}
          <Button
            mt="auto"
            size="md"
            disabled={!isLoggedIn || (isApi && !product.upstreamKeyId)}
            loading={busy === actionKey}
            onClick={() =>
              isApi
                ? runCardHourAction(
                    actionKey,
                    (autoTopUp) => activateComputeApi(product.id, autoTopUp),
                    `${product.name} 套餐购买成功`
                  )
                : onReserve()
            }
          >
            {!isLoggedIn ? '登录后操作' : isApi ? '用卡时购买套餐' : '购买 GPU 套餐'}
          </Button>
        </Stack>
      </Stack>
    </Card>
  )
}

function ProductSpec({ label, value }: { label: string; value: string }) {
  return (
    <Paper withBorder radius="md" p="xs">
      <Text size="xs" c="chatbox-tertiary">
        {label}
      </Text>
      <Text size="sm" fw={600} lineClamp={1} title={value}>
        {value}
      </Text>
    </Paper>
  )
}

type MarketTrendGranularity = 'hour' | 'day' | 'week' | 'month'

interface MarketTrendGranularityOption {
  value: MarketTrendGranularity
  label: string
  range: ComputeMarketPriceRange
  rangeLabel: string
  bucketMilliseconds: number
}

const MARKET_TREND_GRANULARITIES: MarketTrendGranularityOption[] = [
  { value: 'hour', label: '每小时', range: '24h', rangeLabel: '近 24 小时', bucketMilliseconds: 60 * 60_000 },
  { value: 'day', label: '每天', range: '30d', rangeLabel: '近 30 天', bucketMilliseconds: 24 * 60 * 60_000 },
  { value: 'week', label: '每周', range: '90d', rangeLabel: '近 12 周', bucketMilliseconds: 7 * 24 * 60 * 60_000 },
  { value: 'month', label: '每月', range: '365d', rangeLabel: '近 12 个月', bucketMilliseconds: 30 * 24 * 60 * 60_000 },
]

const MARKET_RENTAL_TERMS: Array<{ value: ComputeMarketRentalTerm; label: string }> = [
  { value: 'HOURLY', label: '按小时 / 按量' },
  { value: 'DAILY', label: '包日' },
  { value: 'WEEKLY', label: '包周' },
  { value: 'MONTHLY', label: '包月' },
]

const MARKET_COMPARISON_RENTAL_TERMS = MARKET_RENTAL_TERMS.filter((option) => option.value === 'HOURLY')

interface MarketModelOption {
  value: string
  label: string
  queryModel: string
  vramMiB?: number
  formFactor?: string | null
}

const MARKET_DEFAULT_MODELS: MarketModelOption[] = [
  { value: 'nvidia-a100-pcie-40gb', label: 'A100 PCIe 40GB', queryModel: 'nvidia-a100-pcie-40gb' },
  { value: 'nvidia-v100-32gb', label: 'V100 32GB', queryModel: 'nvidia-v100-32gb' },
  { value: 'nvidia-t4-16gb', label: 'Tesla T4 16GB', queryModel: 'nvidia-t4-16gb' },
]

const MARKET_COMPARISON_SOURCES: ComputeMarketPriceSource[] = ['GETDEPLOYING', 'VAST_AI']

function MarketPricePanel() {
  const [gpuModel, setGpuModel] = useState(MARKET_DEFAULT_MODELS[0].value)
  const [rentalTerm, setRentalTerm] = useState<ComputeMarketRentalTerm>('HOURLY')
  const [regions, setRegions] = useState<string[]>([])
  const [trendGranularity, setTrendGranularity] = useState<MarketTrendGranularity>('hour')
  const [knownRegionsByModel, setKnownRegionsByModel] = useState<
    Record<string, Array<{ value: string; label: string }>>
  >({})
  const latestQuery = useQuery({
    queryKey: ['compute', 'market-prices', 'latest'],
    queryFn: getComputeMarketPrices,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  })
  const snapshot = latestQuery.data
  const trendOption =
    MARKET_TREND_GRANULARITIES.find((option) => option.value === trendGranularity) || MARKET_TREND_GRANULARITIES[0]
  const range = trendOption.range
  const snapshotRefreshFailed = Boolean(snapshot && latestQuery.error)
  const modelOptions = useMemo(() => buildMarketModelOptions(snapshot), [snapshot])
  const rentalTermOptions = useMemo(() => {
    if (!snapshot?.availableRentalTerms?.length) return MARKET_COMPARISON_RENTAL_TERMS
    const supported = new Set(
      snapshot.availableRentalTerms.map((term) =>
        String(term).toLocaleUpperCase('en-US') === 'PAYG' ? 'HOURLY' : term
      )
    )
    const supportedHourlyTerms = MARKET_COMPARISON_RENTAL_TERMS.filter((option) => supported.has(option.value))
    return supportedHourlyTerms.length > 0 ? supportedHourlyTerms : MARKET_COMPARISON_RENTAL_TERMS
  }, [snapshot?.availableRentalTerms])
  useEffect(() => {
    if (rentalTermOptions.some((option) => option.value === rentalTerm)) return
    setRentalTerm(rentalTermOptions[0]?.value || 'HOURLY')
  }, [rentalTerm, rentalTermOptions])
  const selectedModelOption =
    modelOptions.find((option) => sameMarketDimension(option.value, gpuModel)) || MARKET_DEFAULT_MODELS[0]
  const regionKey = [...regions].sort().join('|')
  const historyQuery = useQuery({
    queryKey: ['compute', 'market-prices', 'history', gpuModel, rentalTerm, regionKey, range],
    queryFn: () =>
      getComputeMarketPriceHistory(selectedModelOption.queryModel, range, {
        rentalTerm,
        regions,
        vramMiB: selectedModelOption.vramMiB,
        formFactor: selectedModelOption.formFactor,
      }),
    enabled: Boolean(gpuModel),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  })
  const effectiveUsdCnyRate = snapshot?.usdCnyRate ?? historyQuery.data?.usdCnyRate

  useEffect(() => {
    if (modelOptions.some((option) => sameMarketDimension(option.value, gpuModel))) return
    setGpuModel(findSharedMarketModel(snapshot) || modelOptions[0]?.value || MARKET_DEFAULT_MODELS[0].value)
  }, [gpuModel, modelOptions, snapshot])

  const modelRecords = useMemo(
    () =>
      [...(snapshot?.quotes || []), ...(historyQuery.data?.points || [])].filter(
        (record) =>
          MARKET_COMPARISON_SOURCES.includes(record.source) && sameMarketDimension(getMarketModelKey(record), gpuModel)
      ),
    [gpuModel, historyQuery.data?.points, snapshot?.quotes]
  )
  const discoveredRegionOptions = useMemo(
    () => buildMarketRegionOptions(snapshot, modelRecords),
    [modelRecords, snapshot]
  )
  useEffect(() => {
    setKnownRegionsByModel((current) => {
      const merged = mergeMarketRegionOptions(current[gpuModel] || [], discoveredRegionOptions)
      const previous = current[gpuModel] || []
      if (
        merged.length === previous.length &&
        merged.every(
          (option, index) => option.value === previous[index]?.value && option.label === previous[index]?.label
        )
      ) {
        return current
      }
      return { ...current, [gpuModel]: merged }
    })
  }, [discoveredRegionOptions, gpuModel])
  const regionOptions = mergeMarketRegionOptions(knownRegionsByModel[gpuModel] || [], discoveredRegionOptions)
  const selectedQuotes = useMemo(
    () =>
      (snapshot?.quotes || []).filter(
        (quote) =>
          MARKET_COMPARISON_SOURCES.includes(quote.source) &&
          sameMarketDimension(getMarketModelKey(quote), gpuModel) &&
          getComputeMarketRentalTerm(quote) === rentalTerm &&
          (regions.length === 0 ||
            regions.some((region) => sameMarketDimension(region, getComputeMarketRegionCode(quote))))
      ),
    [gpuModel, regions, rentalTerm, snapshot?.quotes]
  )
  const chartPoints = useMemo(
    () =>
      filterComputeMarketPricePoints(
        mergeComputeMarketPricePoints(
          historyQuery.data?.points || [],
          snapshotRefreshFailed
            ? selectedQuotes.map((quote) => ({ ...quote, status: 'STALE' as const }))
            : selectedQuotes
        ).filter(
          (point) =>
            MARKET_COMPARISON_SOURCES.includes(point.source) && sameMarketDimension(getMarketModelKey(point), gpuModel)
        ),
        { rentalTerm, regions }
      ),
    [gpuModel, historyQuery.data?.points, regions, rentalTerm, selectedQuotes, snapshotRefreshFailed]
  )
  const currentQuotes = useMemo(
    () =>
      MARKET_COMPARISON_SOURCES.map((source) => {
        const sourceQuotes = selectedQuotes.filter((quote) => quote.source === source)
        return pickLowestMarketQuote(sourceQuotes, effectiveUsdCnyRate) || sourceQuotes[0]
      }).filter((quote): quote is ComputeMarketPriceQuote => Boolean(quote)),
    [effectiveUsdCnyRate, selectedQuotes]
  )
  const refreshSeconds = Math.max(snapshot?.refreshIntervalSeconds || 60, 30)
  const hasInitialError = Boolean(latestQuery.error && !snapshot)
  const historyRefreshFailedWithCache = Boolean(historyQuery.error && historyQuery.data?.points?.length)

  return (
    <Stack gap="md" aria-busy={latestQuery.isLoading || historyQuery.isLoading}>
      <Paper withBorder radius="lg" p={{ base: 'md', sm: 'lg' }}>
        <Flex justify="space-between" align="flex-start" gap="md" wrap="wrap">
          <Box style={{ flex: '1 1 560px', minWidth: 0 }}>
            <Group gap="xs">
              <ThemeIcon variant="light" color="blue" radius="xl">
                <IconChartLine size={18} />
              </ThemeIcon>
              <Title order={3}>GetDeploying 与 Vast.ai 同 GPU 规格行情</Title>
            </Group>
            <Text size="sm" c="chatbox-secondary" mt={6} maw={760}>
              按规范型号、显存与板型对应两个数据来源，统一折算为人民币 / GPU·小时。GetDeploying
              展示跨供应商聚合价格，Vast.ai 展示当前已验证可租报价；这不是同一云实例产品的比较。
            </Text>
          </Box>
          <Stack gap={4} align="flex-end">
            <Badge
              color={
                snapshotRefreshFailed
                  ? 'orange'
                  : latestQuery.isError
                    ? 'red'
                    : latestQuery.isFetching
                      ? 'blue'
                      : 'green'
              }
              variant="light"
            >
              {snapshotRefreshFailed
                ? '刷新失败，展示缓存'
                : latestQuery.isError
                  ? '刷新失败'
                  : latestQuery.isFetching
                    ? '正在刷新'
                    : `服务约 ${refreshSeconds} 秒刷新`}
            </Badge>
            <Text size="xs" c="chatbox-secondary">
              更新时间：{formatDate(snapshot?.generatedAt)}
            </Text>
          </Stack>
        </Flex>
      </Paper>

      {hasInitialError && (
        <Alert color="red" title="行情服务尚未接通">
          <Flex justify="space-between" align="center" gap="md" wrap="wrap">
            <Text size="sm">{marketPriceErrorMessage(latestQuery.error)}</Text>
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<IconRefresh size={14} />}
              onClick={() => void Promise.all([latestQuery.refetch(), historyQuery.refetch()])}
            >
              重新加载
            </Button>
          </Flex>
        </Alert>
      )}

      {snapshotRefreshFailed && (
        <Alert color="orange" title="最新行情刷新失败，当前展示上次成功缓存" aria-live="polite">
          缓存报价不会用于计算 GetDeploying / Vast.ai 比例或相对百分比；请稍后重试刷新。
        </Alert>
      )}

      <Paper withBorder radius="lg" p={{ base: 'md', sm: 'lg' }}>
        <Flex justify="space-between" align="flex-start" gap="sm" wrap="wrap" mb="md">
          <Box>
            <Title order={4}>{marketModelLabel(modelOptions, gpuModel)} 价格走势</Title>
            <Text size="xs" c="chatbox-secondary">
              每个数据来源一条平滑主线；当前每个点表示{trendOption.label}
              时段内的最低折算小时价。标记点来自真实数据，曲线不会越过相邻价格。 历史数据最多保留{' '}
              {snapshot?.historyRetentionDays || 365} 天。
            </Text>
          </Box>
          <Group gap="md" wrap="wrap" aria-label="网站折线样式">
            <ChartLegend color="#e8590c" dash="10 5" label="GetDeploying（长虚线 / 方点）" />
            <ChartLegend color="#1971c2" dash="2 5" label="Vast.ai（短虚线 / 圆点）" />
          </Group>
        </Flex>
        <Box component="section" aria-label="行情趋势筛选" mb="md">
          <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="sm">
            <Select
              label="GPU 型号"
              data={modelOptions}
              value={gpuModel}
              onChange={(value) => {
                if (!value) return
                setGpuModel(value)
                setRegions([])
              }}
              searchable
              allowDeselect={false}
            />
            <Select
              label="租赁计费周期（仅按小时）"
              data={rentalTermOptions}
              value={rentalTerm}
              onChange={(value) => value && setRentalTerm(value as ComputeMarketRentalTerm)}
              allowDeselect={false}
            />
            <MultiSelect
              label="供应商 / 地区"
              data={regionOptions}
              value={regions}
              onChange={setRegions}
              placeholder="全部供应商 / 地区"
              searchable
              clearable
              hidePickedOptions
              nothingFoundMessage="暂无可选供应商或地区"
            />
            <Stack gap={5}>
              <Text size="sm" fw={500}>
                趋势粒度
              </Text>
              <SegmentedControl
                value={trendGranularity}
                onChange={(value) => setTrendGranularity(value as MarketTrendGranularity)}
                data={MARKET_TREND_GRANULARITIES.map(({ value, label }) => ({ value, label }))}
                aria-label="趋势粒度"
                fullWidth
                size="md"
              />
            </Stack>
          </SimpleGrid>
          <Flex justify="space-between" align="center" gap="sm" wrap="wrap" mt="sm">
            <Text size="xs" c="chatbox-secondary">
              {regions.length === 0
                ? '每个数据来源显示一条主线；每次采样取该来源最低可用价'
                : `已筛选 ${regions.length} 个供应商或地区；每次采样取所选范围内该来源的最低可用价`}
            </Text>
            <Text size="xs" c="chatbox-secondary">
              汇率：1 USD ≈ ¥{formatOptionalNumber(effectiveUsdCnyRate, 4)}；1 卡时 ≈ ¥
              {formatOptionalNumber(snapshot?.cardHourCnyRate, 3)}
              {snapshot?.usdCnyRateUpdatedAt ? `（汇率日期：${formatDate(snapshot.usdCnyRateUpdatedAt)}）` : ''}
            </Text>
          </Flex>
          <Text size="xs" c="chatbox-secondary" mt={4}>
            筛选项按数据来源区分：GetDeploying 项表示供应商及其总部国家，不代表 GPU 所在机房；Vast.ai
            项表示实例地区。两项比较仅使用按小时 / 按量报价。
          </Text>
          <Text size="xs" c="chatbox-secondary" mt={4}>
            当前按{trendOption.label}分组，查看{trendOption.rangeLabel}
            ；每个点取该时段内真实最低可用价，平滑曲线仅作连接，不改变采样数值。
          </Text>
        </Box>
        {historyQuery.error ? (
          <Alert
            color="orange"
            title={
              historyRefreshFailedWithCache
                ? '历史行情刷新失败，继续展示上次成功历史'
                : chartPoints.length > 0
                  ? '历史行情加载失败，仅展示当前报价'
                  : '历史行情加载失败'
            }
            mb="md"
          >
            {marketPriceErrorMessage(historyQuery.error)}
          </Alert>
        ) : null}
        {historyQuery.isLoading && chartPoints.length > 0 && (
          <Alert color="blue" variant="light" mb="md" aria-live="polite">
            正在加载历史行情，图中暂时仅展示当前报价。
          </Alert>
        )}
        <MarketPriceChart
          points={chartPoints}
          usdCnyRate={effectiveUsdCnyRate}
          loading={historyQuery.isLoading}
          granularity={trendGranularity}
          bucketMilliseconds={trendOption.bucketMilliseconds}
          emptyDescription={
            regions.length > 0
              ? '所选型号、供应商或地区暂无历史报价，请更换筛选条件。'
              : '服务端开始采样后会在这里显示 GetDeploying 与 Vast.ai 的同 GPU 规格走势。'
          }
        />
        {historyQuery.isFetching && !historyQuery.isLoading && (
          <Text size="xs" c="chatbox-secondary" mt="xs" aria-live="polite">
            正在后台刷新历史行情…
          </Text>
        )}
      </Paper>

      {currentQuotes.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {currentQuotes.map((quote) => (
            <MarketPriceQuoteCard
              key={`${quote.source}-${getMarketModelKey(quote)}-${getComputeMarketRegionCode(quote)}-${getComputeMarketRentalTerm(quote)}`}
              quote={quote}
              usdCnyRate={effectiveUsdCnyRate}
              clientStale={snapshotRefreshFailed}
            />
          ))}
        </SimpleGrid>
      )}

      <MarketPriceDetailsTable points={chartPoints} usdCnyRate={effectiveUsdCnyRate} />
      <MarketPriceMatrix snapshot={snapshot} clientStale={snapshotRefreshFailed} />

      <Alert color="blue" variant="light" title="数据口径与使用说明">
        <Text size="sm">
          GetDeploying 是跨供应商聚合数据，通常每日更新；其供应商国家表示总部所在地，不是机房地区。Vast.ai
          精确规格由服务端查询当前已验证可租实例。两者只按同 GPU
          型号、显存、板型和按小时口径对应，其他主机规格并未对齐。为避免自比较，服务端会从 GetDeploying 聚合中排除
          Vast.ai 报价。第三方价格仅供参考，不能在 KOD 直接下单。
        </Text>
      </Alert>
    </Stack>
  )
}

function MarketPriceQuoteCard({
  quote,
  usdCnyRate,
  clientStale,
}: {
  quote: ComputeMarketPriceQuote
  usdCnyRate?: number
  clientStale: boolean
}) {
  const cnyPrice = getComputeMarketDisplayCnyPrice(quote, usdCnyRate)
  const available =
    cnyPrice !== undefined ||
    quote.originalBillingPrice != null ||
    quote.originalPricePerGpuHour != null ||
    quote.priceUsdPerGpuHour != null
  const status = clientStale ? { label: '缓存报价', color: 'orange' } : marketPriceStatus(quote)
  const originalPrice = marketOriginalPrice(quote)
  return (
    <Paper withBorder radius="lg" p={{ base: 'md', sm: 'lg' }}>
      <Flex justify="space-between" align="flex-start" gap="md">
        <Box>
          <Group gap="xs" wrap="wrap">
            <Text fw={700}>{marketSourceLabel(quote.source, quote.sourceLabel)}</Text>
            {quote.priceCondition && (
              <Badge size="xs" variant="outline">
                {quote.priceCondition}
              </Badge>
            )}
          </Group>
          <Text size="xs" c="chatbox-secondary">
            {marketQuoteTypeLabel(quote)} · {marketSupplierOrRegionLabel(quote)} ·{' '}
            {marketRentalTermLabel(getComputeMarketRentalTerm(quote))}
          </Text>
        </Box>
        <Badge color={status.color} variant="light">
          {status.label}
        </Badge>
      </Flex>
      {available ? (
        <Stack gap={4} mt="md">
          <Group gap={6} align="baseline" wrap="wrap">
            <Text fz={{ base: 26, sm: 32 }} fw={800}>
              {originalPrice}
            </Text>
            <Text size="sm" c="chatbox-secondary">
              {quote.originalBillingPrice != null
                ? `/ GPU·${marketBillingUnitLabel(quote.originalBillingUnit)}`
                : '/ GPU·小时'}
            </Text>
          </Group>
          <Text size="sm">
            {cnyPrice === undefined
              ? '汇率暂不可用，当前仅展示来源原币报价'
              : `折算 ¥${formatOptionalNumber(cnyPrice, 4)} / GPU·小时${
                  quote.cardHoursPerGpuHour != null
                    ? ` · ${formatOptionalNumber(quote.cardHoursPerGpuHour, 4)} 卡时 / GPU·小时`
                    : ''
                }`}
          </Text>
          <Text size="xs" c="chatbox-secondary">
            {quote.availableGpuCount != null
              ? `可租 ${quote.availableGpuCount} 张 · `
              : quote.sampleSize != null
                ? `样本 ${quote.sampleSize} 个 · `
                : ''}
            采样：{formatDate(quote.sampledAt)}
          </Text>
          {quote.providerUpdatedAt && (
            <Text size="xs" c="chatbox-secondary">
              来源核验：{formatDate(quote.providerUpdatedAt)}
            </Text>
          )}
          {(clientStale || quote.status === 'STALE') && (
            <Text size="xs" c="orange">
              当前显示上次成功数据：{formatDate(quote.lastSuccessAt || quote.sampledAt)}
            </Text>
          )}
        </Stack>
      ) : (
        <Stack gap={4} mt="lg" mb="sm">
          <Text size="xl" fw={700} c="chatbox-secondary">
            暂无报价
          </Text>
          <Text size="xs" c="chatbox-secondary">
            {quote.status === 'UNCONFIGURED'
              ? `${marketSourceLabel(quote.source, quote.sourceLabel)} 服务端采集凭据尚未配置。`
              : quote.errorMessage || '该平台未提供此型号。'}
          </Text>
        </Stack>
      )}
      <Button
        variant="subtle"
        size="xs"
        px={0}
        mt="sm"
        rightSection={<IconExternalLink size={14} />}
        aria-label={`打开 ${marketSourceLabel(quote.source, quote.sourceLabel)} 官方来源`}
        onClick={() => void platform.openLink(quote.sourceUrl)}
      >
        查看官方来源
      </Button>
    </Paper>
  )
}

function MarketPriceMatrix({
  snapshot,
  clientStale,
}: {
  snapshot?: Awaited<ReturnType<typeof getComputeMarketPrices>>
  clientStale: boolean
}) {
  const titleId = useId()
  if (!snapshot) return null
  const rows = buildMarketExactComparisonRows(snapshot.quotes)
  return (
    <Paper withBorder radius="lg" p={{ base: 'md', sm: 'lg' }}>
      <Title order={4} mb="xs" id={titleId}>
        同 GPU 规格价格对照
      </Title>
      <Text size="xs" c="chatbox-secondary" mb="md">
        {clientStale ? '最新刷新失败，表内为上次成功缓存；' : ''}
        仅按相同 GPU 型号、显存、板型和按小时口径配对；这不表示 CPU、内存、磁盘等云实例规格相同。比例为 GetDeploying /
        Vast.ai，相对百分比以 Vast.ai 为基准；缺少任一来源、价格非正数或含缓存时不计算。
      </Text>
      <ScrollArea
        type="auto"
        offsetScrollbars
        viewportProps={{ tabIndex: 0, 'aria-label': '同 GPU 规格价格对照表横向滚动区域' }}
      >
        <Table striped highlightOnHover miw={1180} aria-labelledby={titleId}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>GPU 规格</Table.Th>
              <Table.Th>GetDeploying 报价</Table.Th>
              <Table.Th>Vast.ai 报价</Table.Th>
              <Table.Th>GetDeploying / Vast.ai</Table.Th>
              <Table.Th>相对 Vast.ai</Table.Th>
              <Table.Th>供应商 / 地区样本</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text c="chatbox-secondary">暂无同时包含型号、显存与板型信息的按小时报价。</Text>
                </Table.Td>
              </Table.Tr>
            )}
            {rows.map((row) => {
              const getDeploying = pickLowestMarketQuote(
                row.quotes.filter((quote) => quote.source === 'GETDEPLOYING'),
                snapshot.usdCnyRate
              )
              const vast = pickLowestMarketQuote(
                row.quotes.filter((quote) => quote.source === 'VAST_AI'),
                snapshot.usdCnyRate
              )
              const comparison = compareGetDeployingAndVastPrices(getDeploying, vast, snapshot.usdCnyRate, {
                clientStale,
              })
              return (
                <Table.Tr key={row.key}>
                  <Table.Td>
                    <Text fw={600}>{row.label}</Text>
                  </Table.Td>
                  <Table.Td>{formatMarketPrice(getDeploying, snapshot.usdCnyRate, clientStale)}</Table.Td>
                  <Table.Td>{formatMarketPrice(vast, snapshot.usdCnyRate, clientStale)}</Table.Td>
                  <Table.Td>{formatMarketRatio(comparison)}</Table.Td>
                  <Table.Td>{formatMarketPercentVsVast(comparison)}</Table.Td>
                  <Table.Td>{formatMarketCoverage(getDeploying, vast)}</Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  )
}

interface MarketChartDatum {
  key: string
  point: ComputeMarketComparisonPoint
  seriesKey: string
  color: string
  dash?: string
  time: number
  value: number
  x: number
  y: number
}

function MarketPriceChart({
  points,
  usdCnyRate,
  loading,
  granularity,
  bucketMilliseconds,
  emptyDescription,
}: {
  points: ComputeMarketComparisonPoint[]
  usdCnyRate?: number
  loading: boolean
  granularity: MarketTrendGranularity
  bucketMilliseconds: number
  emptyDescription: string
}) {
  const chartId = useId()
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const chartViewportRef = useRef<HTMLDivElement>(null)
  const width = 900
  const height = 340
  const padding = { left: 74, right: 24, top: 24, bottom: 52 }
  const groupedSeries = useMemo(
    () => groupComputeMarketPricePointsBySource(points, usdCnyRate, { bucketMilliseconds }),
    [bucketMilliseconds, points, usdCnyRate]
  )
  const availableSeries = useMemo(
    () =>
      groupedSeries
        .map((series) => {
          const style = marketSeriesStyle(series.source, 0)
          const data = sampleMarketChartPoints(series.points, 240)
            .map((point, pointIndex) => ({
              point,
              time: new Date(point.aggregationBucketStartedAt || point.sampledAt).getTime(),
              value: getComputeMarketDisplayCnyPrice(point, usdCnyRate),
              key: `${series.key}:${point.sampledAt}:${pointIndex}`,
            }))
            .filter(
              (datum): datum is { point: ComputeMarketComparisonPoint; time: number; value: number; key: string } =>
                Number.isFinite(datum.time) && datum.value !== undefined && Number.isFinite(datum.value)
            )
          return {
            ...series,
            ...style,
            data,
          }
        })
        .filter((series) => series.data.length > 0),
    [groupedSeries, usdCnyRate]
  )
  const normalizedSeries = availableSeries
  const flatData = useMemo(
    () =>
      normalizedSeries.flatMap((series) =>
        series.data.map((datum) => ({
          ...datum,
          seriesKey: series.key,
          color: series.color,
          dash: series.dash,
        }))
      ),
    [normalizedSeries]
  )

  useEffect(() => {
    if (activeKey && !flatData.some((datum) => datum.key === activeKey)) setActiveKey(null)
  }, [activeKey, flatData])

  if (flatData.length === 0) {
    return (
      <Box py="xl" ta="center" role="status">
        <Text fw={600}>{loading ? '正在加载行情历史…' : '暂无匹配行情'}</Text>
        <Text size="sm" c="chatbox-secondary" mt={4}>
          {loading ? '正在读取服务端采样数据，请稍候。' : emptyDescription}
        </Text>
      </Box>
    )
  }

  const times = flatData.map((datum) => datum.time)
  const prices = flatData.map((datum) => datum.value)
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)
  const rawMinPrice = Math.min(...prices)
  const rawMaxPrice = Math.max(...prices)
  const pricePadding = Math.max((rawMaxPrice - rawMinPrice) * 0.12, rawMaxPrice * 0.03, 0.01)
  const minPrice = Math.max(0, rawMinPrice - pricePadding)
  const maxPrice = rawMaxPrice + pricePadding
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const x = (time: number) =>
    minTime === maxTime
      ? padding.left + plotWidth / 2
      : padding.left + ((time - minTime) / (maxTime - minTime)) * plotWidth
  const y = (price: number) =>
    padding.top + (1 - (price - minPrice) / Math.max(0.000001, maxPrice - minPrice)) * plotHeight
  const gridValues = Array.from({ length: 5 }, (_, index) => minPrice + ((maxPrice - minPrice) * index) / 4)
  const timeTicks =
    minTime === maxTime
      ? [{ key: 'only', timestamp: minTime }]
      : ['start', 'quarter', 'middle', 'three-quarter', 'end'].map((key, index) => ({
          key,
          timestamp: minTime + ((maxTime - minTime) * index) / 4,
        }))
  const chartData: MarketChartDatum[] = flatData.map((datum) => ({
    key: datum.key,
    point: datum.point,
    seriesKey: datum.seriesKey,
    color: datum.color,
    dash: datum.dash,
    time: datum.time,
    value: datum.value,
    x: x(datum.time),
    y: y(datum.value),
  }))
  const active = chartData.find((datum) => datum.key === activeKey) || null

  const moveActivePoint = (direction: number) => {
    const chronological = [...chartData].sort(
      (left, right) => left.time - right.time || left.key.localeCompare(right.key)
    )
    const currentIndex = active ? chronological.findIndex((datum) => datum.key === active.key) : -1
    const nextIndex = Math.min(Math.max(currentIndex + direction, 0), chronological.length - 1)
    const next = chronological[nextIndex]
    setActiveKey(next?.key || null)
    const viewport = chartViewportRef.current
    if (next && viewport) {
      const targetLeft = (next.x / width) * viewport.scrollWidth
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      viewport.scrollTo({
        left: Math.max(0, targetLeft - viewport.clientWidth / 2),
        behavior: reduceMotion ? 'auto' : 'smooth',
      })
    }
  }

  const selectNearestPoint = (clientX: number, clientY: number, svg: SVGSVGElement) => {
    const bounds = svg.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    const pointerX = ((clientX - bounds.left) / bounds.width) * width
    const pointerY = ((clientY - bounds.top) / bounds.height) * height
    if (
      pointerX < padding.left ||
      pointerX > width - padding.right ||
      pointerY < padding.top ||
      pointerY > height - padding.bottom
    ) {
      return
    }
    let nearest: MarketChartDatum | undefined
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const datum of chartData) {
      const distance = (datum.x - pointerX) ** 2 + (datum.y - pointerY) ** 2
      if (distance >= nearestDistance) continue
      nearest = datum
      nearestDistance = distance
    }
    setActiveKey(nearest?.key || null)
  }

  return (
    <Stack gap="sm">
      <ScrollArea type="auto" offsetScrollbars viewportRef={chartViewportRef}>
        <Box
          pos="relative"
          miw={720}
          tabIndex={0}
          role="group"
          aria-label="GPU 行情图。使用左右方向键逐点查看，按 Escape 关闭详情。"
          onFocus={() => !activeKey && setActiveKey(chartData[0]?.key || null)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              event.preventDefault()
              moveActivePoint(1)
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              event.preventDefault()
              moveActivePoint(-1)
            } else if (event.key === 'Escape') {
              setActiveKey(null)
            }
          }}
          onMouseLeave={() => setActiveKey(null)}
          onClick={() => setActiveKey(null)}
        >
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-labelledby={`${chartId}-title ${chartId}-description`}
            style={{ width: '100%', display: 'block' }}
            onPointerMove={(event) => selectNearestPoint(event.clientX, event.clientY, event.currentTarget)}
            onPointerDown={(event) => {
              event.stopPropagation()
              selectNearestPoint(event.clientX, event.clientY, event.currentTarget)
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <title id={`${chartId}-title`}>GetDeploying 与 Vast.ai 同 GPU 规格人民币折算价格走势</title>
            <desc id={`${chartId}-description`}>
              每个数据来源一条单调平滑主线。纵轴为人民币每 GPU 小时，横轴为{marketTrendGranularityLabel(granularity)}
              分组时间。方点或圆点为真实时段最低价；鼠标悬停、触摸数据点或聚焦图表后使用方向键可查看详情。
            </desc>
            {gridValues.map((value) => (
              <g key={value}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y(value)}
                  y2={y(value)}
                  stroke="var(--mantine-color-gray-5)"
                  strokeDasharray="4 5"
                  opacity="0.34"
                />
                <text
                  x={padding.left - 10}
                  y={y(value) + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="currentColor"
                  opacity="0.62"
                >
                  ¥{formatCompactMarketPrice(value)}
                </text>
              </g>
            ))}
            {normalizedSeries.map((series) => {
              const seriesData = chartData.filter((datum) => datum.seriesKey === series.key)
              const markerStep = Math.max(1, Math.ceil(seriesData.length / 36))
              const markerData = seriesData.filter(
                (datum, index) =>
                  index === 0 || index === seriesData.length - 1 || index % markerStep === 0 || datum.key === activeKey
              )
              return (
                <g key={series.key}>
                  {splitMarketChartSegments(seriesData).map((segment, index) => (
                    <path
                      key={`${series.key}-segment-${index}`}
                      fill="none"
                      stroke={series.color}
                      strokeWidth="3"
                      strokeDasharray={series.dash}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      d={buildComputeMarketMonotoneSvgPath(segment)}
                    />
                  ))}
                  {markerData.map((datum) => (
                    <g key={datum.key} aria-hidden="true" pointerEvents="none">
                      {datum.point.source === 'GETDEPLOYING' ? (
                        <rect
                          x={datum.x - 4}
                          y={datum.y - 4}
                          width="8"
                          height="8"
                          rx="1.5"
                          fill={series.color}
                          stroke={activeKey === datum.key ? 'currentColor' : series.color}
                          strokeWidth={activeKey === datum.key ? 2 : 1}
                        />
                      ) : (
                        <circle
                          cx={datum.x}
                          cy={datum.y}
                          r="4.5"
                          fill={series.color}
                          stroke={activeKey === datum.key ? 'currentColor' : series.color}
                          strokeWidth={activeKey === datum.key ? 2 : 1}
                        />
                      )}
                    </g>
                  ))}
                </g>
              )
            })}
            {timeTicks.map(({ key, timestamp }, index) => (
              <text
                key={key}
                x={x(timestamp)}
                y={height - 17}
                textAnchor={index === 0 ? 'start' : index === timeTicks.length - 1 ? 'end' : 'middle'}
                fontSize="11"
                fill="currentColor"
                opacity="0.62"
              >
                {formatChartTime(timestamp, granularity)}
              </text>
            ))}
            <text
              x={14}
              y={padding.top + plotHeight / 2}
              textAnchor="middle"
              fontSize="11"
              fill="currentColor"
              opacity="0.62"
              transform={`rotate(-90 14 ${padding.top + plotHeight / 2})`}
            >
              人民币 / GPU·小时
            </text>
          </svg>
        </Box>
      </ScrollArea>
      {active ? (
        <MarketPriceTooltip datum={active} usdCnyRate={usdCnyRate} />
      ) : (
        <Text size="xs" c="chatbox-secondary">
          {flatData.length === 1
            ? '当前粒度只有 1 个真实数据点，至少需要 2 个点才能形成曲线。'
            : '悬停或点击真实数据点查看具体价格；聚焦图表后可用方向键逐点浏览。'}
        </Text>
      )}
    </Stack>
  )
}

function ChartLegend({ color, label, dash }: { color: string; label: string; dash?: string }) {
  return (
    <Group gap={6}>
      <svg width="20" height="8" aria-hidden="true">
        <line x1="1" x2="19" y1="4" y2="4" stroke={color} strokeWidth="3" strokeDasharray={dash} />
      </svg>
      <Text size="xs">{label}</Text>
    </Group>
  )
}

function MarketPriceTooltip({ datum, usdCnyRate }: { datum: MarketChartDatum; usdCnyRate?: number }) {
  const point = datum.point
  return (
    <Paper withBorder shadow="md" radius="md" p="sm" role="status" style={{ background: 'var(--mantine-color-body)' }}>
      <Group justify="space-between" gap="xs" wrap="nowrap" mb={6}>
        <Text fw={700} size="sm">
          {marketSourceLabel(point.source, point.sourceLabel)}
        </Text>
        <Badge size="xs" variant="light" color={point.source === 'GETDEPLOYING' ? 'orange' : 'blue'}>
          {marketQuoteTypeText(point.quoteType)}
        </Badge>
      </Group>
      <Stack gap={3}>
        <TooltipRow label="来源型号" value={point.sourceModel || point.gpuModel} />
        <TooltipRow label="对应型号" value={point.gpuModel} />
        <TooltipRow label="供应商 / 地区" value={marketSupplierOrRegionLabel(point)} />
        {(point.aggregatedRegionCount || 0) > 1 && (
          <TooltipRow
            label="汇总范围"
            value={
              point.aggregationLabel ||
              `${point.aggregatedRegionCount} ${point.source === 'GETDEPLOYING' ? '家供应商' : '个地区'}，当前点取最低价`
            }
          />
        )}
        {point.aggregationBucketStartedAt && (
          <TooltipRow
            label="趋势分组"
            value={`${marketTrendBucketLabel(point.aggregationBucketMilliseconds)} · ${formatDate(point.aggregationBucketStartedAt)} 起`}
          />
        )}
        {point.aggregationSampleCount != null && (
          <TooltipRow label="分组样本" value={`${point.aggregationSampleCount} 个真实报价样本，显示区间最低价`} />
        )}
        <TooltipRow label="租赁周期" value={marketRentalTermLabel(getComputeMarketRentalTerm(point))} />
        <TooltipRow label="原币价格" value={marketPointOriginalPrice(point)} />
        <TooltipRow label="人民币折算" value={`¥${formatOptionalNumber(datum.value, 4)} / GPU·小时`} />
        {usdCnyRate != null && (
          <TooltipRow label="本次汇率" value={`1 USD ≈ ¥${formatOptionalNumber(usdCnyRate, 4)}`} />
        )}
        <TooltipRow label="库存 / 样本" value={marketPointCoverage(point)} />
        <TooltipRow label="数据状态" value={marketPointStatusLabel(point.status)} />
        {point.priceCondition && <TooltipRow label="价格条件" value={point.priceCondition} />}
        <TooltipRow label="采集时间" value={formatDate(point.sampledAt)} />
        {point.providerUpdatedAt && <TooltipRow label="平台更新时间" value={formatDate(point.providerUpdatedAt)} />}
      </Stack>
    </Paper>
  )
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <Flex justify="space-between" align="flex-start" gap="md">
      <Text size="xs" c="chatbox-secondary" style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Text size="xs" fw={500} ta="right">
        {value}
      </Text>
    </Flex>
  )
}

const MARKET_DETAILS_PREVIEW_ROWS = 3
const MARKET_DETAILS_MAX_ROWS_PER_SOURCE = 50

function MarketPriceDetailsTable({
  points,
  usdCnyRate,
}: {
  points: ComputeMarketComparisonPoint[]
  usdCnyRate?: number
}) {
  const titleId = useId()
  const [expandedSources, setExpandedSources] = useState<ComputeMarketPriceSource[]>([])
  const sourceGroups = useMemo(() => {
    const groups = new Map<
      ComputeMarketPriceSource,
      { source: ComputeMarketPriceSource; sourceLabel?: string; points: ComputeMarketComparisonPoint[] }
    >()
    const sortedPoints = points
      .map((point, index) => ({ point, index, sampledAt: Date.parse(point.sampledAt) }))
      .sort((left, right) => {
        const leftValid = Number.isFinite(left.sampledAt)
        const rightValid = Number.isFinite(right.sampledAt)
        if (leftValid !== rightValid) return leftValid ? -1 : 1
        if (leftValid && rightValid && left.sampledAt !== right.sampledAt) return right.sampledAt - left.sampledAt
        return left.index - right.index
      })
      .map(({ point }) => point)
    for (const point of sortedPoints) {
      const group = groups.get(point.source)
      if (group) {
        group.points.push(point)
      } else {
        groups.set(point.source, {
          source: point.source,
          sourceLabel: point.sourceLabel,
          points: [point],
        })
      }
    }
    return [...groups.values()].sort((left, right) => {
      const leftIndex = MARKET_COMPARISON_SOURCES.indexOf(left.source)
      const rightIndex = MARKET_COMPARISON_SOURCES.indexOf(right.source)
      const normalizedLeft = leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex
      const normalizedRight = rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex
      return normalizedLeft - normalizedRight || left.source.localeCompare(right.source, 'en-US')
    })
  }, [points])

  return (
    <Paper withBorder radius="lg" p={{ base: 'md', sm: 'lg' }}>
      <Flex justify="space-between" align="flex-start" gap="sm" wrap="wrap" mb="md">
        <Box>
          <Title order={4} id={titleId}>
            当前筛选数据明细
          </Title>
          <Text size="xs" c="chatbox-secondary">
            按数据来源分组并按采集时间倒序排列；默认每个来源显示最新 3 条，点击来源标题可展开最近 50 条。
          </Text>
        </Box>
        <Badge variant="light">{points.length} 个采样点</Badge>
      </Flex>
      {sourceGroups.length === 0 ? (
        <Text c="chatbox-secondary">当前筛选条件下暂无可展示明细。</Text>
      ) : (
        <Stack gap="sm">
          {sourceGroups.map((group, groupIndex) => {
            const expanded = expandedSources.includes(group.source)
            const retainedRows = group.points.slice(0, MARKET_DETAILS_MAX_ROWS_PER_SOURCE)
            const visibleRows = expanded ? retainedRows : retainedRows.slice(0, MARKET_DETAILS_PREVIEW_ROWS)
            const canExpand = retainedRows.length > MARKET_DETAILS_PREVIEW_ROWS
            const sourceId = `${titleId}-${group.source.toLocaleLowerCase('en-US')}`
            const sourceLabelId = `${sourceId}-label`
            const tableId = `${sourceId}-table`
            const sourceName = marketSourceLabel(group.source, group.sourceLabel)
            const sourceColor =
              group.source === 'GETDEPLOYING' ? 'orange' : group.source === 'VAST_AI' ? 'blue' : 'gray'
            const headerContent = (
              <Group justify="space-between" gap="sm" wrap="nowrap">
                <Group gap="sm" wrap="wrap">
                  <Badge id={sourceLabelId} color={sourceColor} variant="light">
                    {sourceName}
                  </Badge>
                  <Text size="sm" c="chatbox-secondary">
                    显示 {visibleRows.length} 条 / 共 {group.points.length} 条
                  </Text>
                </Group>
                {canExpand && (
                  <Group gap={6} wrap="nowrap">
                    <Text size="xs" fw={600} c="chatbox-secondary">
                      {expanded ? '收起' : '展开更多'}
                    </Text>
                    <IconChevronDown
                      size={16}
                      aria-hidden="true"
                      style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      className="transition-transform duration-150 ease-out motion-reduce:transition-none"
                    />
                  </Group>
                )}
              </Group>
            )

            return (
              <Box
                component="section"
                key={group.source}
                aria-labelledby={sourceLabelId}
                pt={groupIndex === 0 ? 0 : 'sm'}
                style={groupIndex === 0 ? undefined : { borderTop: '1px solid var(--mantine-color-default-border)' }}
              >
                {canExpand ? (
                  <UnstyledButton
                    id={sourceId}
                    w="100%"
                    px="xs"
                    py="sm"
                    aria-expanded={expanded}
                    aria-controls={tableId}
                    aria-label={`${sourceName}：当前显示 ${visibleRows.length} 条，共 ${group.points.length} 条；${expanded ? '点击收起' : '点击展开更多'}`}
                    className="rounded-md transition-colors hover:bg-[var(--chatbox-background-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chatbox-border-brand)]"
                    onClick={() =>
                      setExpandedSources((current) =>
                        current.includes(group.source)
                          ? current.filter((source) => source !== group.source)
                          : [...current, group.source]
                      )
                    }
                  >
                    {headerContent}
                  </UnstyledButton>
                ) : (
                  <Box id={sourceId} px="xs" py="sm">
                    {headerContent}
                  </Box>
                )}
                <MarketPriceDetailsDataTable
                  id={tableId}
                  labelIds={`${titleId} ${sourceLabelId}`}
                  scrollLabel={`${sourceName} 明细表横向滚动区域`}
                  rows={visibleRows}
                  usdCnyRate={usdCnyRate}
                />
              </Box>
            )
          })}
        </Stack>
      )}
    </Paper>
  )
}

function MarketPriceDetailsDataTable({
  id,
  labelIds,
  scrollLabel,
  rows,
  usdCnyRate,
}: {
  id: string
  labelIds: string
  scrollLabel: string
  rows: ComputeMarketComparisonPoint[]
  usdCnyRate?: number
}) {
  return (
    <ScrollArea id={id} type="auto" offsetScrollbars viewportProps={{ tabIndex: 0, 'aria-label': scrollLabel }}>
      <Table striped highlightOnHover miw={1020} aria-labelledby={labelIds}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>采集时间</Table.Th>
            <Table.Th>来源型号</Table.Th>
            <Table.Th>对应型号</Table.Th>
            <Table.Th>供应商 / 地区</Table.Th>
            <Table.Th>租期</Table.Th>
            <Table.Th>原币价格</Table.Th>
            <Table.Th>人民币折算</Table.Th>
            <Table.Th>库存 / 样本</Table.Th>
            <Table.Th>报价口径</Table.Th>
            <Table.Th>状态</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((point, index) => {
            const cnyPrice = getComputeMarketDisplayCnyPrice(point, usdCnyRate)
            return (
              <Table.Tr
                key={`${point.source}-${getMarketModelKey(point)}-${getComputeMarketRegionCode(point)}-${getComputeMarketRentalTerm(point)}-${point.sampledAt}-${index}`}
              >
                <Table.Td>{formatDate(point.sampledAt)}</Table.Td>
                <Table.Td>{point.sourceModel || point.gpuModel}</Table.Td>
                <Table.Td>{point.gpuModel}</Table.Td>
                <Table.Td>{marketSupplierOrRegionLabel(point)}</Table.Td>
                <Table.Td>{marketRentalTermLabel(getComputeMarketRentalTerm(point))}</Table.Td>
                <Table.Td>{marketPointOriginalPrice(point)}</Table.Td>
                <Table.Td>{cnyPrice === undefined ? '—' : `¥${formatOptionalNumber(cnyPrice, 4)} / GPU·小时`}</Table.Td>
                <Table.Td>{marketPointCoverage(point)}</Table.Td>
                <Table.Td>{marketQuoteTypeText(point.quoteType)}</Table.Td>
                <Table.Td>{marketPointStatusLabel(point.status)}</Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  )
}

function getMarketBaseModelKey(record: { gpuModel: string; modelKey?: string; canonicalModel?: string }) {
  return record.canonicalModel?.trim() || record.modelKey?.trim() || record.gpuModel.trim()
}

function normalizeMarketDimension(value: string) {
  return value.trim().toLocaleUpperCase('en-US')
}

function sameMarketDimension(left: string, right: string) {
  return normalizeMarketDimension(left) === normalizeMarketDimension(right)
}

function getMarketModelKey(record: {
  gpuModel: string
  modelKey?: string
  canonicalModel?: string
  vramMiB?: number
  formFactor?: string | null
}) {
  const base = getMarketBaseModelKey(record)
  const normalizedBase = base.toLocaleLowerCase('en-US').replaceAll(/\s+/g, '')
  const vramGb = record.vramMiB ? Math.round(record.vramMiB / 1024) : undefined
  const formFactor = record.formFactor?.trim().toLocaleUpperCase('en-US')
  const includesVram =
    !vramGb || normalizedBase.includes(`${vramGb}gb`) || normalizedBase.includes(String(record.vramMiB))
  const includesForm = !formFactor || normalizedBase.includes(formFactor.toLocaleLowerCase('en-US'))
  if (includesVram && includesForm) return base
  return [base, vramGb ? `vram-${vramGb}gb` : '', formFactor ? `form-${formFactor}` : ''].filter(Boolean).join('::')
}

function buildMarketModelOptions(snapshot?: Awaited<ReturnType<typeof getComputeMarketPrices>>) {
  const options = new Map<string, MarketModelOption>()
  for (const quote of snapshot?.quotes || []) {
    if (!MARKET_COMPARISON_SOURCES.includes(quote.source)) continue
    const value = getMarketModelKey(quote)
    const fallback = MARKET_DEFAULT_MODELS.find((option) => sameMarketDimension(option.value, value))?.label
    const details = [
      quote.vramMiB && !quote.gpuModel.toLocaleLowerCase('en-US').includes('gb')
        ? `${Math.round(quote.vramMiB / 1024)} GB`
        : '',
      quote.formFactor &&
      !quote.gpuModel.toLocaleUpperCase('en-US').includes(quote.formFactor.toLocaleUpperCase('en-US'))
        ? quote.formFactor.toLocaleUpperCase('en-US')
        : '',
    ].filter(Boolean)
    options.set(normalizeMarketDimension(value), {
      value,
      label: [fallback || quote.gpuModel, ...details].join(' · '),
      queryModel: getMarketBaseModelKey(quote),
      vramMiB: quote.vramMiB,
      formFactor: quote.formFactor,
    })
  }
  for (const model of snapshot?.trackedModels || []) {
    if (![...options.values()].some((option) => sameMarketDimension(option.queryModel, model))) {
      options.set(normalizeMarketDimension(model), {
        value: model,
        label: MARKET_DEFAULT_MODELS.find((option) => option.value === model)?.label || model,
        queryModel: model,
      })
    }
  }
  if (options.size === 0) {
    for (const option of MARKET_DEFAULT_MODELS) options.set(normalizeMarketDimension(option.value), option)
  }
  return [...options.values()]
}

interface MarketExactComparisonRow {
  key: string
  label: string
  quotes: ComputeMarketPriceQuote[]
}

function buildMarketExactComparisonRows(quotes: ComputeMarketPriceQuote[]): MarketExactComparisonRow[] {
  const rows = new Map<string, MarketExactComparisonRow>()
  for (const quote of quotes) {
    if (!MARKET_COMPARISON_SOURCES.includes(quote.source) || getComputeMarketRentalTerm(quote) !== 'HOURLY') continue
    const key = getComputeMarketExactSpecKey(quote)
    if (!key) continue
    const current = rows.get(key)
    if (current) {
      current.quotes.push(quote)
    } else {
      rows.set(key, { key, label: marketExactSpecLabel(quote), quotes: [quote] })
    }
  }
  return [...rows.values()].sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'))
}

function marketExactSpecLabel(quote: ComputeMarketPriceQuote) {
  const normalizedModel = quote.gpuModel.toLocaleUpperCase('en-US')
  const vramGb = quote.vramMiB ? Math.round(quote.vramMiB / 1024) : undefined
  const formFactor = quote.formFactor?.trim().toLocaleUpperCase('en-US')
  const details = [
    vramGb && !normalizedModel.includes(`${vramGb}GB`) ? `${vramGb} GB` : '',
    formFactor && !normalizedModel.includes(formFactor) ? formFactor : '',
  ].filter(Boolean)
  return [quote.gpuModel, ...details].join(' · ')
}

function findSharedMarketModel(snapshot?: Awaited<ReturnType<typeof getComputeMarketPrices>>) {
  const sourcesByModel = new Map<string, Set<ComputeMarketPriceSource>>()
  const selectionValueByModel = new Map<string, string>()
  for (const quote of snapshot?.quotes || []) {
    if (!MARKET_COMPARISON_SOURCES.includes(quote.source)) continue
    const selectionValue = getMarketModelKey(quote)
    const key = normalizeMarketDimension(selectionValue)
    const sources = sourcesByModel.get(key) || new Set<ComputeMarketPriceSource>()
    sources.add(quote.source)
    sourcesByModel.set(key, sources)
    if (!selectionValueByModel.has(key)) selectionValueByModel.set(key, selectionValue)
  }
  const sharedKey = [...sourcesByModel].find(
    ([, sources]) => sources.has('GETDEPLOYING') && sources.has('VAST_AI')
  )?.[0]
  return sharedKey ? selectionValueByModel.get(sharedKey) : undefined
}

function buildMarketRegionOptions(
  snapshot: Awaited<ReturnType<typeof getComputeMarketPrices>> | undefined,
  records: Array<ComputeMarketPriceQuote | ComputeMarketPricePoint>
) {
  const options = new Map<string, { value: string; label: string }>()
  for (const option of snapshot?.availableRegions || []) {
    if (
      option.value !== COMPUTE_MARKET_DEFAULT_REGION &&
      (!option.source || MARKET_COMPARISON_SOURCES.includes(option.source))
    ) {
      options.set(option.value.toLocaleUpperCase('en-US'), {
        value: option.value,
        label: option.source ? marketRegionFilterOptionLabel(option.source, option.label) : option.label,
      })
    }
  }
  for (const option of deriveComputeMarketRegions(records)) {
    if (option.value !== COMPUTE_MARKET_DEFAULT_REGION) {
      const source = records.find((record) =>
        sameMarketDimension(getComputeMarketRegionCode(record), option.value)
      )?.source
      options.set(option.value.toLocaleUpperCase('en-US'), {
        ...option,
        label: source ? marketRegionFilterOptionLabel(source, option.label) : option.label,
      })
    }
  }
  return [...options.values()].sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'))
}

function mergeMarketRegionOptions(
  previous: Array<{ value: string; label: string }>,
  incoming: Array<{ value: string; label: string }>
) {
  const options = new Map(previous.map((option) => [option.value.toLocaleUpperCase('en-US'), option]))
  for (const option of incoming) options.set(option.value.toLocaleUpperCase('en-US'), option)
  return [...options.values()].sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'))
}

function pickLowestMarketQuote(quotes: ComputeMarketPriceQuote[], usdCnyRate?: number) {
  const comparable = quotes
    .filter((quote) => quote.status === 'OK' || quote.status === 'STALE')
    .filter((quote) => getComputeMarketDisplayCnyPrice(quote, usdCnyRate) !== undefined)
  const fresh = comparable.filter((quote) => quote.status === 'OK')
  const candidates = [...(fresh.length > 0 ? fresh : comparable)]
  candidates.sort((left, right) => {
    const leftPrice = getComputeMarketDisplayCnyPrice(left, usdCnyRate)
    const rightPrice = getComputeMarketDisplayCnyPrice(right, usdCnyRate)
    if (leftPrice === undefined) return 1
    if (rightPrice === undefined) return -1
    return leftPrice - rightPrice
  })
  return candidates[0]
}

function marketModelLabel(options: Array<{ value: string; label: string }>, value: string) {
  return options.find((option) => sameMarketDimension(option.value, value))?.label || value
}

function marketSourceLabel(source: ComputeMarketPriceSource, fallback?: string) {
  if (source === 'GETDEPLOYING') return 'GetDeploying'
  if (source === 'AUTODL') return 'AutoDL'
  if (source === 'VAST_AI') return 'Vast.ai'
  if (source === 'AKAMAI') return 'Akamai'
  return fallback || source
}

function marketRegionFilterOptionLabel(source: ComputeMarketPriceSource, label: string) {
  const dimension = source === 'GETDEPLOYING' ? '供应商（总部）' : '地区'
  return `${marketSourceLabel(source)} · ${dimension}：${label}`
}

function marketSupplierOrRegionLabel(record: {
  source: ComputeMarketPriceSource
  providerName?: string
  providerCountry?: string
  regionCode?: string
  regionLabel?: string
}) {
  if (record.source === 'GETDEPLOYING') {
    const providerName = record.providerName?.trim()
    const providerCountry = record.providerCountry?.trim()
    if (providerName && providerCountry) return `${providerName}（总部：${providerCountry}）`
    if (providerName) return `${providerName}（总部未标注）`
    if (providerCountry) return `供应商总部：${providerCountry}`
  }
  return record.regionLabel?.trim() || record.regionCode?.trim() || '全市场'
}

function marketRentalTermLabel(value: string) {
  return MARKET_RENTAL_TERMS.find((option) => option.value === value)?.label || value
}

function marketBillingUnitLabel(value?: string) {
  if (value === 'DAY') return '日'
  if (value === 'WEEK') return '周'
  if (value === 'MONTH') return '月'
  return '小时'
}

function marketQuoteTypeText(quoteType?: string) {
  if (quoteType === 'MIN_AVAILABLE') return '当前可租最低价'
  if (quoteType === 'MEDIAN_AVAILABLE') return '可租中位价'
  if (quoteType === 'VERIFIED_MIN') return '已验证最低价'
  if (quoteType === 'OFFICIAL_LIST') return '公开挂牌价'
  if (quoteType === 'MEMBER_PRICE') return '会员条件价'
  return quoteType || '当前报价'
}

function marketQuoteTypeLabel(quote: ComputeMarketPriceQuote) {
  const quoteType = marketQuoteTypeText(quote.quoteType)
  return quote.priceCondition ? `${quoteType} · ${quote.priceCondition}` : quoteType
}

function marketSeriesStyle(source: ComputeMarketPriceSource, index: number) {
  const getDeploying = ['#d9480f', '#e8590c', '#f76707', '#c2410c', '#dc5f00', '#b95c00']
  const vast = ['#1971c2', '#1c7ed6', '#228be6', '#3b82f6', '#2563eb', '#2878c7']
  const legacy = ['#495057', '#868e96']
  const palette = source === 'GETDEPLOYING' ? getDeploying : source === 'VAST_AI' ? vast : legacy
  return {
    color: palette[index % palette.length],
    dash: source === 'GETDEPLOYING' ? '10 5' : source === 'VAST_AI' ? '2 5' : '6 4',
  }
}

function sampleMarketChartPoints(points: ComputeMarketComparisonPoint[], maxPoints: number) {
  if (points.length <= maxPoints) return points
  const sampled: ComputeMarketComparisonPoint[] = []
  const lastIndex = points.length - 1
  for (let index = 0; index < maxPoints; index += 1) {
    sampled.push(points[Math.round((lastIndex * index) / (maxPoints - 1))])
  }
  return sampled
}

function splitMarketChartSegments(points: MarketChartDatum[]) {
  const sorted = [...points].sort((left, right) => left.time - right.time)
  if (sorted.length < 3) return sorted.length > 0 ? [sorted] : []
  const gaps = sorted
    .slice(1)
    .map((point, index) => point.time - sorted[index].time)
    .filter((gap) => gap > 0)
  const orderedGaps = [...gaps].sort((left, right) => left - right)
  const medianGap = orderedGaps[Math.floor(orderedGaps.length / 2)] || 60_000
  const breakAfter = Math.max(medianGap * 4, 15 * 60_000)
  const segments: MarketChartDatum[][] = [[]]
  for (const point of sorted) {
    const current = segments[segments.length - 1]
    const previous = current[current.length - 1]
    if (previous && point.time - previous.time > breakAfter) segments.push([])
    segments[segments.length - 1].push(point)
  }
  return segments
}

function marketPointOriginalPrice(point: ComputeMarketComparisonPoint) {
  const currency = point.originalCurrency || (point.source === 'AUTODL' ? 'CNY' : 'USD')
  if (point.originalBillingPrice != null) {
    return `${formatMarketCurrency(point.originalBillingPrice, currency)} / GPU·${marketBillingUnitLabel(point.originalBillingUnit)}`
  }
  const fallback =
    point.originalPricePerGpuHour ?? (currency === 'CNY' ? point.priceCnyPerGpuHour : point.priceUsdPerGpuHour)
  return fallback == null ? '—' : `${formatMarketCurrency(fallback, currency)} / GPU·小时`
}

function marketOriginalPrice(quote: ComputeMarketPriceQuote) {
  const currency = quote.originalCurrency || (quote.source === 'AUTODL' ? 'CNY' : 'USD')
  const value =
    quote.originalBillingPrice ??
    quote.originalPricePerGpuHour ??
    (currency === 'CNY' ? quote.priceCnyPerGpuHour : quote.priceUsdPerGpuHour)
  return value == null ? '—' : formatMarketCurrency(value, currency)
}

function formatMarketCurrency(value: number, currency: string) {
  return `${currency === 'CNY' ? '¥' : '$'}${formatOptionalNumber(value, 4)}`
}

function marketPointCoverage(point: ComputeMarketComparisonPoint) {
  if (point.source === 'GETDEPLOYING' && point.sampleSize != null) return `${point.sampleSize} 个供应商报价样本`
  if (point.availableGpuCount != null) return `${point.availableGpuCount} 张可租`
  if (point.sampleSize != null) return `${point.sampleSize} 个样本`
  return '—'
}

function marketPointStatusLabel(status?: string) {
  if (status === 'OK') return '数据正常'
  if (status === 'STALE') return '使用上次成功数据'
  if (status === 'UNAVAILABLE') return '来源异常'
  if (status === 'UNCONFIGURED') return '服务未配置'
  if (status === 'NO_QUOTE') return '暂无报价'
  return '历史采样'
}

function formatCompactMarketPrice(value: number) {
  return value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2)
}

function formatOptionalNumber(value: number | string | null | undefined, digits = 3) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return '—'
  const number = Number(value)
  return Number.isFinite(number)
    ? number.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '—'
}

function marketPriceErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.includes('No static resource')) {
    return 'KOD 行情后端接口尚未部署。前端图表已经就绪，需配置 GetDeploying 聚合数据与 Vast.ai 服务端行情代理后才会显示真实数据。'
  }
  if (error instanceof Error && /timeout|abort/i.test(error.message)) return '行情服务响应超时，请稍后重试。'
  return '暂时无法连接行情服务，请稍后重试。'
}

function marketPriceStatus(quote: ComputeMarketPriceQuote) {
  switch (quote.status) {
    case 'OK':
      return { label: '数据正常', color: 'green' }
    case 'STALE':
      return { label: '使用上次数据', color: 'yellow' }
    case 'UNCONFIGURED':
      return { label: '未配置', color: 'orange' }
    case 'UNAVAILABLE':
      return { label: '来源异常', color: 'red' }
    default:
      return { label: '暂无该型号', color: 'gray' }
  }
}

function formatMarketPrice(quote: ComputeMarketPriceQuote | undefined, usdCnyRate?: number, clientStale = false) {
  if (!quote) return '暂无报价'
  const cnyPrice = getComputeMarketDisplayCnyPrice(quote, usdCnyRate)
  if (cnyPrice === undefined) return '暂无报价'
  const originalUnit = quote.originalBillingPrice != null ? marketBillingUnitLabel(quote.originalBillingUnit) : '小时'
  const stale = clientStale || quote.status === 'STALE' ? ' · 上次成功数据' : ''
  return `${marketOriginalPrice(quote)} / GPU·${originalUnit} · 约 ¥${formatOptionalNumber(cnyPrice, 4)} / GPU·小时 · ${marketQuoteTypeLabel(quote)}${stale}`
}

function marketComparisonUnavailableLabel(comparison: ComputeMarketGetDeployingVastComparison) {
  if (comparison.reason === 'MISSING_SOURCE') return '缺一方，不计算'
  if (comparison.reason === 'STALE') return '含缓存，不计算'
  if (comparison.reason === 'SPEC_MISMATCH') return '规格不一致'
  if (comparison.reason === 'INVALID_PRICE') return '价格无效'
  return '无法计算'
}

function formatMarketRatio(comparison: ComputeMarketGetDeployingVastComparison) {
  if (comparison.reason !== 'OK' || comparison.ratio === undefined) {
    return `—（${marketComparisonUnavailableLabel(comparison)}）`
  }
  return `${formatOptionalNumber(comparison.ratio, 3)}×`
}

function formatMarketPercentVsVast(comparison: ComputeMarketGetDeployingVastComparison) {
  if (comparison.reason !== 'OK' || comparison.percentVsVast === undefined) {
    return `—（${marketComparisonUnavailableLabel(comparison)}）`
  }
  const prefix = comparison.percentVsVast > 0 ? '+' : ''
  return `${prefix}${formatOptionalNumber(comparison.percentVsVast, 1)}%`
}

function formatMarketCoverage(getDeploying?: ComputeMarketPriceQuote, vast?: ComputeMarketPriceQuote) {
  const getDeployingValue = getDeploying?.sampleSize
  const vastCoverage =
    vast?.availableGpuCount != null
      ? `${vast.availableGpuCount} 张可租`
      : vast?.sampleSize != null
        ? `${vast.sampleSize} 个样本`
        : '—'
  return `GetDeploying ${getDeployingValue == null ? '—' : `${getDeployingValue} 个样本`} / Vast.ai ${vastCoverage}`
}

function marketTrendGranularityLabel(value: MarketTrendGranularity) {
  return MARKET_TREND_GRANULARITIES.find((option) => option.value === value)?.label || value
}

function marketTrendBucketLabel(bucketMilliseconds?: number) {
  if (!bucketMilliseconds) return '真实采样'
  if (bucketMilliseconds >= 28 * 24 * 60 * 60_000) return '每月'
  if (bucketMilliseconds >= 7 * 24 * 60 * 60_000) return '每周'
  if (bucketMilliseconds >= 24 * 60 * 60_000) return '每天'
  if (bucketMilliseconds >= 60 * 60_000) return '每小时'
  return '实时采样'
}

function formatChartTime(timestamp: number, granularity: MarketTrendGranularity) {
  if (granularity === 'month') {
    return new Date(timestamp).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
    })
  }
  if (granularity === 'day' || granularity === 'week') {
    return new Date(timestamp).toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
    })
  }
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
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
  const [buyerPublicKey, setBuyerPublicKey] = useState('')
  if (!product) return null
  const key = `reserve-${product.id}`
  return (
    <Modal opened onClose={onClose} title={`购买 ${product.name}`} centered size="lg">
      <Stack>
        <Alert color="blue" title="中介担保交易">
          本订单冻结 {formatCardHours(product.packagePriceCardHours)} 卡时。商家将在付款后{' '}
          {product.deliveryDeadlineHours || 0} 小时内自行交付 {product.gpuCount || 0} 张 GPU、
          {product.packageDurationHours || 0} 小时的固定套餐；平台不登录或控制商家服务器。
        </Alert>
        <Textarea
          label="你的 SSH 公钥"
          description="请粘贴 .pub 文件的一整行内容，例如 ssh-ed25519 AAAA…；私钥必须留在你的电脑，禁止上传。"
          placeholder="ssh-ed25519 AAAA... your-name"
          value={buyerPublicKey}
          onChange={(event) => setBuyerPublicKey(event.target.value)}
          autosize
          minRows={4}
        />
        <Button
          loading={busy === key}
          disabled={!buyerPublicKey.trim()}
          onClick={() =>
            runCardHourAction(
              key,
              (autoTopUp) => createComputeReservation({ productId: product.id, buyerPublicKey }, autoTopUp),
              'GPU 套餐购买成功，卡时已冻结；请到“租赁订单”与商家确认排期'
            ).then((succeeded) => succeeded && onClose())
          }
        >
          确认购买并冻结卡时
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
  const packagesQuery = useQuery({ queryKey: ['compute', 'package-purchases'], queryFn: listComputePackagePurchases })
  const usageQuery = useQuery({ queryKey: ['compute', 'api-usage'], queryFn: listComputeApiUsage })
  const withdrawalsQuery = useQuery({ queryKey: ['compute', 'withdrawals'], queryFn: listComputeWithdrawals })
  const referralQuery = useQuery({ queryKey: ['compute', 'referrals', 'me'], queryFn: getComputeReferralProfile })
  const referralRewardsQuery = useQuery({
    queryKey: ['compute', 'referrals', 'rewards'],
    queryFn: listComputeReferralRewards,
  })
  const [amount, setAmount] = useState(10)
  const [withdrawalAmount, setWithdrawalAmount] = useState(0.1)
  const estimated = amount * (account?.cardHourCnyRate || 1.002)
  const withdrawalCny = withdrawalAmount * (account?.cardHourRedeemRate || 1)

  return (
    <Stack gap="md">
      <AssetDashboard account={account} referral={referralQuery.data} onOpen={onOpen} />

      <Alert color="blue" title="官网充值与客户端共用同一人民币钱包">
        <Flex justify="space-between" align="center" gap="md" wrap="wrap">
          <Text size="sm">官网充值成功后返回客户端，窗口重新获得焦点时会自动刷新；也可以点击顶部“刷新官网余额”。</Text>
          <Button
            size="xs"
            variant="light"
            onClick={() => void platform.openLink('https://kod.kai.com/console/wallet')}
          >
            去官网充值
          </Button>
        </Flex>
      </Alert>

      <Alert color="orange" title="“卡时回购”仅指内部钱包兑换">
        卡时按 1 卡时 = ¥{formatNumber(account?.cardHourRedeemRate || 1, 4)} 直接转入 KOD
        人民币钱包，不会打款到银行卡、支付宝或其他第三方账户。冻结卡时不能兑换。
      </Alert>

      <Tabs defaultValue="exchange" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="exchange">资产兑换</Tabs.Tab>
          <Tabs.Tab value="buybacks">回购记录</Tabs.Tab>
          <Tabs.Tab value="rewards">邀请佣金明细</Tabs.Tab>
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
                <Title order={5}>平台回购卡时</Title>
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
                      `${withdrawalAmount.toFixed(1)} 卡时已回购并转入 KOD 人民币钱包`
                    )
                  }
                >
                  确认回购并直接到账
                </Button>
              </Stack>
            </Paper>
          </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel value="buybacks" pt="md">
          <WithdrawalTable entries={withdrawalsQuery.data || []} />
        </Tabs.Panel>

        <Tabs.Panel value="rewards" pt="md">
          <ReferralRewardsTable entries={referralRewardsQuery.data || []} />
        </Tabs.Panel>

        <Tabs.Panel value="packages" pt="md">
          <Stack>
            <TokenPackageAssets purchases={packagesQuery.data || []} busy={busy} run={run} />
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
  const packagesQuery = useQuery({ queryKey: ['compute', 'package-purchases'], queryFn: listComputePackagePurchases })
  return (
    <Stack>
      <Alert color="blue">购买记录保存订单与扣费；API 地址和套餐 Key 请到“我的资产 → Token 套餐”查看。</Alert>
      <Section title="Token 套餐购买记录">
        <SimpleTable
          columns={['订单号', '套餐', '指定模型', '输入剩余 / 总额', '输出剩余 / 总额', '支付卡时', '时间']}
          rows={(packagesQuery.data || []).map((item) => [
            item.orderNo,
            item.productName,
            item.modelId,
            `${formatTokens(item.promptTokensRemaining)} / ${formatTokens(item.promptTokensTotal)}`,
            `${formatTokens(item.completionTokensRemaining)} / ${formatTokens(item.completionTokensTotal)}`,
            formatCardHours(item.priceCardHours),
            formatDate(item.createTime),
          ])}
          empty="暂无 Token 套餐购买记录"
        />
      </Section>
      <Section title="全部购买流水">
        <OrdersTable orders={ordersQuery.data || []} />
      </Section>
    </Stack>
  )
}

function TokenPackageAssets({
  purchases,
  busy,
  run,
}: {
  purchases: ComputePackagePurchase[]
  busy: string | null
  run: RunAction
}) {
  const [credentials, setCredentials] = useState<Record<number, ComputePackageCredential>>({})
  const [revealing, setRevealing] = useState<number | null>(null)

  const reveal = async (purchaseId: number) => {
    setRevealing(purchaseId)
    try {
      const credential = await getComputePackageCredential(purchaseId)
      setCredentials((current) => ({ ...current, [purchaseId]: credential }))
    } finally {
      setRevealing(null)
    }
  }

  return (
    <Section title="Token 套餐交付与余额（永久有效）">
      <Alert color="blue" mb="md">
        套餐 Key 仅供外部工具调用 KOD 平台代理；客户端内置对话和生图仍走你手动选择的零售站/节点及官网人民币余额。
      </Alert>
      {purchases.length === 0 ? (
        <Text c="chatbox-tertiary">尚未购买模型 Token 套餐</Text>
      ) : (
        <Stack>
          {purchases.map((item) => {
            const credential = credentials[item.id]
            const apiKey = credential?.apiKey || `kodpk_••••••••${item.accessKeyLast4 || ''}`
            return (
              <Paper key={item.id} withBorder p="md" radius="md">
                <Stack gap="sm">
                  <Flex justify="space-between" align="flex-start" gap="md" wrap="wrap">
                    <Box>
                      <Group gap="xs">
                        <Title order={5}>{item.productName}</Title>
                        <StatusBadge status={item.keyStatus} />
                      </Group>
                      <Text size="sm">指定模型：{item.modelId}</Text>
                      <Text size="xs" c="chatbox-tertiary">
                        订单 {item.orderNo} · {formatDate(item.createTime)}
                      </Text>
                    </Box>
                    <Text fw={700}>{formatCardHours(item.priceCardHours)} 卡时</Text>
                  </Flex>
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <Metric
                      label="输入 Token 剩余 / 总额"
                      value={`${formatTokens(item.promptTokensRemaining)} / ${formatTokens(item.promptTokensTotal)}`}
                    />
                    <Metric
                      label="输出 Token 剩余 / 总额"
                      value={`${formatTokens(item.completionTokensRemaining)} / ${formatTokens(item.completionTokensTotal)}`}
                    />
                  </SimpleGrid>
                  {item.suspendedReason && <Alert color="red">暂停原因：{item.suspendedReason}</Alert>}
                  <TextInput
                    label="Base URL"
                    readOnly
                    value={item.baseUrl}
                    rightSection={
                      <ActionIcon
                        variant="subtle"
                        aria-label="复制 Base URL"
                        onClick={() => copyToClipboard(item.baseUrl)}
                      >
                        <IconCopy size={17} />
                      </ActionIcon>
                    }
                  />
                  <TextInput
                    label="API Key"
                    readOnly
                    value={apiKey}
                    rightSection={
                      <ActionIcon
                        variant="subtle"
                        aria-label="复制 API Key"
                        disabled={!credential}
                        onClick={() => credential && copyToClipboard(credential.apiKey)}
                      >
                        <IconCopy size={17} />
                      </ActionIcon>
                    }
                  />
                  <Text size="sm">
                    API 格式：{item.apiFormat}；认证字段：<code>{item.authenticationHeader}</code>
                  </Text>
                  <Text size="sm">可用接口：{item.endpoints.join('、')}</Text>
                  <Group>
                    <Button
                      size="xs"
                      variant="light"
                      loading={revealing === item.id}
                      onClick={() => {
                        if (!credential) return reveal(item.id)
                        setCredentials((current) => {
                          const next = { ...current }
                          delete next[item.id]
                          return next
                        })
                      }}
                    >
                      {credential ? '隐藏 API Key' : '显示 API Key'}
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color="orange"
                      loading={busy === `regenerate-package-${item.id}`}
                      onClick={() => {
                        if (!window.confirm('重新生成后旧 Key 将立即失效，Token 剩余额度保持不变。是否继续？')) return
                        void run(
                          `regenerate-package-${item.id}`,
                          async () => {
                            const next = await regenerateComputePackageKey(item.id)
                            setCredentials((current) => ({ ...current, [item.id]: next }))
                          },
                          '套餐 API Key 已重新生成'
                        )
                      }}
                    >
                      重新生成 Key
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            )
          })}
        </Stack>
      )}
    </Section>
  )
}

function ReferralRewardsTable({ entries }: { entries: ComputeReferralReward[] }) {
  const rewardStatus: Record<ComputeReferralReward['status'], string> = {
    WAITING: '7 天确认期',
    PAID: '已到账',
    CANCELLED: '已取消',
  }
  return (
    <SimpleTable
      columns={['被邀请人', '首次充值', '返佣比例', '返佣金额', '状态', '预计/实际到账时间']}
      rows={entries.map((item) => [
        item.inviteeEmail,
        `¥${formatNumber(item.rechargeAmount, 4)}`,
        `${formatNumber(item.rewardRate * 100, 2)}%`,
        `¥${formatNumber(item.rewardAmount, 4)}`,
        item.cancelReason ? `${rewardStatus[item.status]}：${item.cancelReason}` : rewardStatus[item.status],
        formatDate(item.paidAt || item.releaseAt),
      ])}
      empty="暂无邀请佣金记录"
    />
  )
}

function WithdrawalTable({ entries }: { entries: ComputeWithdrawal[] }) {
  return (
    <SimpleTable
      columns={['回购单号', '回购卡时', '到账人民币', '去向', '状态', '时间']}
      rows={entries.map((item) => [
        item.withdrawalNo,
        formatCardHours(item.cardHours),
        `¥${formatNumber(item.cnyAmount, 4)}`,
        'KOD 内部人民币钱包',
        statusLabel(item.status),
        formatDate(item.completedAt || item.createTime),
      ])}
      empty="暂无卡时回购记录"
    />
  )
}

function ReservationsPanel({
  currentUserId,
  busy,
  run,
}: {
  currentUserId?: number
  busy: string | null
  run: RunAction
}) {
  const buyerQuery = useQuery({
    queryKey: ['compute', 'reservations', 'buyer'],
    queryFn: () => listComputeReservations('buyer'),
  })
  const supplierQuery = useQuery({
    queryKey: ['compute', 'reservations', 'supplier'],
    queryFn: () => listComputeReservations('supplier'),
  })
  return (
    <Stack>
      <Alert color="blue" title="卡时担保规则">
        买家付款后卡时由平台冻结，不会立即进入卖家账户；双方先在订单内沟通并确认结构化排期。商家交付后，
        买家可确认收货或在 24 小时内发起争议；无争议订单会自动确认，低风险订单在租期结束后结算，
        异常或达到审核阈值的订单继续冻结并转人工处理。你可以同时是购买方和已认证供应方。
      </Alert>
      <Tabs defaultValue="buyer" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="buyer">我购买的（{buyerQuery.data?.length || 0}）</Tabs.Tab>
          <Tabs.Tab value="supplier">我出租的（{supplierQuery.data?.length || 0}）</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="buyer" pt="md">
          <Stack>
            {(buyerQuery.data || []).length === 0 ? (
              <EmptyState title="暂无买方订单" description="请从算力市场选择商家发布的固定 GPU 套餐。" />
            ) : (
              (buyerQuery.data || []).map((reservation) => (
                <ReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  currentUserId={currentUserId}
                  busy={busy}
                  run={run}
                  view="buyer"
                />
              ))
            )}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="supplier" pt="md">
          <Stack>
            {(supplierQuery.data || []).length === 0 ? (
              <EmptyState title="暂无出租订单" description="已认证供应方发布商品并成交后，订单会显示在这里。" />
            ) : (
              (supplierQuery.data || []).map((reservation) => (
                <ReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  currentUserId={currentUserId}
                  busy={busy}
                  run={run}
                  view="supplier"
                />
              ))
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}

function ReservationCard({
  reservation,
  busy,
  run,
  view,
  currentUserId,
  productPackageDurationHours,
}: {
  reservation: ComputeReservation
  busy: string | null
  run: RunAction
  view: 'buyer' | 'supplier'
  currentUserId?: number
  productPackageDurationHours?: number | null
}) {
  const [sshDelivery, setSshDelivery] = useState({
    host: '',
    port: 22,
    username: '',
    actualStart: '',
    deliveryNote: '',
  })
  const [dispute, setDispute] = useState({ reason: '', evidence: '' })
  const key = `${view}-reservation-${reservation.id}`
  const marketplace = reservation.tradeMode === 'MARKETPLACE_FIXED'
  const cancellable = marketplace && ['PENDING_SCHEDULE', 'PENDING_DELIVERY'].includes(reservation.status)
  const manualReview = classifyComputeReservationReview(reservation)
  const packageDurationHours = resolvePackageDurationHours(reservation, productPackageDurationHours)
  const structuredSchedule = Number(reservation.workflowVersion || 1) >= 2
  const deliveryStart = structuredSchedule ? reservation.startTime : sshDelivery.actualStart
  const actualEnd = structuredSchedule
    ? reservation.endTime
    : addHoursToLocalDateTime(sshDelivery.actualStart, packageDurationHours)
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Flex align="flex-start" gap="md" wrap="wrap">
          <OrderProductImage reservation={reservation} />
          <Flex justify="space-between" align="flex-start" gap="md" wrap="wrap" style={{ flex: 1, minWidth: 0 }}>
            <Box>
              <Group gap="xs">
                <Title order={5}>{reservation.productName}</Title>
                <StatusBadge status={reservation.status} />
              </Group>
              <Text size="sm" c="chatbox-tertiary">
                {reservation.gpuModel} × {reservation.gpuCount}
                {marketplace && reservation.scheduleConfirmedAt
                  ? ` · 商定使用时间 ${formatDate(reservation.startTime)} 至 ${formatDate(reservation.endTime)}`
                  : marketplace && reservation.status === 'PENDING_SCHEDULE'
                    ? ` · 排期确认截止 ${formatDate(reservation.scheduleDeadlineAt)}`
                    : marketplace
                      ? ` · 交付截止 ${formatDate(reservation.deliveryDeadlineAt)}`
                      : ` · 历史预订 ${formatDate(reservation.startTime)} 至 ${formatDate(reservation.endTime)}`}
              </Text>
            </Box>
            <Text fw={700}>{formatCardHours(reservation.frozenCardHours)} 卡时</Text>
          </Flex>
        </Flex>
        {view === 'supplier' && reservation.buyerEmail && <Text size="sm">买方：{reservation.buyerEmail}</Text>}
        {reservation.incidentReason && (
          <Alert color="red">异常原因：{reservation.incidentReason}，等待管理员处理。</Alert>
        )}
        {manualReview.needsManualReview && !reservation.incidentReason && (
          <Alert color="violet" title="订单正在等待人工结算审核">
            {manualReview.reasons.join('；')}。卡时会继续冻结，审核完成后才会结算或退款。
            {reservation.manualReviewRequestedAt
              ? ` 提交审核：${formatDate(reservation.manualReviewRequestedAt)}。`
              : ''}
          </Alert>
        )}
        {!marketplace && <Alert color="gray">这是旧版预订记录，仅保留查看，不再使用旧版凭证交付功能。</Alert>}
        {marketplace && (
          <MarketplaceOrderWorkspace reservation={reservation} currentUserId={currentUserId} busy={busy} run={run} />
        )}
        {reservation.deliveryInfo && (
          <Alert color="teal" title="交付信息">
            <Text style={{ whiteSpace: 'pre-wrap' }}>{reservation.deliveryInfo}</Text>
            <Text size="xs" mt="xs">
              交付时间：{formatDate(reservation.deliveredAt)}
              {marketplace && reservation.autoConfirmAt
                ? `；无争议自动确认时间：${formatDate(reservation.autoConfirmAt)}`
                : ''}
            </Text>
          </Alert>
        )}
        {view === 'buyer' &&
          marketplace &&
          ['PENDING_SCHEDULE', 'PENDING_DELIVERY'].includes(reservation.status) &&
          !reservation.deliveryInfo && (
            <Alert color="yellow">卡时已冻结，正在等待商家按承诺时限配置你的公钥并提交 SSH 地址。</Alert>
          )}
        {view === 'buyer' && cancellable && (
          <Button
            variant="light"
            color="red"
            loading={busy === key}
            onClick={() => run(key, () => cancelComputeReservation(reservation.id), '订单已取消，卡时已全额解冻')}
          >
            商家交付前取消订单
          </Button>
        )}
        {view === 'buyer' && marketplace && reservation.status === 'DELIVERED' && (
          <Stack gap="xs">
            <Alert color="yellow">
              请先实际验证资源。确认后订单进入结算流程；如无法连接、规格不符或交付有误，请在 24
              小时内提交争议证据。异常或大额订单会转人工审核。
            </Alert>
            <Group grow>
              <Button
                loading={busy === `${key}-confirm`}
                onClick={() =>
                  run(
                    `${key}-confirm`,
                    () => confirmComputeReservation(reservation.id),
                    '已确认收到资源；订单将在租期结束后按审核规则结算'
                  )
                }
              >
                确认收到资源
              </Button>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                label="争议原因"
                placeholder="例如无法连接、规格与商品不符"
                value={dispute.reason}
                onChange={(event) => setDispute({ ...dispute, reason: event.target.value })}
              />
              <Textarea
                label="文字证据"
                placeholder="填写错误信息、测试过程、约定内容等可核验事实"
                value={dispute.evidence}
                onChange={(event) => setDispute({ ...dispute, evidence: event.target.value })}
                autosize
                minRows={2}
              />
            </SimpleGrid>
            <Button
              color="red"
              variant="light"
              loading={busy === `${key}-dispute`}
              disabled={!dispute.reason.trim() || !dispute.evidence.trim()}
              onClick={() =>
                run(
                  `${key}-dispute`,
                  () => disputeComputeReservation(reservation.id, dispute.reason, dispute.evidence),
                  '争议已提交，卡时将继续冻结并等待管理员裁决'
                )
              }
            >
              发起争议
            </Button>
          </Stack>
        )}
        {view === 'supplier' && marketplace && reservation.status === 'PENDING_DELIVERY' && (
          <Stack gap="xs">
            <Alert color="blue">
              平台不需要你的服务器密码或私钥。请把买家的公钥配置到订单专属临时账号，再填写连接地址和双方商定的使用时间。
              只有资源已经可连接时才能标记交付；约定开通时间最多可晚于当前时间 15 分钟。
            </Alert>
            <Textarea
              label="买家 SSH 公钥（只读）"
              value={reservation.buyerPublicKey || ''}
              readOnly
              autosize
              minRows={3}
            />
            <Button
              size="xs"
              variant="light"
              w="fit-content"
              onClick={() => copyToClipboard(reservation.buyerPublicKey || '')}
            >
              复制买家公钥
            </Button>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                label="SSH 地址"
                value={sshDelivery.host}
                onChange={(event) => setSshDelivery({ ...sshDelivery, host: event.target.value })}
              />
              <NumberInput
                label="SSH 端口"
                min={1}
                max={65535}
                value={sshDelivery.port}
                onChange={(value) => setSshDelivery({ ...sshDelivery, port: Number(value) || 22 })}
              />
              <TextInput
                label="订单专属临时用户名"
                value={sshDelivery.username}
                onChange={(event) => setSshDelivery({ ...sshDelivery, username: event.target.value })}
              />
              {structuredSchedule ? (
                <TextInput label="已确认开通时间" value={formatDate(reservation.startTime)} readOnly />
              ) : (
                <TextInput
                  label="商定开通时间"
                  type="datetime-local"
                  value={sshDelivery.actualStart}
                  onChange={(event) => setSshDelivery({ ...sshDelivery, actualStart: event.target.value })}
                />
              )}
              <TextInput
                label="商定到期时间"
                type={structuredSchedule ? 'text' : 'datetime-local'}
                description={
                  packageDurationHours
                    ? `按该订单 ${packageDurationHours} 小时套餐自动计算，无需手工填写`
                    : '未能读取套餐时长，请刷新订单后重试'
                }
                value={structuredSchedule ? formatDate(actualEnd) : actualEnd}
                readOnly
              />
            </SimpleGrid>
            <Textarea
              label="交付说明（禁止填写密码或私钥）"
              value={sshDelivery.deliveryNote}
              onChange={(event) => setSshDelivery({ ...sshDelivery, deliveryNote: event.target.value })}
              autosize
              minRows={2}
            />
            <Button
              loading={busy === key}
              disabled={!sshDelivery.host.trim() || !sshDelivery.username.trim() || !deliveryStart || !actualEnd}
              onClick={() =>
                run(
                  key,
                  () =>
                    deliverComputeReservation(reservation.id, {
                      sshHost: sshDelivery.host,
                      sshPort: sshDelivery.port,
                      sshUsername: sshDelivery.username,
                      actualStart: deliveryStart,
                      actualEnd,
                      deliveryNote: sshDelivery.deliveryNote,
                    }),
                  'GPU 资源已交付，24 小时无争议将自动确认；租期结束后按审核规则结算'
                )
              }
            >
              标记已交付
            </Button>
          </Stack>
        )}
      </Stack>
    </Paper>
  )
}

function OrderProductImage({ reservation }: { reservation: ComputeReservation }) {
  if (!reservation.coverImageId) return null
  return (
    <Box
      component="img"
      src={getComputeProductImageUrl(reservation.productId, reservation.coverImageId)}
      alt={`${reservation.productName} 商品图片`}
      loading="lazy"
      style={{
        width: 180,
        height: 112,
        flex: '0 0 180px',
        objectFit: 'cover',
        borderRadius: 8,
        border: '1px solid var(--mantine-color-default-border)',
      }}
    />
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
          创建定向转让
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
    resourceProof: null,
  })
  const [productImages, setProductImages] = useState<File[]>([])
  const [gpu, setGpu] = useState({
    nodeId: 0,
    name: 'H100 GPU 资源',
    description: '公司内部 H100 固定套餐，由商家自主交付。',
    region: '待确认',
    gpuModel: 'H100',
    gpuMemoryGb: 80,
    gpuCount: 1,
    packagePriceCardHours: 24,
    packageDurationHours: 24,
    deliveryDeadlineHours: 12,
    deliveryMode: '买家公钥＋商家站内 SSH 地址交付',
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
            身份状态：{statusLabel(identity.status)}。入驻通过后提交 GPU 硬件信息和资源证明，审核通过即可发布固定套餐。
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
          <Tabs.Tab value="devices">资源资质</Tabs.Tab>
          <Tabs.Tab value="products">产品发布</Tabs.Tab>
          <Tabs.Tab value="hosting">算力托管</Tabs.Tab>
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
              <Section title="提交 GPU 资源资质">
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
                  <FileInput
                    label="GPU 资源证明"
                    description="上传设备后台、nvidia-smi 或资源授权证明截图；支持 JPG/PNG，超过 800 KB 会自动压缩。"
                    accept="image/jpeg,image/png"
                    value={node.resourceProof}
                    onChange={(resourceProof) => setNode({ ...node, resourceProof })}
                  />
                </SimpleGrid>
                <Button
                  mt="md"
                  loading={busy === 'supplier-node'}
                  disabled={!node.nodeName.trim() || !node.resourceProof}
                  onClick={() => run('supplier-node', () => createSupplierNode(node), 'GPU 资源资质已提交审核')}
                >
                  提交资源审核
                </Button>
              </Section>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="products" pt="md">
          <Stack>
            {supplier.status === 'APPROVED' && (
              <Section title="基于已审核资源发布固定 GPU 套餐">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <Select
                    label="已审核 GPU 资源"
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
                    label="固定套餐价格（卡时）"
                    min={0.001}
                    step={0.001}
                    decimalScale={3}
                    value={gpu.packagePriceCardHours}
                    onChange={(value) => setGpu({ ...gpu, packagePriceCardHours: Number(value) || 0 })}
                  />
                  <NumberInput
                    label="套餐使用时长（小时）"
                    min={1}
                    value={gpu.packageDurationHours}
                    onChange={(value) => setGpu({ ...gpu, packageDurationHours: Number(value) || 0 })}
                  />
                  <NumberInput
                    label="承诺交付时限（付款后小时）"
                    min={1}
                    value={gpu.deliveryDeadlineHours}
                    onChange={(value) => setGpu({ ...gpu, deliveryDeadlineHours: Number(value) || 0 })}
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
                  <FileInput
                    label="商品图片（最多 6 张）"
                    description="第一张作为市场封面，其余作为详情图。"
                    accept="image/jpeg,image/png"
                    multiple
                    value={productImages}
                    onChange={(files) => setProductImages(files.slice(0, 6))}
                  />
                </SimpleGrid>
                <Button
                  mt="md"
                  loading={busy === 'supplier-product'}
                  disabled={!gpu.nodeId}
                  onClick={() =>
                    run(
                      'supplier-product',
                      () => createSupplierGpuProduct(gpu, productImages),
                      'GPU 固定套餐已提交审核'
                    )
                  }
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
                    ? product.tradeMode === 'MARKETPLACE_FIXED'
                      ? `${formatCardHours(product.packagePriceCardHours)} 卡时 / ${product.packageDurationHours || 0} 小时`
                      : '旧版时段商品（仅保留记录）'
                    : `${formatCardHours(product.promptRatePerMillion)} / 百万 Token`,
                  statusLabel(product.status),
                  product.rejectionReason || '-',
                ])}
                empty="尚未发布商品"
              />
            </Section>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="hosting" pt="md">
          <HostedComputePanel busy={busy} run={run} />
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
  const upstreamsQuery = useQuery({ queryKey: ['compute', 'admin-upstreams'], queryFn: listAdminUpstreams })
  const suspendedKeysQuery = useQuery({
    queryKey: ['compute', 'admin-suspended-proxy-keys'],
    queryFn: listAdminSuspendedProxyKeys,
  })
  const [api, setApi] = useState({
    name: 'KOD 测试模型 API',
    description: '内部测试模型，购买固定 Token 套餐后使用。',
    region: 'KAI 公司中转站',
    modelId: '',
    packagePromptTokens: 1000000,
    packageCompletionTokens: 500000,
    packagePriceCardHours: 1,
    slaDescription: '内部测试价与 SLA，正式使用前需重新确认',
    upstreamStationId: 0,
    upstreamKeyId: 0,
  })
  const [grant, setGrant] = useState({ recipientEmail: '', cardHours: 100, expiresAt: '', reason: '内部 MVP 测试' })

  useEffect(() => {
    const first = upstreamsQuery.data?.[0]
    if (!first || api.upstreamKeyId) return
    setApi((current) => ({ ...current, upstreamStationId: first.stationId, upstreamKeyId: first.keyId }))
  }, [api.upstreamKeyId, upstreamsQuery.data])

  return (
    <Stack gap="md">
      <AdminOverview overview={overviewQuery.data} />
      <Alert color="violet" title="管理员可以处理什么">
        审核实名认证、资源商、GPU 资源证明和商品；维护商品可售状态；处理买家在交付后 24
        小时内提交的交易争议，以及由异常或大额规则拦截的结算订单。平台不登录或控制商家服务器。本人提交的资料和商品必须由另一名管理员审核。
      </Alert>
      <Tabs defaultValue="reviews" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="reviews">审核中心</Tabs.Tab>
          <Tabs.Tab value="operations">资源与争议</Tabs.Tab>
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
                <Select
                  label="上游零售站与 API Key"
                  description="买家只会看到 KOD 平台代理 Key"
                  value={api.upstreamKeyId ? `${api.upstreamStationId}:${api.upstreamKeyId}` : null}
                  data={(upstreamsQuery.data || []).map((item) => ({
                    value: `${item.stationId}:${item.keyId}`,
                    label: `${item.stationUrl} · ${item.keyLabel}`,
                  }))}
                  onChange={(value) => {
                    const [stationId, keyId] = (value || '0:0').split(':').map(Number)
                    setApi({ ...api, upstreamStationId: stationId, upstreamKeyId: keyId })
                  }}
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
                disabled={!api.modelId.trim() || !api.name.trim() || !api.upstreamKeyId}
                onClick={() => run('admin-api-product', () => createAdminApiProduct(api), '模型 API 商品已上架')}
              >
                创建并上架
              </Button>
            </Section>
            <AdminApiUpstreamAssignments
              products={productsQuery.data || []}
              upstreams={upstreamsQuery.data || []}
              busy={busy}
              run={run}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="reviews" pt="md">
          <Stack>
            <AdminIdentityReviews identities={identitiesQuery.data || []} busy={busy} run={run} />
            <AdminSupplierReviews suppliers={suppliersQuery.data || []} busy={busy} run={run} />
            <AdminNodeReviews nodes={nodesQuery.data || []} busy={busy} run={run} />
            <AdminProductReviews products={productsQuery.data || []} busy={busy} run={run} />
            <AdminTransferReviews transfers={transfersQuery.data || []} busy={busy} run={run} />
            <AdminReviewHistory />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="operations" pt="md">
          <Stack>
            <CardHourAdminPanel busy={busy} run={run} />
            <AdminNodeOperations nodes={nodesQuery.data || []} busy={busy} run={run} />
            <AdminReservationOperations
              reservations={reservationsQuery.data || []}
              reservationManualReviewThreshold={overviewQuery.data?.reservationManualReviewThreshold}
              busy={busy}
              run={run}
            />
            <AdminSuspendedProxyKeys keys={suspendedKeysQuery.data || []} busy={busy} run={run} />
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}

function AdminApiUpstreamAssignments({
  products,
  upstreams,
  busy,
  run,
}: {
  products: ComputeProduct[]
  upstreams: ComputeUpstreamOption[]
  busy: string | null
  run: RunAction
}) {
  const apiProducts = products.filter((item) => item.productType === 'API')
  const [selections, setSelections] = useState<Record<number, string>>({})
  return (
    <Section title="已上架 API 套餐的上游配置">
      <Alert color="blue" mb="md">
        可为旧套餐补配或切换上游。切换后用户已复制的 KOD 套餐 Key 不变，零售站真实 Key 不会暴露。
      </Alert>
      {apiProducts.length === 0 ? (
        <Text c="chatbox-tertiary">暂无 API 套餐</Text>
      ) : (
        <Stack>
          {apiProducts.map((product) => {
            const current = product.upstreamKeyId ? `${product.upstreamStationId}:${product.upstreamKeyId}` : null
            const selected = selections[product.id] || current
            return (
              <Flex key={product.id} align="end" gap="md" wrap="wrap">
                <Box style={{ flex: 1, minWidth: 220 }}>
                  <Text fw={600}>{product.name}</Text>
                  <Text size="sm" c="chatbox-tertiary">
                    固定模型：{product.modelId}；{current ? '已配置上游' : '尚未配置，用户无法购买或取得 Key'}
                  </Text>
                </Box>
                <Select
                  label="零售站与 Key"
                  w={360}
                  value={selected}
                  data={upstreams.map((item) => ({
                    value: `${item.stationId}:${item.keyId}`,
                    label: `${item.stationUrl} · ${item.keyLabel}`,
                  }))}
                  onChange={(value) => value && setSelections({ ...selections, [product.id]: value })}
                />
                <Button
                  loading={busy === `upstream-${product.id}`}
                  disabled={!selected || selected === current}
                  onClick={() => {
                    const [stationId, keyId] = (selected || '').split(':').map(Number)
                    return run(
                      `upstream-${product.id}`,
                      () => configureAdminProductUpstream(product.id, stationId, keyId),
                      'API 套餐上游已更新'
                    )
                  }}
                >
                  保存上游
                </Button>
              </Flex>
            )
          })}
        </Stack>
      )}
    </Section>
  )
}

function AdminSuspendedProxyKeys({
  keys,
  busy,
  run,
}: {
  keys: ComputeSuspendedProxyKey[]
  busy: string | null
  run: RunAction
}) {
  return (
    <Section title={`异常套餐 Key（${keys.length}）`}>
      {keys.length === 0 ? (
        <Text c="chatbox-tertiary">暂无因 usage 异常而暂停的套餐 Key</Text>
      ) : (
        <Stack>
          {keys.map((item) => (
            <Paper key={item.id} withBorder p="md" radius="md">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={600}>
                    {item.productName} · {item.email}
                  </Text>
                  <StatusBadge status={item.keyStatus} />
                </Group>
                <Text size="sm">
                  模型：{item.modelId}；Key 尾号：{item.accessKeyLast4}；上游：{item.stationUrl || '-'}
                </Text>
                <Alert color="red">{item.suspendedReason}</Alert>
                <Group justify="flex-end">
                  <Button
                    variant="light"
                    loading={busy === `restore-key-${item.id}`}
                    onClick={() =>
                      run(`restore-key-${item.id}`, () => repairAdminProxyKey(item.id, false), '套餐 Key 已恢复')
                    }
                  >
                    原 Key 恢复
                  </Button>
                  <Button
                    color="orange"
                    loading={busy === `regenerate-key-${item.id}`}
                    onClick={() =>
                      run(
                        `regenerate-key-${item.id}`,
                        () => repairAdminProxyKey(item.id, true),
                        '已重新生成套餐 Key，用户可在我的资产查看'
                      )
                    }
                  >
                    重新生成并恢复
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

function AdminNodeOperations({ nodes, busy, run }: { nodes: ComputeGpuNode[]; busy: string | null; run: RunAction }) {
  const manageable = nodes.filter((item) => !['PENDING', 'REJECTED'].includes(item.status))
  const [targets, setTargets] = useState<Record<number, string>>({})
  const [reasons, setReasons] = useState<Record<number, string>>({})
  return (
    <Section title={`资源可售状态（${manageable.length}）`}>
      <Alert color="blue" mb="md">
        “运行中”表示资质有效且允许发布新商品；切为“待处理”或“已离线”只会暂停新商品接单，不会让平台接管或中断商家已经交付的资源。
      </Alert>
      <Stack>
        {manageable.length === 0 ? (
          <Text c="chatbox-tertiary">暂无已审核资源</Text>
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
  reservationManualReviewThreshold,
  busy,
  run,
}: {
  reservations: ComputeReservation[]
  reservationManualReviewThreshold?: number | null
  busy: string | null
  run: RunAction
}) {
  const actionable = reservations
    .map((item) => ({
      item,
      review: classifyComputeReservationReview(item, { reservationManualReviewThreshold }),
    }))
    .filter(
      ({ item, review }) =>
        review.needsManualReview ||
        (['CONFIRMED', 'IN_USE'].includes(item.status) && new Date(item.endTime).getTime() <= Date.now())
    )
  const [resolutions, setResolutions] = useState<Record<number, 'FULL_REFUND' | 'ACTUAL_USAGE' | 'FULL_SETTLEMENT'>>({})
  const [actuals, setActuals] = useState<Record<number, number>>({})
  const [reasons, setReasons] = useState<Record<number, string>>({})
  return (
    <Section title={`租赁结算审核与历史补偿（${actionable.length}）`}>
      {reservationManualReviewThreshold && reservationManualReviewThreshold > 0 && (
        <Alert color="violet" mb="md">
          冻结卡时达到 {formatCardHours(reservationManualReviewThreshold)}{' '}
          的订单，必须由管理员填写处理原因后才能完成结算或退款。
        </Alert>
      )}
      {actionable.length === 0 ? (
        <Text c="chatbox-tertiary">暂无需要人工处理的订单</Text>
      ) : (
        <Stack>
          {actionable.map(({ item, review }) => {
            const persistedManualReview =
              item.manualReviewRequired === true ||
              ['EXCEPTION_PENDING', 'DISPUTED', 'PENDING_REVIEW'].includes(item.status)
            const canResolve = review.needsManualReview && persistedManualReview
            const resolution = resolutions[item.id] || 'FULL_REFUND'
            return (
              <Paper key={item.id} withBorder p="md" radius="md">
                <Stack gap="sm">
                  <Flex align="flex-start" gap="md" wrap="wrap">
                    <OrderProductImage reservation={item} />
                    <Flex justify="space-between" gap="md" wrap="wrap" style={{ flex: 1, minWidth: 0 }}>
                      <Box>
                        <Group gap="xs">
                          <Text fw={600}>{item.productName}</Text>
                          <StatusBadge status={item.status} />
                        </Group>
                        <Text size="sm" c="chatbox-tertiary">
                          买方 {item.buyerEmail} · 商家 {item.supplierEmail || '-'} · {formatDate(item.startTime)} 至{' '}
                          {formatDate(item.endTime)}
                        </Text>
                      </Box>
                      <Text fw={700}>冻结 {formatCardHours(item.frozenCardHours)} 卡时</Text>
                    </Flex>
                  </Flex>
                  {item.incidentReason && <Alert color="red">异常原因：{item.incidentReason}</Alert>}
                  {item.disputeEvidence && <Alert color="orange">买家证据：{item.disputeEvidence}</Alert>}
                  {review.needsManualReview && (
                    <Alert color="violet" title="人工审核触发原因">
                      {review.reasons.join('；')}
                      {item.manualReviewRequestedAt ? `。提交审核：${formatDate(item.manualReviewRequestedAt)}` : ''}
                      {item.manualReviewPolicyVersion ? `；规则版本：${item.manualReviewPolicyVersion}` : ''}
                    </Alert>
                  )}
                  {review.needsManualReview && !persistedManualReview && (
                    <Alert color="yellow">
                      该订单已达到前端展示阈值，但服务端尚未将其转入“待管理员审核”。为避免绕过结算规则，此处不会提供结算操作；请检查服务端结算任务后刷新。
                    </Alert>
                  )}
                  {canResolve ? (
                    <>
                      <SimpleGrid cols={{ base: 1, sm: 3 }}>
                        <Select
                          label="处理方式"
                          value={resolution}
                          data={[
                            { value: 'FULL_REFUND', label: '全额退还买方' },
                            { value: 'ACTUAL_USAGE', label: '部分结算、剩余退款' },
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
                          label="结算给商家的卡时"
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
                                ...(item.version == null ? {} : { expectedVersion: item.version }),
                              }),
                            '审核决定已保存，订单已完成账务结算'
                          )
                        }
                      >
                        确认处理
                      </Button>
                    </>
                  ) : (
                    !review.needsManualReview && (
                      <Button
                        loading={busy === `settle-${item.id}`}
                        onClick={() =>
                          run(
                            `settle-${item.id}`,
                            () => settleAdminReservation(item.id, item.version),
                            '订单已立即结算'
                          )
                        }
                      >
                        立即结算（定时任务补偿）
                      </Button>
                    )
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
  const items: Array<[string, number]> = [
    ['待审实名认证', overview?.identitiesPending || 0],
    ['待审供应方', overview?.suppliersPending || 0],
    ['待审 GPU 资源', overview?.nodesPending || 0],
    ['待审产品', overview?.productsPending || 0],
    ['待处理资源', overview?.nodesPendingAction || 0],
  ]
  if (overview?.reservationsPendingManualReview !== undefined) {
    items.push(['待审租赁结算', overview.reservationsPendingManualReview])
  }
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
  const [reservationManualReviewThreshold, setReservationManualReviewThreshold] = useState<number | null>(null)
  const [usdCnyRate, setUsdCnyRate] = useState(7.2)
  const supportsReservationReviewPolicy = overview?.reservationManualReviewThreshold !== undefined

  useEffect(() => {
    if (!overview) return
    setTransferReviewThreshold(Number(overview.transferReviewThreshold))
    const reservationThreshold = Number(overview.reservationManualReviewThreshold)
    setReservationManualReviewThreshold(
      Number.isFinite(reservationThreshold) && reservationThreshold > 0 ? reservationThreshold : null
    )
    setUsdCnyRate(Number(overview.usdCnyRate || 7.2))
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
        {supportsReservationReviewPolicy ? (
          <NumberInput
            label="租赁结算人工审核阈值（卡时）"
            description="冻结卡时达到该值的租赁订单，结束时必须转人工审核。"
            min={0.001}
            decimalScale={3}
            value={reservationManualReviewThreshold ?? ''}
            onChange={(value) => setReservationManualReviewThreshold(Number(value) || null)}
            w={280}
          />
        ) : (
          <Alert color="yellow" style={{ flex: '1 1 280px', minWidth: 0 }}>
            当前后端尚未返回“租赁结算人工审核阈值”。部署审核策略后，可在这里统一配置；前端不会用本地设置绕过服务端结算规则。
          </Alert>
        )}
        <NumberInput
          label="美元兑人民币估算汇率"
          description="仅用于第三方 GPU 行情折算展示"
          min={0.0001}
          decimalScale={4}
          value={usdCnyRate}
          onChange={(value) => setUsdCnyRate(Number(value) || 0)}
          w={240}
        />
        <NumberInput
          label="平台佣金（第一版固定）"
          description="商家订单确认后获得全部卡时"
          value={0}
          disabled
          w={220}
        />
        <Button
          loading={busy === 'admin-settings'}
          disabled={
            transferReviewThreshold <= 0 ||
            usdCnyRate <= 0 ||
            (supportsReservationReviewPolicy &&
              !(reservationManualReviewThreshold && reservationManualReviewThreshold > 0))
          }
          onClick={() =>
            run(
              'admin-settings',
              () =>
                updateComputeAdminSettings({
                  transferReviewThreshold,
                  ...(supportsReservationReviewPolicy && reservationManualReviewThreshold
                    ? { reservationManualReviewThreshold }
                    : {}),
                  platformFeeRate: 0,
                  usdCnyRate,
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
  const openProof = async (nodeId: number) => {
    const blob = await getAdminNodeProof(nodeId)
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  return (
    <Section title={`GPU 资源证明审核（${pending.length}）`}>
      {pending.length === 0 ? (
        <Text c="chatbox-tertiary">暂无待审核 GPU 资源</Text>
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
                <Button size="xs" variant="light" w="fit-content" onClick={() => openProof(item.id)}>
                  查看资源证明
                </Button>
                <TextInput
                  label="资质审核说明"
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
                        'GPU 资源资质已拒绝'
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
                        'GPU 资源资质已通过，可以发布商品'
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
      {pending.length === 0 ? (
        <Text c="chatbox-tertiary">暂无待审核商品</Text>
      ) : (
        <Stack>
          {pending.map((product) => (
            <AdminProductReviewCard
              key={product.id}
              product={product}
              loading={busy === `admin-product-${product.id}`}
              onReview={(approved, reason) =>
                run(
                  `admin-product-${product.id}`,
                  () => reviewAdminProduct(product.id, approved, reason),
                  approved ? '商品已上架，审核记录已保存' : '商品已拒绝，审核原因已保存'
                )
              }
            />
          ))}
        </Stack>
      )}
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
      columns={['时间', '模型', '输入（扣除/赠送）', '输出（扣除/赠送）', '状态/异常']}
      rows={entries.map((entry) => [
        formatDate(entry.createTime),
        entry.modelId,
        `${formatTokens(entry.deductedPromptTokens)} / ${formatTokens(entry.giftedPromptTokens)}`,
        `${formatTokens(entry.deductedCompletionTokens)} / ${formatTokens(entry.giftedCompletionTokens)}`,
        entry.errorMessage ? `${statusLabel(entry.status)}：${entry.errorMessage}` : statusLabel(entry.status),
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
      : status.includes('REJECT') || status.includes('CANCEL') || ['EXPIRED', 'EXHAUSTED', 'SUSPENDED'].includes(status)
        ? 'red'
        : status.includes('PENDING') || status === 'CONFIG_REQUIRED'
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
  CONFIG_REQUIRED: '待配置上游',
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
  PENDING_SCHEDULE: '待双方确认排期',
  PENDING_RECIPIENT: '待接收方确认',
  PENDING_DELIVERY: '待供应方交付',
  DELIVERED: '已交付，待买家确认',
  DISPUTED: '争议处理中',
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
  GPU_MARKETPLACE: 'GPU 固定套餐',
  PURCHASE: '购买',
  ADMIN_GRANT: '管理员发放',
  API_USAGE: 'API 消耗',
  PAID: '已从套餐扣除',
  GIFTED_OVERAGE: '额度耗尽，超额已赠送',
  NO_PACKAGE: '无套餐，未扣人民币',
  PARTIAL: '部分额度已耗尽',
  EXHAUSTED: '已耗尽',
  USAGE_MISSING: 'usage 异常',
  UPSTREAM_ERROR: '上游错误',
  SUPPLIER_INCOME: '供应方收入',
  GPU_RENTAL_INCOME: 'GPU 租金收益',
  API_SALES_INCOME: 'Token 套餐销售收益',
  WITHDRAWAL: '提现到内部钱包',
  GPU_SETTLEMENT: 'GPU 订单结算',
  GPU_REFUND: 'GPU 订单退款',
  AUTO_SETTLEMENT: '自动结算',
  AUTO_CONFIRM_24H: '24 小时无争议自动确认',
  BUYER_CONFIRMED: '买家确认收货',
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
