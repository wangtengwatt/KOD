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
  IconCopy,
  IconCpu,
  IconDatabaseDollar,
  IconGauge,
  IconGift,
  IconReceipt,
  IconRefresh,
  IconServer,
  IconShieldCheck,
  IconTransfer,
  IconWallet,
} from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
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

function ComputeCenterPage() {
  const { t } = useTranslation()
  const search = Route.useSearch()
  const isSmallScreen = useIsSmallScreen()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isLoggedIn = useAuthInfoStore((state) => Boolean(state.accessToken))
  const [activeTab, setActiveTab] = useState('market')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<FeedbackMessage | null>(null)
  const [cardHourPrompt, setCardHourPrompt] = useState<CardHourPrompt | null>(null)
  const closeMessage = useCallback(() => setMessage(null), [])

  const roleLabels: Record<string, string> = {
    BUYER: t('Buyer'),
    SUPPLIER: t('Certified supplier'),
    ADMIN: t('Compute admin'),
  }
  const configQuery = useQuery({ queryKey: ['compute', 'config'], queryFn: getComputeConfig })
  const productsQuery = useQuery({ queryKey: ['compute', 'products'], queryFn: () => listComputeProducts() })
  const accountQuery = useQuery({
    queryKey: ['compute', 'account'],
    queryFn: getComputeAccount,
    enabled: isLoggedIn,
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
      setMessage({ color: 'red', text: error instanceof Error ? error.message : t('Operation failed') })
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
        setMessage({ color: 'red', text: error instanceof Error ? error.message : t('Operation failed') })
        return false
      } finally {
        setBusy(null)
      }
    }

    return attempt(false)
  }

  const account = accountQuery.data
  const tabs = [
    { value: 'market', label: t('Compute Marketplace'), icon: <IconBuildingStore size={16} /> },
    { value: 'account', label: t('My Assets'), icon: <IconWallet size={16} />, login: true },
    { value: 'purchases', label: t('Purchase Records'), icon: <IconReceipt size={16} />, login: true },
    { value: 'reservations', label: t('My Orders'), icon: <IconServer size={16} />, login: true },
    { value: 'transfers', label: t('Transfers'), icon: <IconTransfer size={16} />, login: true },
    { value: 'supplier', label: t('My Devices'), icon: <IconCpu size={16} />, login: true },
    { value: 'notifications', label: t('Notifications'), icon: <IconBell size={16} />, login: true },
  ]

  return (
    <Page title={t('KOD Compute Center')}>
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
            <Alert color="blue" title={t('Public browsing mode')}>
              <Flex align="center" justify="space-between" gap="md" wrap="wrap">
                <Text size="sm">
                  {t(
                    'You can browse products; buying card hours, buying packages, transfers and supplier operations require login.'
                  )}
                </Text>
                <Button size="xs" onClick={() => navigate({ to: '/settings/provider/kod-ai' })}>
                  {t('Log in to KOD')}
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
                t('Referral relationship bound successfully')
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
  const { t } = useTranslation()
  const errorMessage = error instanceof Error ? error.message : ''
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('Confirm referral relationship')}
      centered
      closeOnClickOutside={!busy}
    >
      <Stack>
        {loading ? (
          <Text c="chatbox-tertiary">{t('Verifying referral link…')}</Text>
        ) : errorMessage ? (
          <Alert color="red">{errorMessage}</Alert>
        ) : preview ? (
          <>
            <Alert color={preview.canBind ? 'blue' : 'orange'}>
              {t('Inviter: ')}
              <b>{preview.inviterEmail}</b>
              <br />
              {t(
                'The binding is permanent and cannot be changed. After your first successful top-up and a 7-day confirmation period, your inviter receives 5% RMB commission of the top-up amount, up to ¥100 per person.'
              )}
            </Alert>
            {!preview.canBind && <Text c="red">{preview.reason}</Text>}
          </>
        ) : null}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={busy}>
            {t('Cancel')}
          </Button>
          <Button onClick={onConfirm} loading={busy} disabled={!preview?.canBind}>
            {t('Confirm binding')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function FeedbackToast({ message, onClose }: { message: FeedbackMessage | null; onClose: () => void }) {
  const { t } = useTranslation()
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
  const { t } = useTranslation()
  if (!prompt) return null
  const { quote } = prompt
  const roundedExtra = Math.max(0, quote.purchaseCardHours - quote.shortageCardHours)

  return (
    <Modal
      opened
      onClose={prompt.onCancel}
      centered
      title={
        quote.canAutoTopUp ? t('Insufficient card hours. Auto top up?') : t('Insufficient card hours and RMB balance')
      }
    >
      <Stack gap="md">
        <Alert color={quote.canAutoTopUp ? 'yellow' : 'red'}>
          {quote.canAutoTopUp
            ? t(
                'After confirmation, card hours will be purchased from the RMB wallet just enough for the operation. Both steps complete in a single transaction; no charge is made if the original operation fails.'
              )
            : t('The current RMB balance cannot cover the required card hours, short by ¥{{shortfall}}.', {
                shortfall: formatNumber(quote.cnyShortfall, 4),
              })}
        </Alert>
        <SimpleGrid cols={2} spacing="sm">
          <Metric
            label={t('Required now')}
            value={t('{{amount}} card hours', { amount: formatCardHours(quote.requiredCardHours) })}
          />
          <Metric
            label={t('Currently available')}
            value={t('{{amount}} card hours', { amount: formatCardHours(quote.availableCardHours) })}
          />
          <Metric
            label={t('Auto purchase')}
            value={t('{{amount}} card hours', { amount: formatCardHours(quote.purchaseCardHours) })}
          />
          <Metric label={t('Deducted RMB')} value={`¥${formatNumber(quote.cnyCost, 4)}`} />
        </SimpleGrid>
        {roundedExtra > 0.0001 && quote.canAutoTopUp && (
          <Text size="xs" c="chatbox-tertiary">
            {t('Card hours are rounded up by 0.1; the extra {{extra}} will remain in your account.', {
              extra: t('{{amount}} card hours', { amount: formatCardHours(roundedExtra) }),
            })}
          </Text>
        )}
        {!quote.canAutoTopUp && (
          <Text size="sm">
            {t('Current RMB balance: ¥{{balance}}; ¥{{cost}} is needed to cover the card hours.', {
              balance: formatNumber(quote.cnyBalance, 4),
              cost: formatNumber(quote.cnyCost, 4),
            })}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={prompt.onCancel}>
            {t('Cancel')}
          </Button>
          <Button color={quote.canAutoTopUp ? 'blue' : 'orange'} onClick={prompt.onConfirm}>
            {quote.canAutoTopUp ? t('Exchange card hours and continue') : t('Go to official website to top up')}
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
  const { t } = useTranslation()
  const roleLabels: Record<string, string> = {
    BUYER: t('Buyer'),
    SUPPLIER: t('Certified supplier'),
    ADMIN: t('Compute admin'),
  }
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
            <Title order={2}>{t('Every unit of compute has a clear price and destination')}</Title>
          </Group>
          <Text c="chatbox-tertiary">
            {t('Models and GPUs are traded as fixed packages, using the unified KAI standard card hour.')}
          </Text>
          <Text size="sm" c="chatbox-tertiary" mt={4}>
            {t(
              '1 KAI standard card hour = ¥{{rate}}; card hours can be exchanged into the KOD internal RMB wallet at ¥1.0000, external transfers are not supported.',
              { rate: formatNumber(rate || account?.cardHourCnyRate || 1.002, 3) }
            )}
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
                  {t('Refresh official balance')}
                </Button>
                {account.isAdmin && (
                  <Button leftSection={<IconShieldCheck size={18} />} onClick={() => onOpen('admin')}>
                    {t('Enter compute admin console')}
                  </Button>
                )}
              </Group>
            </Flex>
            <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="md">
              <Metric label={t('RMB balance')} value={`¥${formatNumber(account.cnyBalance, 4)}`} />
              <Metric
                label={t('Available card hours')}
                value={t('{{amount}} card hours', { amount: formatCardHours(account.availableCardHours) })}
              />
              <Metric
                label={t('Frozen card hours')}
                value={t('{{amount}} card hours', { amount: formatCardHours(account.frozenCardHours) })}
              />
              <Metric label={t('Lifetime income')} value={`¥${formatNumber(account.totalIncomeCny, 4)}`} />
              <Metric
                label={t('Rental income')}
                value={`${t('{{amount}} card hours', { amount: formatCardHours(account.rentalIncome) })} / ≈¥${formatNumber(account.rentalIncomeCnyEquivalent, 4)}`}
              />
              <Metric label={t('Commission income')} value={`¥${formatNumber(account.commissionIncome, 4)}`} />
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
  const { t } = useTranslation()
  const roleLabels: Record<string, string> = {
    BUYER: t('Buyer'),
    SUPPLIER: t('Certified supplier'),
    ADMIN: t('Compute admin'),
  }
  const gpuAssetStatuses: [string, string, string][] = [
    ['PENDING', t('Pending review'), 'yellow'],
    ['REJECTED', t('Review failed'), 'red'],
    ['RUNNING', t('Can publish'), 'teal'],
    ['PENDING_DELIVERY', t('Pending delivery'), 'orange'],
    ['ACTIVE_RENTAL', t('Running'), 'green'],
    ['PENDING_ACTION', t('Pending action'), 'red'],
    ['OFFLINE', t('Closed'), 'gray'],
  ]
  if (!account) return <Text c="chatbox-tertiary">{t('Loading account info…')}</Text>

  const supplierEntryLabel =
    account.identityStatus === 'NONE'
      ? t('Identity verification')
      : account.identityStatus === 'APPROVED'
        ? t('Compute onboarding')
        : t('Verification progress')

  return (
    <Stack gap="md">
      <Section title={t('My Income')}>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
          <Card withBorder padding="md">
            <Text size="sm" c="chatbox-tertiary">
              {t('Lifetime income')}
            </Text>
            <Text size="xl" fw={700}>
              ¥{formatNumber(account.totalIncomeCny, 4)}
            </Text>
            <Text size="xs" c="chatbox-tertiary">
              {t('Rental income is converted at the current buyback rate and combined with commissions')}
            </Text>
          </Card>
          <Card withBorder padding="md">
            <Text size="sm" c="chatbox-tertiary">
              {t('Rental income')}
            </Text>
            <Text size="xl" fw={700}>
              {t('{{amount}} card hours', { amount: formatCardHours(account.rentalIncome) })}
            </Text>
            <Text size="xs" c="chatbox-tertiary">
              {t('≈ ¥{{amount}}', { amount: formatNumber(account.rentalIncomeCnyEquivalent, 4) })}
            </Text>
          </Card>
          <Card withBorder padding="md">
            <Text size="sm" c="chatbox-tertiary">
              {t('Commission income')}
            </Text>
            <Text size="xl" fw={700}>
              ¥{formatNumber(account.commissionIncome, 4)}
            </Text>
            <Text size="xs" c="chatbox-tertiary">
              {t('Credited to the RMB wallet')}
            </Text>
          </Card>
          <Card withBorder padding="md">
            <Text size="sm" c="chatbox-tertiary">
              {t('Pending commissions')}
            </Text>
            <Text size="xl" fw={700}>
              ¥{formatNumber(account.pendingCommission, 4)}
            </Text>
            <Text size="xs" c="chatbox-tertiary">
              {t('Paid 7 days after the first successful top-up')}
            </Text>
          </Card>
        </SimpleGrid>
      </Section>

      <Section title={t('My GPUs')}>
        <SimpleGrid cols={{ base: 2, sm: 4, lg: 7 }} spacing="sm">
          {gpuAssetStatuses.map(([status, label, color]) => (
            <Card key={status} withBorder padding="md" style={{ cursor: 'pointer' }} onClick={() => onOpen('supplier')}>
              <Text size="xl" fw={700} c={color}>
                {account.gpuAssetCounts?.[status as keyof NonNullable<typeof account.gpuAssetCounts>] || 0}
              </Text>
              <Text size="sm">{label}</Text>
            </Card>
          ))}
        </SimpleGrid>
        <Text size="xs" c="chatbox-tertiary" mt="sm">
          {t(
            '"Can publish" means the resource review passed; "pending delivery / running / pending action" come from your rental orders as a supplier. The platform does not deploy GPUs for suppliers remotely.'
          )}
        </Text>
      </Section>

      <Section title={t('Referral rewards')}>
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Group gap="sm">
              <ThemeIcon variant="light" color="violet">
                <IconGift size={18} />
              </ThemeIcon>
              <Box>
                <Text fw={700}>{t('5% commission on first top-up')}</Text>
                <Text size="xs" c="chatbox-tertiary">
                  {t(
                    'After the invitee confirms binding and makes a first top-up, rewards are paid after 7 days; each friend earns at most ¥100.'
                  )}
                </Text>
              </Box>
            </Group>
            {referral ? (
              <>
                <TextInput
                  label={t('My referral link')}
                  readOnly
                  value={referral.inviteLink}
                  rightSection={
                    <ActionIcon
                      variant="subtle"
                      aria-label={t('Copy referral link')}
                      onClick={() => copyToClipboard(referral.inviteLink)}
                    >
                      <IconCopy size={17} />
                    </ActionIcon>
                  }
                />
                <Group gap="xl">
                  <Metric label={t('Invited')} value={t('{{count}} people', { count: referral.invitedCount })} />
                  <Metric label={t('Pending payout')} value={`¥${formatNumber(referral.pendingCommission, 4)}`} />
                  <Metric label={t('Received')} value={`¥${formatNumber(referral.paidCommission, 4)}`} />
                </Group>
                {referral.bound && (
                  <Text size="sm" c="chatbox-tertiary">
                    {t('My inviter: {{email}} · bound at {{time}}', {
                      email: referral.inviterEmail,
                      time: formatDate(referral.boundAt),
                    })}
                  </Text>
                )}
              </>
            ) : (
              <Text size="sm" c="chatbox-tertiary">
                {t('Generating your referral link…')}
              </Text>
            )}
          </Stack>
        </Paper>
      </Section>

      <Section title={t('Common Actions')}>
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="sm">
          {[
            ['supplier', supplierEntryLabel],
            ['market', t('Buy compute')],
            ['reservations', t('My Orders')],
            ['purchases', t('Purchase Records')],
            ['transfers', t('Transfer card hours')],
            ['notifications', t('Notification Center')],
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
  const { t } = useTranslation()
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
          <Title order={4}>{t('Compute Marketplace')}</Title>
          <Text size="sm" c="chatbox-tertiary">
            {t(
              'Model APIs and GPUs are traded as fixed packages; GPUs are delivered by approved suppliers and the platform only provides card hour escrow and dispute handling.'
            )}
          </Text>
        </Box>
        <Group gap="sm">
          <TextInput
            placeholder={t('Search products, models or suppliers') || undefined}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            w={240}
          />
          <Select
            value={type}
            onChange={(value) => setType((value || 'ALL') as ProductType | 'ALL')}
            data={[
              { value: 'ALL', label: t('All products') },
              { value: 'API', label: t('Model APIs') },
              { value: 'GPU', label: t('GPU Resources') },
            ]}
            w={150}
          />
        </Group>
      </Flex>

      {loading ? (
        <Text c="chatbox-tertiary">{t('Loading marketplace products…')}</Text>
      ) : visible.length === 0 ? (
        <EmptyState
          title={t('No published products yet')}
          description={t('Products appear here after an admin or approved supplier publishes and passes review.')}
        />
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
  const { t } = useTranslation()
  const actionKey = `product-${product.id}`
  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="sm" h="100%">
        {product.coverImageId ? (
          <Box
            component="img"
            src={getComputeProductImageUrl(product.id, product.coverImageId)}
            alt={product.name}
            h={150}
            style={{ width: '100%', objectFit: 'cover', borderRadius: 8 }}
          />
        ) : null}
        <Flex justify="space-between" align="flex-start" gap="sm">
          <Badge color={product.productType === 'API' ? 'blue' : 'teal'} variant="light">
            {product.productType === 'API' ? t('Model APIs') : t('GPU Resources')}
          </Badge>
          <Text size="xs" c="chatbox-tertiary">
            {product.region || t('Region TBD')}
          </Text>
        </Flex>
        <Box>
          <Title order={4}>{product.name}</Title>
          <Text size="sm" c="chatbox-tertiary" lineClamp={3} mt={4}>
            {product.description || t('No product description')}
          </Text>
        </Box>
        <Divider />
        {product.productType === 'API' ? (
          <Stack gap={4}>
            <DataRow label={t('Model')} value={product.modelId || '-'} />
            <DataRow label={t('Input quota')} value={`${formatTokens(product.packagePromptTokens)} Token`} />
            <DataRow label={t('Output quota')} value={`${formatTokens(product.packageCompletionTokens)} Token`} />
            <DataRow
              label={t('Package price')}
              value={t('{{amount}} card hours', { amount: formatCardHours(product.packagePriceCardHours) })}
            />
          </Stack>
        ) : (
          <Stack gap={4}>
            <DataRow label={t('Specification')} value={`${product.gpuModel || '-'} ${product.gpuMemoryGb || '-'}GB`} />
            <DataRow label={t('Package resources')} value={t('{{count}} GPUs', { count: product.gpuCount || 0 })} />
            <DataRow
              label={t('Usage duration')}
              value={t('{{hours}} hours', { hours: product.packageDurationHours || 0 })}
            />
            <DataRow
              label={t('Package price')}
              value={t('{{amount}} card hours', { amount: formatCardHours(product.packagePriceCardHours) })}
            />
            <DataRow
              label={t('Delivery commitment')}
              value={t('within {{value}} after payment', {
                value: t('{{hours}} hours', { hours: product.deliveryDeadlineHours || 0 }),
              })}
            />
          </Stack>
        )}
        <Text size="xs" c="chatbox-tertiary">
          {t('Supplier: {{name}}', { name: product.supplierName || t('KOD Official') })} ·{' '}
          {product.slaDescription || t('SLA TBD')}
        </Text>
        {Boolean(product.isTest) && (
          <Badge color="orange" variant="light">
            {t('Internal test only, not real resources')}
          </Badge>
        )}
        {product.productType === 'API' && !product.upstreamKeyId && (
          <Alert color="orange">
            {t('The admin has not configured the relay station upstream yet. Currently not purchasable.')}
          </Alert>
        )}
        <Button
          mt="auto"
          disabled={!isLoggedIn || (product.productType === 'API' && !product.upstreamKeyId)}
          loading={busy === actionKey}
          onClick={() =>
            product.productType === 'API'
              ? runCardHourAction(
                  actionKey,
                  (autoTopUp) => activateComputeApi(product.id, autoTopUp),
                  t('{{name}} package purchased successfully', { name: product.name })
                )
              : onReserve()
          }
        >
          {!isLoggedIn
            ? t('Log in to operate')
            : product.productType === 'API'
              ? t('Buy package with card hours')
              : t('Buy GPU package')}
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
  const { t } = useTranslation()
  const [buyerPublicKey, setBuyerPublicKey] = useState('')
  if (!product) return null
  const key = `reserve-${product.id}`
  return (
    <Modal opened onClose={onClose} title={t('Buy {{name}}', { name: product.name })} centered size="lg">
      <Stack>
        <Alert color="blue" title={t('Escrow transaction')}>
          {t(
            'This order freezes {{amount}}. The supplier will deliver {{gpuCount}} GPUs for {{hours}} within {{deadline}} after payment; the platform never logs into or controls supplier servers.',
            {
              amount: t('{{amount}} card hours', { amount: formatCardHours(product.packagePriceCardHours) }),
              gpuCount: product.gpuCount || 0,
              hours: t('{{hours}} hours', { hours: product.packageDurationHours || 0 }),
              deadline: t('{{hours}} hours', { hours: product.deliveryDeadlineHours || 0 }),
            }
          )}
        </Alert>
        <Textarea
          label={t('Your SSH public key')}
          description={t(
            'Paste the full single line of your .pub file, e.g. ssh-ed25519 AAAA…; the private key must stay on your computer and must never be uploaded.'
          )}
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
              t('GPU package purchased. Card hours are frozen and awaiting supplier delivery')
            ).then((succeeded) => succeeded && onClose())
          }
        >
          {t('Confirm purchase and freeze card hours')}
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
  const { t } = useTranslation()
  const ledgerQuery = useQuery({ queryKey: ['compute', 'ledger'], queryFn: listComputeLedger })
  const packagesQuery = useQuery({ queryKey: ['compute', 'package-purchases'], queryFn: listComputePackagePurchases })
  const usageQuery = useQuery({ queryKey: ['compute', 'api-usage'], queryFn: listComputeApiUsage })
  const withdrawalsQuery = useQuery({ queryKey: ['compute', 'withdrawals'], queryFn: listComputeWithdrawals })
  const referralQuery = useQuery({ queryKey: ['compute', 'referrals', 'me'], queryFn: getComputeReferralProfile })
  const referralRewardsQuery = useQuery({
    queryKey: ['compute', 'referrals', 'rewards'],
    queryFn: listComputeReferralRewards,
  })
  const buyerRentalsQuery = useQuery({
    queryKey: ['compute', 'reservations', 'buyer'],
    queryFn: () => listComputeReservations('buyer'),
  })
  const supplierRentalsQuery = useQuery({
    queryKey: ['compute', 'reservations', 'supplier'],
    queryFn: () => listComputeReservations('supplier'),
  })
  const [amount, setAmount] = useState(10)
  const [withdrawalAmount, setWithdrawalAmount] = useState(0.1)
  const estimated = amount * (account?.cardHourCnyRate || 1.002)
  const withdrawalCny = withdrawalAmount * (account?.cardHourRedeemRate || 1)

  return (
    <Stack gap="md">
      <AssetDashboard account={account} referral={referralQuery.data} onOpen={onOpen} />

      <Alert color="blue" title={t('Official website top-up and this client share the same RMB wallet')}>
        <Flex justify="space-between" align="center" gap="md" wrap="wrap">
          <Text size="sm">
            {t(
              'After topping up on the official website, return to the client and it refreshes automatically when the window regains focus; you can also tap "Refresh official balance" at the top.'
            )}
          </Text>
          <Button
            size="xs"
            variant="light"
            onClick={() => void platform.openLink('https://kod.kai.com/console/wallet')}
          >
            {t('Go to official website to top up')}
          </Button>
        </Flex>
      </Alert>

      <Alert color="orange" title={t('"Card hour buyback" refers only to internal wallet exchange')}>
        {t(
          'Card hours are transferred into the KOD RMB wallet directly at 1 card hour = ¥{{rate}}; no bank card, Alipay or other third-party payout is made. Frozen card hours cannot be exchanged.',
          { rate: formatNumber(account?.cardHourRedeemRate || 1, 4) }
        )}
      </Alert>

      <Tabs defaultValue="exchange" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="exchange">{t('Asset exchange')}</Tabs.Tab>
          <Tabs.Tab value="rentals">{t('Rental orders')}</Tabs.Tab>
          <Tabs.Tab value="buybacks">{t('Buyback records')}</Tabs.Tab>
          <Tabs.Tab value="rewards">{t('Referral commission details')}</Tabs.Tab>
          <Tabs.Tab value="packages">{t('Token package')}</Tabs.Tab>
          <Tabs.Tab value="ledger">{t('Asset ledger')}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="exchange" pt="md">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
            <Paper withBorder p="md" radius="md">
              <Stack>
                <Title order={5}>{t('Buy card hours with RMB wallet')}</Title>
                <NumberInput
                  label={t('Buy card hours')}
                  description={t('At least 0.1, in multiples of 0.1')}
                  min={0.1}
                  step={0.1}
                  decimalScale={1}
                  value={amount}
                  onChange={(value) => setAmount(Number(value) || 0)}
                />
                <Text size="sm">
                  {t('Estimated deduction: ')}
                  <b>¥{formatNumber(estimated, 4)}</b>
                </Text>
                <Button
                  loading={busy === 'purchase'}
                  onClick={() =>
                    run(
                      'purchase',
                      () => purchaseCardHours(amount),
                      t('Purchased {{amount}}', { amount: t('{{amount}} card hours', { amount: amount.toFixed(1) }) })
                    )
                  }
                >
                  {t('Buy with RMB balance')}
                </Button>
              </Stack>
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Stack>
                <Title order={5}>{t('Platform card hour buyback')}</Title>
                <NumberInput
                  label={t('Exchange card hours')}
                  description={t('Currently exchangeable: {{amount}}', {
                    amount: t('{{amount}} card hours', { amount: formatCardHours(account?.withdrawableCardHours) }),
                  })}
                  min={0.1}
                  step={0.1}
                  decimalScale={1}
                  value={withdrawalAmount}
                  onChange={(value) => setWithdrawalAmount(Number(value) || 0)}
                />
                <Text size="sm">
                  {t('Estimated credit to KOD wallet: ')}
                  <b>¥{formatNumber(withdrawalCny, 4)}</b>
                </Text>
                <Button
                  color="teal"
                  loading={busy === 'withdrawal'}
                  disabled={withdrawalAmount < 0.1 || withdrawalAmount > Number(account?.withdrawableCardHours || 0)}
                  onClick={() =>
                    run(
                      'withdrawal',
                      () => withdrawComputeCardHours(withdrawalAmount),
                      t('{{amount}} bought back and transferred to the KOD RMB wallet', {
                        amount: t('{{amount}} card hours', { amount: withdrawalAmount.toFixed(1) }),
                      })
                    )
                  }
                >
                  {t('Confirm buyback and credit directly')}
                </Button>
              </Stack>
            </Paper>
          </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel value="rentals" pt="md">
          <RentalAssetsTable
            buyerEntries={buyerRentalsQuery.data || []}
            supplierEntries={supplierRentalsQuery.data || []}
          />
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
            <Section title={t('Model API token billing')}>
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
  const { t } = useTranslation()
  const ordersQuery = useQuery({ queryKey: ['compute', 'orders'], queryFn: listComputeOrders })
  const packagesQuery = useQuery({ queryKey: ['compute', 'package-purchases'], queryFn: listComputePackagePurchases })
  return (
    <Stack>
      <Alert color="blue">
        {t(
          'Purchase records keep orders and charges; find API addresses and package keys under "My Assets → Token Packages".'
        )}
      </Alert>
      <Section title={t('Token package purchase records')}>
        <SimpleTable
          columns={[
            t('Order number'),
            t('Package'),
            t('Target model'),
            t('Input remaining / total'),
            t('Output remaining / total'),
            t('Paid card hours'),
            t('Time'),
          ]}
          rows={(packagesQuery.data || []).map((item) => [
            item.orderNo,
            item.productName,
            item.modelId,
            `${formatTokens(item.promptTokensRemaining)} / ${formatTokens(item.promptTokensTotal)}`,
            `${formatTokens(item.completionTokensRemaining)} / ${formatTokens(item.completionTokensTotal)}`,
            formatCardHours(item.priceCardHours),
            formatDate(item.createTime),
          ])}
          empty={t('No token package purchase records')}
        />
      </Section>
      <Section title={t('All purchase history')}>
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
  const { t } = useTranslation()
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
    <Section title={t('Token package delivery and balance (valid forever)')}>
      <Alert color="blue" mb="md">
        {t(
          'Package keys are only for external tools to call the KOD platform proxy; the built-in chat and image generation still use your manually selected relay station/node and official RMB balance.'
        )}
      </Alert>
      {purchases.length === 0 ? (
        <Text c="chatbox-tertiary">{t('No model token package purchased yet')}</Text>
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
                      <Text size="sm">{t('Target model: {{model}}', { model: item.modelId })}</Text>
                      <Text size="xs" c="chatbox-tertiary">
                        {t('Order {{no}}', { no: item.orderNo })} · {formatDate(item.createTime)}
                      </Text>
                    </Box>
                    <Text fw={700}>{t('{{amount}} card hours', { amount: formatCardHours(item.priceCardHours) })}</Text>
                  </Flex>
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <Metric
                      label={t('Input tokens remaining / total')}
                      value={`${formatTokens(item.promptTokensRemaining)} / ${formatTokens(item.promptTokensTotal)}`}
                    />
                    <Metric
                      label={t('Output tokens remaining / total')}
                      value={`${formatTokens(item.completionTokensRemaining)} / ${formatTokens(item.completionTokensTotal)}`}
                    />
                  </SimpleGrid>
                  {item.suspendedReason && (
                    <Alert color="red">{t('Suspension reason: {{reason}}', { reason: item.suspendedReason })}</Alert>
                  )}
                  <TextInput
                    label="Base URL"
                    readOnly
                    value={item.baseUrl}
                    rightSection={
                      <ActionIcon
                        variant="subtle"
                        aria-label={t('Copy Base URL')}
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
                        aria-label={t('Copy API Key')}
                        disabled={!credential}
                        onClick={() => credential && copyToClipboard(credential.apiKey)}
                      >
                        <IconCopy size={17} />
                      </ActionIcon>
                    }
                  />
                  <Text size="sm">
                    {t('API format: {{format}}; auth field:', { format: item.apiFormat })}{' '}
                    <code>{item.authenticationHeader}</code>
                  </Text>
                  <Text size="sm">{t('Available endpoints: {{list}}', { list: item.endpoints.join(', ') })}</Text>
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
                      {credential ? t('Hide API Key') : t('Show API Key')}
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color="orange"
                      loading={busy === `regenerate-package-${item.id}`}
                      onClick={() => {
                        if (
                          !window.confirm(
                            String(
                              t(
                                'After regeneration the old key becomes invalid immediately; the remaining token quota stays unchanged. Continue?'
                              )
                            )
                          )
                        )
                          return
                        void run(
                          `regenerate-package-${item.id}`,
                          async () => {
                            const next = await regenerateComputePackageKey(item.id)
                            setCredentials((current) => ({ ...current, [item.id]: next }))
                          },
                          t('Package API key regenerated')
                        )
                      }}
                    >
                      {t('Regenerate key')}
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

function RentalAssetsTable({
  buyerEntries,
  supplierEntries,
}: {
  buyerEntries: ComputeReservation[]
  supplierEntries: ComputeReservation[]
}) {
  const { t } = useTranslation()
  const rows = [
    ...supplierEntries.map((item) => ({ ...item, directionLabel: t('I rent out') })),
    ...buyerEntries.map((item) => ({ ...item, directionLabel: t('I buy') })),
  ].sort((a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime())
  return (
    <SimpleTable
      columns={[
        t('Direction'),
        t('GPU product'),
        t('Specification'),
        t('Transaction status'),
        t('Card hours'),
        t('Usage time'),
      ]}
      rows={rows.map((item) => [
        item.directionLabel,
        item.productName,
        `${item.gpuModel} × ${item.gpuCount}`,
        statusLabel(t, item.status),
        formatCardHours(item.frozenCardHours),
        item.deliveredAt
          ? t('{{start}} to {{end}}', { start: formatDate(item.startTime), end: formatDate(item.endTime) })
          : t('Awaiting supplier delivery'),
      ])}
      empty={t('No GPU rental orders')}
    />
  )
}

function ReferralRewardsTable({ entries }: { entries: ComputeReferralReward[] }) {
  const { t } = useTranslation()
  const rewardStatus: Record<ComputeReferralReward['status'], string> = {
    WAITING: t('7-day confirmation period'),
    PAID: t('Received'),
    CANCELLED: t('Cancelled'),
  }
  return (
    <SimpleTable
      columns={[
        t('Invitee'),
        t('First top-up'),
        t('Commission rate'),
        t('Commission amount'),
        t('Status'),
        t('Estimated / actual arrival time'),
      ]}
      rows={entries.map((item) => [
        item.inviteeEmail,
        `¥${formatNumber(item.rechargeAmount, 4)}`,
        `${formatNumber(item.rewardRate * 100, 2)}%`,
        `¥${formatNumber(item.rewardAmount, 4)}`,
        item.cancelReason ? `${rewardStatus[item.status]}：${item.cancelReason}` : rewardStatus[item.status],
        formatDate(item.paidAt || item.releaseAt),
      ])}
      empty={t('No referral commission records')}
    />
  )
}

function WithdrawalTable({ entries }: { entries: ComputeWithdrawal[] }) {
  const { t } = useTranslation()
  return (
    <SimpleTable
      columns={[
        t('Buyback number'),
        t('Buyback card hours'),
        t('RMB received'),
        t('Destination'),
        t('Status'),
        t('Time'),
      ]}
      rows={entries.map((item) => [
        item.withdrawalNo,
        formatCardHours(item.cardHours),
        `¥${formatNumber(item.cnyAmount, 4)}`,
        t('KOD internal RMB wallet'),
        statusLabel(t, item.status),
        formatDate(item.completedAt || item.createTime),
      ])}
      empty={t('No card hour buyback records')}
    />
  )
}

function ReservationsPanel({ busy, run }: { busy: string | null; run: RunAction }) {
  const { t } = useTranslation()
  const reservationsQuery = useQuery({
    queryKey: ['compute', 'reservations', 'buyer'],
    queryFn: () => listComputeReservations('buyer'),
  })
  const reservations = reservationsQuery.data || []
  return (
    <Stack>
      <Alert color="blue" title={t('Card hour escrow rules')}>
        {t(
          'All card hours are frozen on purchase; after the supplier marks delivery, the buyer can confirm receipt or raise a dispute within 24 hours. Without a dispute, it auto-confirms and settles all card hours to the supplier at once.'
        )}
      </Alert>
      {reservations.length === 0 ? (
        <EmptyState
          title={t('No GPU orders')}
          description={t('Please choose a fixed GPU package published by a supplier from the Compute Marketplace.')}
        />
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
  productPackageDurationHours,
}: {
  reservation: ComputeReservation
  busy: string | null
  run: RunAction
  view: 'buyer' | 'supplier'
  productPackageDurationHours?: number | null
}) {
  const { t } = useTranslation()
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
  const cancellable = marketplace && reservation.status === 'PENDING_DELIVERY'
  const packageDurationHours = resolvePackageDurationHours(reservation, productPackageDurationHours)
  const actualEnd = addHoursToLocalDateTime(sshDelivery.actualStart, packageDurationHours)
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
              {reservation.gpuModel} × {reservation.gpuCount}
              {marketplace && reservation.deliveredAt
                ? ` · ${t('Agreed usage time {{start}} to {{end}}', { start: formatDate(reservation.startTime), end: formatDate(reservation.endTime) })}`
                : marketplace
                  ? ` · ${t('Delivery deadline {{time}}', { time: formatDate(reservation.deliveryDeadlineAt) })}`
                  : ` · ${t('Historical reservation {{start}} to {{end}}', { start: formatDate(reservation.startTime), end: formatDate(reservation.endTime) })}`}
            </Text>
          </Box>
          <Text fw={700}>{t('{{amount}} card hours', { amount: formatCardHours(reservation.frozenCardHours) })}</Text>
        </Flex>
        {view === 'supplier' && reservation.buyerEmail && (
          <Text size="sm">{t('Buyer: {{email}}', { email: reservation.buyerEmail })}</Text>
        )}
        {reservation.incidentReason && (
          <Alert color="red">
            {t('Exception reason: {{reason}}. Awaiting admin handling.', { reason: reservation.incidentReason })}
          </Alert>
        )}
        {!marketplace && (
          <Alert color="gray">
            {t(
              'These are legacy reservation records kept for viewing only; the legacy credential delivery feature is no longer used.'
            )}
          </Alert>
        )}
        {reservation.deliveryInfo && (
          <Alert color="teal" title={t('Delivery info')}>
            <Text style={{ whiteSpace: 'pre-wrap' }}>{reservation.deliveryInfo}</Text>
            <Text size="xs" mt="xs">
              {t('Delivery time: {{time}}', { time: formatDate(reservation.deliveredAt) })}
              {marketplace && reservation.autoConfirmAt
                ? `；${t('auto-confirm time without dispute: {{time}}', { time: formatDate(reservation.autoConfirmAt) })}`
                : ''}
            </Text>
          </Alert>
        )}
        {view === 'buyer' && marketplace && reservation.status === 'PENDING_DELIVERY' && !reservation.deliveryInfo && (
          <Alert color="yellow">
            {t(
              'Card hours are frozen and waiting for the supplier to configure your public key and submit the SSH address within the promised timeframe.'
            )}
          </Alert>
        )}
        {view === 'buyer' && cancellable && (
          <Button
            variant="light"
            color="red"
            loading={busy === key}
            onClick={() =>
              run(key, () => cancelComputeReservation(reservation.id), t('Order cancelled, card hours fully unfrozen'))
            }
          >
            {t('Cancel order before supplier delivery')}
          </Button>
        )}
        {view === 'buyer' && marketplace && reservation.status === 'DELIVERED' && (
          <Stack gap="xs">
            <Alert color="yellow">
              {t(
                'Verify the resources first. Settlement happens immediately after confirmation; if it cannot connect, the specification mismatches, or the delivery is wrong, submit dispute evidence within 24 hours.'
              )}
            </Alert>
            <Group grow>
              <Button
                loading={busy === `${key}-confirm`}
                onClick={() =>
                  run(
                    `${key}-confirm`,
                    () => confirmComputeReservation(reservation.id),
                    t('Resources confirmed, card hours settled to the supplier')
                  )
                }
              >
                {t('Confirm receipt of resources')}
              </Button>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                label={t('Dispute reason')}
                placeholder={t('e.g. cannot connect, specification mismatch') || undefined}
                value={dispute.reason}
                onChange={(event) => setDispute({ ...dispute, reason: event.target.value })}
              />
              <Textarea
                label={t('Text evidence')}
                placeholder={String(
                  t('Provide verifiable facts such as error messages, test process and agreed content')
                )}
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
                  t('Dispute submitted. Card hours stay frozen and await admin arbitration')
                )
              }
            >
              {t('Raise dispute')}
            </Button>
          </Stack>
        )}
        {view === 'supplier' && marketplace && reservation.status === 'PENDING_DELIVERY' && (
          <Stack gap="xs">
            <Alert color="blue">
              {t(
                'The platform never needs your server password or private key. Configure the buyer public key on the order-specific temporary account, then fill in the connection address and the agreed usage time. Delivery can only be marked when the resource is already connectable; the agreed start time can be at most 15 minutes later than now.'
              )}
            </Alert>
            <Textarea
              label={t('Buyer SSH public key (read-only)')}
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
              {t('Copy buyer public key')}
            </Button>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                label={t('SSH address')}
                value={sshDelivery.host}
                onChange={(event) => setSshDelivery({ ...sshDelivery, host: event.target.value })}
              />
              <NumberInput
                label={t('SSH port')}
                min={1}
                max={65535}
                value={sshDelivery.port}
                onChange={(value) => setSshDelivery({ ...sshDelivery, port: Number(value) || 22 })}
              />
              <TextInput
                label={t('Order-specific temporary username')}
                value={sshDelivery.username}
                onChange={(event) => setSshDelivery({ ...sshDelivery, username: event.target.value })}
              />
              <TextInput
                label={t('Agreed start time')}
                type="datetime-local"
                value={sshDelivery.actualStart}
                onChange={(event) => setSshDelivery({ ...sshDelivery, actualStart: event.target.value })}
              />
              <TextInput
                label={t('Agreed end time')}
                type="datetime-local"
                description={
                  packageDurationHours
                    ? t('Calculated automatically from the {{hours}} package of this order; no manual entry needed', {
                        hours: t('{{hours}} hours', { hours: packageDurationHours }),
                      })
                    : t('Could not read the package duration. Refresh the order and try again')
                }
                value={actualEnd}
                readOnly
              />
            </SimpleGrid>
            <Textarea
              label={t('Delivery notes (passwords or private keys are not allowed)')}
              value={sshDelivery.deliveryNote}
              onChange={(event) => setSshDelivery({ ...sshDelivery, deliveryNote: event.target.value })}
              autosize
              minRows={2}
            />
            <Button
              loading={busy === key}
              disabled={
                !sshDelivery.host.trim() || !sshDelivery.username.trim() || !sshDelivery.actualStart || !actualEnd
              }
              onClick={() =>
                run(
                  key,
                  () =>
                    deliverComputeReservation(reservation.id, {
                      sshHost: sshDelivery.host,
                      sshPort: sshDelivery.port,
                      sshUsername: sshDelivery.username,
                      actualStart: sshDelivery.actualStart,
                      actualEnd,
                      deliveryNote: sshDelivery.deliveryNote,
                    }),
                  t('GPU resources delivered. If no dispute within 24 hours, settlement auto-confirms')
                )
              }
            >
              {t('Mark as delivered')}
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
  const { t } = useTranslation()
  const transfersQuery = useQuery({ queryKey: ['compute', 'transfers'], queryFn: listComputeTransfers })
  const [recipientEmail, setRecipientEmail] = useState('')
  const [amount, setAmount] = useState(1)
  const [transferMessage, setTransferMessage] = useState('')
  const transfers = transfersQuery.data || []
  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Title order={5} mb="sm">
          {t('Transfer card hours free of charge')}
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <TextInput
            label={t('Recipient KOD email')}
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
          />
          <NumberInput
            label={t('Transfer card hours')}
            min={0.001}
            step={0.001}
            decimalScale={3}
            value={amount}
            onChange={(value) => setAmount(Number(value) || 0)}
          />
          <TextInput
            label={t('Message')}
            value={transferMessage}
            onChange={(e) => setTransferMessage(e.target.value)}
          />
        </SimpleGrid>
        <Flex justify="space-between" align="center" mt="md" gap="md" wrap="wrap">
          <Text size="sm" c="chatbox-tertiary">
            {t('{{amount}} available; reaching 1,000 card hours requires admin review.', {
              amount: t('{{amount}} card hours', { amount: formatCardHours(account?.availableCardHours) }),
            })}
          </Text>
          <Button
            loading={busy === 'create-transfer'}
            disabled={!recipientEmail.trim() || amount <= 0}
            onClick={() =>
              runCardHourAction(
                'create-transfer',
                (autoTopUp) =>
                  createComputeTransfer({ recipientEmail, cardHours: amount, message: transferMessage }, autoTopUp),
                t('Transfer created, card hours frozen')
              )
            }
          >
            {t('Create transfer')}
          </Button>
        </Flex>
      </Paper>

      {transfers.length === 0 ? (
        <EmptyState
          title={t('No transfer records')}
          description={t(
            'Transfers are limited to registered KOD users; received card hours can be exchanged to the KOD internal RMB wallet.'
          )}
        />
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
  const { t } = useTranslation()
  const isSender = transfer.senderUserId === currentUserId
  const isRecipient = transfer.recipientUserId === currentUserId
  const key = `transfer-${transfer.id}`
  return (
    <Paper withBorder p="md" radius="md">
      <Flex justify="space-between" align="center" gap="md" wrap="wrap">
        <Box>
          <Group gap="xs">
            <Text fw={600}>{t('{{amount}} card hours', { amount: formatCardHours(transfer.amount) })}</Text>
            <StatusBadge status={transfer.status} />
          </Group>
          <Text size="sm" c="chatbox-tertiary">
            {transfer.senderEmail} → {transfer.recipientEmail} · {formatDate(transfer.createTime)}
          </Text>
          {transfer.message && <Text size="sm">{transfer.message}</Text>}
          {transfer.reviewReason && (
            <Text size="sm" c="red">
              {t('Review notes: {{notes}}', { notes: transfer.reviewReason })}
            </Text>
          )}
        </Box>
        <Group>
          {isRecipient && transfer.status === 'PENDING_RECIPIENT' && (
            <Button
              loading={busy === key}
              onClick={() => run(key, () => acceptComputeTransfer(transfer.id), t('Card hours received'))}
            >
              {t('Accept')}
            </Button>
          )}
          {isSender && ['PENDING_REVIEW', 'PENDING_RECIPIENT'].includes(transfer.status) && (
            <Button
              variant="light"
              color="red"
              loading={busy === key}
              onClick={() =>
                run(key, () => cancelComputeTransfer(transfer.id), t('Transfer withdrawn, card hours unfrozen'))
              }
            >
              {t('Withdraw')}
            </Button>
          )}
        </Group>
      </Flex>
    </Paper>
  )
}

function SupplierPanel({ busy, run }: { busy: string | null; run: RunAction }) {
  const { t } = useTranslation()
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
    nodeName: t('Internal H100 flow-test node'),
    region: t('Pending confirmation'),
    gpuModel: 'H100',
    gpuMemoryGb: 80,
    gpuCount: 1,
    cpuDescription: t('Internal test placeholder data only'),
    ramGb: 0,
    storageGb: 0,
    networkDescription: t('Internal test placeholder data only'),
    resourceProof: null,
  })
  const [productImages, setProductImages] = useState<File[]>([])
  const [gpu, setGpu] = useState({
    nodeId: 0,
    name: t('H100 GPU resource'),
    description: t('Internal H100 fixed package, delivered by the supplier.'),
    region: t('Pending confirmation'),
    gpuModel: 'H100',
    gpuMemoryGb: 80,
    gpuCount: 1,
    packagePriceCardHours: 24,
    packageDurationHours: 24,
    deliveryDeadlineHours: 12,
    deliveryMode: t('Delivered via buyer public key + supplier in-app SSH address'),
    slaDescription: t('Internal test, SLA to be verified'),
  })

  if (!identity || !approvedIdentity) {
    const canSubmit = !identity || ['NONE', 'REJECTED', 'REVOKED'].includes(identity.status)
    return (
      <Stack gap="md">
        <Alert color="orange" title={t('Complete identity verification first')}>
          {t(
            'Supplier onboarding requires manual identity review by an admin. One ID can verify up to five accounts; after rejection or deactivation, sensitive materials are deleted after 30 days.'
          )}
        </Alert>
        {identity && identity.status !== 'NONE' && (
          <Alert color={identity.status === 'PENDING' ? 'yellow' : 'red'}>
            {t('Current status: {{status}}', { status: statusLabel(t, identity.status) })}
            {identity.rejectionReason ? `；${identity.rejectionReason}` : ''}
          </Alert>
        )}
        {canSubmit && (
          <Section title={t('Submit real identity materials')}>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput label={t('Real name')} value={realName} onChange={(e) => setRealName(e.target.value)} />
              <TextInput label={t('ID number')} value={identityNo} onChange={(e) => setIdentityNo(e.target.value)} />
              <FileInput
                label={t('ID card front')}
                accept="image/jpeg,image/png"
                value={identityFront}
                onChange={setIdentityFront}
              />
              <FileInput
                label={t('ID card back')}
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
                    t('Identity verification submitted for review')
                  )
                }}
              >
                {t('Submit real materials')}
              </Button>
              <Button
                color="orange"
                variant="light"
                loading={busy === 'identity-test'}
                onClick={() =>
                  run(
                    'identity-test',
                    createTestComputeIdentity,
                    t('Internal test mock verification submitted for review')
                  )
                }
              >
                {t('Create "internal test, non-real verification" materials')}
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
          <Title order={4}>{t('Apply to become a compute supplier')}</Title>
          <Text c="chatbox-tertiary">
            {t(
              'Identity status: {{status}}. After onboarding is approved, submit GPU hardware info and resource proof; once approved, fixed packages can be published.',
              { status: statusLabel(t, identity.status) }
            )}
          </Text>
          <TextInput label={t('Supplier name')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <TextInput label={t('Contact info')} value={contact} onChange={(e) => setContact(e.target.value)} />
          <Textarea
            label={t('Resources and team description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button
            loading={busy === 'supplier-apply'}
            disabled={!displayName.trim()}
            onClick={() =>
              run(
                'supplier-apply',
                () => applyComputeSupplier({ displayName, contact, description }),
                t('Supplier application submitted')
              )
            }
          >
            {t('Submit application')}
          </Button>
        </Stack>
      </Paper>
    )
  }

  return (
    <Stack gap="md">
      <Alert color={supplier.status === 'APPROVED' ? 'green' : supplier.status === 'REJECTED' ? 'red' : 'yellow'}>
        {t('Supplier status: {{status}}', { status: statusLabel(t, supplier.status) })}
        {supplier.rejectionReason ? `；${t('Reason: {{reason}}', { reason: supplier.rejectionReason })}` : ''}
      </Alert>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <SummaryCard
          icon={<IconDatabaseDollar />}
          label={t('Lifetime card hour income')}
          value={formatCardHours(accountQuery.data?.lifetimeIncome)}
        />
        <SummaryCard icon={<IconServer />} label={t('Hosted nodes')} value={String((nodesQuery.data || []).length)} />
        <SummaryCard
          icon={<IconBuildingStore />}
          label={t('Published products')}
          value={String((productsQuery.data || []).length)}
        />
      </SimpleGrid>

      <Tabs defaultValue="devices" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="devices">{t('Resource qualification')}</Tabs.Tab>
          <Tabs.Tab value="products">{t('Product publishing')}</Tabs.Tab>
          <Tabs.Tab value="orders">{t('Rental orders')}</Tabs.Tab>
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
                    t('Supplier application resubmitted')
                  )
                }
              >
                {t('Modify info and resubmit')}
              </Button>
            )}

            {supplier.status === 'APPROVED' && (
              <Section title={t('Submit GPU resource qualification')}>
                {identity.status === 'TEST_APPROVED' && (
                  <Alert color="orange" mb="sm">
                    {t(
                      'Mock verification can only create and list nodes and products explicitly marked as "internal test only".'
                    )}
                  </Alert>
                )}
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <TextInput
                    label={t('Node name')}
                    value={node.nodeName}
                    onChange={(e) => setNode({ ...node, nodeName: e.target.value })}
                  />
                  <TextInput
                    label={t('Region')}
                    value={node.region}
                    onChange={(e) => setNode({ ...node, region: e.target.value })}
                  />
                  <TextInput
                    label={t('GPU model')}
                    value={node.gpuModel}
                    onChange={(e) => setNode({ ...node, gpuModel: e.target.value })}
                  />
                  <NumberInput
                    label={t('VRAM GB')}
                    min={1}
                    value={node.gpuMemoryGb}
                    onChange={(value) => setNode({ ...node, gpuMemoryGb: Number(value) || 0 })}
                  />
                  <NumberInput
                    label={t('GPU count')}
                    min={1}
                    value={node.gpuCount}
                    onChange={(value) => setNode({ ...node, gpuCount: Number(value) || 0 })}
                  />
                  <TextInput
                    label={t('CPU info')}
                    value={node.cpuDescription}
                    onChange={(e) => setNode({ ...node, cpuDescription: e.target.value })}
                  />
                  <NumberInput
                    label={t('RAM GB')}
                    min={0}
                    value={node.ramGb}
                    onChange={(value) => setNode({ ...node, ramGb: Number(value) || 0 })}
                  />
                  <NumberInput
                    label={t('Storage GB')}
                    min={0}
                    value={node.storageGb}
                    onChange={(value) => setNode({ ...node, storageGb: Number(value) || 0 })}
                  />
                  <TextInput
                    label={t('Network notes')}
                    value={node.networkDescription}
                    onChange={(e) => setNode({ ...node, networkDescription: e.target.value })}
                  />
                  <FileInput
                    label={t('GPU resource proof')}
                    description={t(
                      'Upload screenshots of the device console, nvidia-smi or resource authorization proof; JPG/PNG supported, over 800 KB will be compressed automatically.'
                    )}
                    accept="image/jpeg,image/png"
                    value={node.resourceProof}
                    onChange={(resourceProof) => setNode({ ...node, resourceProof })}
                  />
                </SimpleGrid>
                <Button
                  mt="md"
                  loading={busy === 'supplier-node'}
                  disabled={!node.nodeName.trim() || !node.resourceProof}
                  onClick={() =>
                    run(
                      'supplier-node',
                      () => createSupplierNode(node),
                      t('GPU resource qualification submitted for review')
                    )
                  }
                >
                  {t('Submit resource for review')}
                </Button>
              </Section>
            )}

            <Section title={t('My hosted nodes')}>
              <SimpleTable
                columns={[t('Resource'), t('Specification'), t('Region'), t('Type'), t('Status'), t('Review notes')]}
                rows={(nodesQuery.data || []).map((item) => [
                  item.nodeName,
                  `${item.gpuModel} ${item.gpuMemoryGb}GB × ${item.gpuCount}`,
                  item.region,
                  item.isTest ? t('Internal test only') : t('Official'),
                  statusLabel(t, item.status),
                  item.verificationNote || item.reviewReason || '-',
                ])}
                empty={t('No GPU node submitted yet')}
              />
            </Section>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="products" pt="md">
          <Stack>
            {supplier.status === 'APPROVED' && (
              <Section title={t('Publish a fixed GPU package based on approved resources')}>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <Select
                    label={t('Approved GPU resources')}
                    placeholder={String(t('Select node'))}
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
                    label={t('Product name')}
                    value={gpu.name}
                    onChange={(e) => setGpu({ ...gpu, name: e.target.value })}
                  />
                  <TextInput
                    label={t('Region')}
                    value={gpu.region}
                    onChange={(e) => setGpu({ ...gpu, region: e.target.value })}
                  />
                  <TextInput
                    label={t('GPU model')}
                    value={gpu.gpuModel}
                    onChange={(e) => setGpu({ ...gpu, gpuModel: e.target.value })}
                  />
                  <NumberInput
                    label={t('VRAM GB')}
                    min={1}
                    value={gpu.gpuMemoryGb}
                    onChange={(value) => setGpu({ ...gpu, gpuMemoryGb: Number(value) || 0 })}
                  />
                  <NumberInput
                    label={t('GPU count')}
                    min={1}
                    value={gpu.gpuCount}
                    onChange={(value) => setGpu({ ...gpu, gpuCount: Number(value) || 0 })}
                  />
                  <NumberInput
                    label={t('Fixed package price (card hours)')}
                    min={0.001}
                    step={0.001}
                    decimalScale={3}
                    value={gpu.packagePriceCardHours}
                    onChange={(value) => setGpu({ ...gpu, packagePriceCardHours: Number(value) || 0 })}
                  />
                  <NumberInput
                    label={t('Package duration (hours)')}
                    min={1}
                    value={gpu.packageDurationHours}
                    onChange={(value) => setGpu({ ...gpu, packageDurationHours: Number(value) || 0 })}
                  />
                  <NumberInput
                    label={t('Delivery commitment (hours after payment)')}
                    min={1}
                    value={gpu.deliveryDeadlineHours}
                    onChange={(value) => setGpu({ ...gpu, deliveryDeadlineHours: Number(value) || 0 })}
                  />
                </SimpleGrid>
                <Textarea
                  mt="sm"
                  label={t('Product description')}
                  value={gpu.description}
                  onChange={(e) => setGpu({ ...gpu, description: e.target.value })}
                />
                <SimpleGrid cols={{ base: 1, sm: 2 }} mt="sm">
                  <TextInput
                    label={t('Delivery method')}
                    value={gpu.deliveryMode}
                    onChange={(e) => setGpu({ ...gpu, deliveryMode: e.target.value })}
                  />
                  <TextInput
                    label={t('SLA notes')}
                    value={gpu.slaDescription}
                    onChange={(e) => setGpu({ ...gpu, slaDescription: e.target.value })}
                  />
                  <FileInput
                    label={t('Product images (up to 6)')}
                    description={t('The first image is the marketplace cover; the rest are detail images.')}
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
                      t('GPU fixed package submitted for review')
                    )
                  }
                >
                  {t('Submit product for review')}
                </Button>
              </Section>
            )}

            <Section title={t('My products')}>
              <SimpleTable
                columns={[
                  t('Product'),
                  t('Type'),
                  t('Specification / model'),
                  t('Price'),
                  t('Status'),
                  t('Review notes'),
                ]}
                rows={(productsQuery.data || []).map((product) => [
                  product.name,
                  product.productType,
                  product.productType === 'GPU'
                    ? `${product.gpuModel} ${product.gpuMemoryGb}GB × ${product.gpuCount}`
                    : product.modelId,
                  product.productType === 'GPU'
                    ? product.tradeMode === 'MARKETPLACE_FIXED'
                      ? `${t('{{amount}} card hours', { amount: formatCardHours(product.packagePriceCardHours) })} / ${t('{{hours}} hours', { hours: product.packageDurationHours || 0 })}`
                      : t('Legacy time-slot products (records only)')
                    : t('{{amount}} / million tokens', { amount: formatCardHours(product.promptRatePerMillion) }),
                  statusLabel(t, product.status),
                  product.rejectionReason || '-',
                ])}
                empty={t('No products published yet')}
              />
            </Section>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="orders" pt="md">
          <Section title={t('Pending delivery and historical orders')}>
            <Stack>
              {(reservationsQuery.data || []).length === 0 ? (
                <Text c="chatbox-tertiary">{t('No buyer orders')}</Text>
              ) : (
                (reservationsQuery.data || []).map((reservation) => (
                  <ReservationCard
                    key={reservation.id}
                    reservation={reservation}
                    busy={busy}
                    run={run}
                    view="supplier"
                    productPackageDurationHours={
                      (productsQuery.data || []).find((product) => product.id === reservation.productId)
                        ?.packageDurationHours
                    }
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
  const { t } = useTranslation()
  const query = useQuery({ queryKey: ['compute', 'notifications'], queryFn: listComputeNotifications })
  const notifications = query.data || []
  return (
    <Stack>
      {notifications.length === 0 ? (
        <EmptyState
          title={t('No notifications')}
          description={t('Order, transfer and review status changes will appear here.')}
        />
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
  const { t } = useTranslation()
  const unread = notification.isRead === 0
  const key = `notification-${notification.id}`
  return (
    <Paper withBorder p="md" radius="md" bg={unread ? 'var(--chatbox-background-brand-secondary)' : undefined}>
      <Flex justify="space-between" align="center" gap="md" wrap="wrap">
        <Box>
          <Group gap="xs">
            <Text fw={unread ? 700 : 500}>{notification.title}</Text>
            {unread && <Badge size="xs">{t('Unread')}</Badge>}
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
            onClick={() => run(key, () => markComputeNotificationRead(notification.id), t('Marked as read'))}
          >
            {t('Mark as read')}
          </Button>
        )}
      </Flex>
    </Paper>
  )
}

function AdminPanel({ busy, run }: { busy: string | null; run: RunAction }) {
  const { t } = useTranslation()
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
    name: t('KOD test model API'),
    description: t('Internal test model, use after purchasing a fixed token package.'),
    region: t('KAI company relay station'),
    modelId: '',
    packagePromptTokens: 1000000,
    packageCompletionTokens: 500000,
    packagePriceCardHours: 1,
    slaDescription: t('Internal test pricing and SLA; reconfirm before official use'),
    upstreamStationId: 0,
    upstreamKeyId: 0,
  })
  const [grant, setGrant] = useState({
    recipientEmail: '',
    cardHours: 100,
    expiresAt: '',
    reason: t('Internal MVP test'),
  })

  useEffect(() => {
    const first = upstreamsQuery.data?.[0]
    if (!first || api.upstreamKeyId) return
    setApi((current) => ({ ...current, upstreamStationId: first.stationId, upstreamKeyId: first.keyId }))
  }, [api.upstreamKeyId, upstreamsQuery.data])

  return (
    <Stack gap="md">
      <AdminOverview overview={overviewQuery.data} />
      <Alert color="violet" title={t('What can the admin handle')}>
        {t(
          'Review identity verifications, suppliers, GPU resource proofs and products; maintain product availability; handle buyer disputes submitted within 24 hours after delivery. The platform never logs into or controls supplier servers. Materials and products you submit yourself must be reviewed by another admin.'
        )}
      </Alert>
      <Tabs defaultValue="reviews" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="reviews">{t('Review Center')}</Tabs.Tab>
          <Tabs.Tab value="operations">{t('Resources & disputes')}</Tabs.Tab>
          <Tabs.Tab value="settings">{t('Operations settings')}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="settings" pt="md">
          <Stack>
            <AdminSettings overview={overviewQuery.data} busy={busy} run={run} />

            <Section title={t('Grant test card hours')}>
              <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="sm">
                <TextInput
                  label={t('Recipient email')}
                  value={grant.recipientEmail}
                  onChange={(e) => setGrant({ ...grant, recipientEmail: e.target.value })}
                />
                <NumberInput
                  label={t('Card hours')}
                  min={0.001}
                  decimalScale={3}
                  value={grant.cardHours}
                  onChange={(value) => setGrant({ ...grant, cardHours: Number(value) || 0 })}
                />
                <TextInput
                  label={t('Expiry time (optional)')}
                  type="datetime-local"
                  value={grant.expiresAt}
                  onChange={(e) => setGrant({ ...grant, expiresAt: e.target.value })}
                />
                <TextInput
                  label={t('Reason for granting')}
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
                    t('Test card hours granted')
                  )
                }
              >
                {t('Confirm grant')}
              </Button>
            </Section>

            <Section title={t('Create company model API product')}>
              <Alert color="yellow" mb="sm">
                {t(
                  'The model ID must exactly match model_name in the company relay station usage logs, otherwise it cannot be routed to the card hour ledger.'
                )}
              </Alert>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <TextInput
                  label={t('Product name')}
                  value={api.name}
                  onChange={(e) => setApi({ ...api, name: e.target.value })}
                />
                <TextInput
                  label={t('Relay station model ID')}
                  value={api.modelId}
                  onChange={(e) => setApi({ ...api, modelId: e.target.value })}
                />
                <NumberInput
                  label={t('Package input tokens')}
                  min={1}
                  value={api.packagePromptTokens}
                  onChange={(value) => setApi({ ...api, packagePromptTokens: Number(value) || 0 })}
                />
                <NumberInput
                  label={t('Package output tokens')}
                  min={1}
                  value={api.packageCompletionTokens}
                  onChange={(value) => setApi({ ...api, packageCompletionTokens: Number(value) || 0 })}
                />
                <NumberInput
                  label={t('Package price (card hours)')}
                  min={0.001}
                  step={0.001}
                  decimalScale={3}
                  value={api.packagePriceCardHours}
                  onChange={(value) => setApi({ ...api, packagePriceCardHours: Number(value) || 0 })}
                />
                <Select
                  label={t('Upstream relay station and API key')}
                  description={t('Buyers only see the KOD platform proxy key')}
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
                label={t('Product description')}
                value={api.description}
                onChange={(e) => setApi({ ...api, description: e.target.value })}
              />
              <TextInput
                mt="sm"
                label={t('SLA notes')}
                value={api.slaDescription}
                onChange={(e) => setApi({ ...api, slaDescription: e.target.value })}
              />
              <Button
                mt="md"
                loading={busy === 'admin-api-product'}
                disabled={!api.modelId.trim() || !api.name.trim() || !api.upstreamKeyId}
                onClick={() =>
                  run('admin-api-product', () => createAdminApiProduct(api), t('Model API product listed'))
                }
              >
                {t('Create and list')}
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
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="operations" pt="md">
          <Stack>
            <AdminNodeOperations nodes={nodesQuery.data || []} busy={busy} run={run} />
            <AdminReservationOperations reservations={reservationsQuery.data || []} busy={busy} run={run} />
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
  const { t } = useTranslation()
  const apiProducts = products.filter((item) => item.productType === 'API')
  const [selections, setSelections] = useState<Record<number, string>>({})
  return (
    <Section title={t('Upstream configuration for listed API packages')}>
      <Alert color="blue" mb="md">
        {t(
          'You can add or switch upstream for existing packages. After switching, the KOD package key users already copied stays the same and the real relay station key is never exposed.'
        )}
      </Alert>
      {apiProducts.length === 0 ? (
        <Text c="chatbox-tertiary">{t('No API packages')}</Text>
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
                    {t('Fixed model: {{model}}; ', { model: product.modelId })}
                    {current ? t('Upstream configured') : t('Not configured; users cannot buy or obtain a key')}
                  </Text>
                </Box>
                <Select
                  label={t('Relay station and key')}
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
                      t('API package upstream updated')
                    )
                  }}
                >
                  {t('Save upstream')}
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
  const { t } = useTranslation()
  return (
    <Section title={t('Abnormal package keys ({{count}})', { count: keys.length })}>
      {keys.length === 0 ? (
        <Text c="chatbox-tertiary">{t('No package keys suspended due to usage exceptions')}</Text>
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
                  {t('Model: {{model}}; Key suffix: {{suffix}}; Upstream: {{station}}', {
                    model: item.modelId,
                    suffix: item.accessKeyLast4,
                    station: item.stationUrl || '-',
                  })}
                </Text>
                <Alert color="red">{item.suspendedReason}</Alert>
                <Group justify="flex-end">
                  <Button
                    variant="light"
                    loading={busy === `restore-key-${item.id}`}
                    onClick={() =>
                      run(
                        `restore-key-${item.id}`,
                        () => repairAdminProxyKey(item.id, false),
                        t('Package key restored')
                      )
                    }
                  >
                    {t('Restore original key')}
                  </Button>
                  <Button
                    color="orange"
                    loading={busy === `regenerate-key-${item.id}`}
                    onClick={() =>
                      run(
                        `regenerate-key-${item.id}`,
                        () => repairAdminProxyKey(item.id, true),
                        t('Package key regenerated; users can view it in My Assets')
                      )
                    }
                  >
                    {t('Regenerate and restore')}
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
  const { t } = useTranslation()
  const manageable = nodes.filter((item) => !['PENDING', 'REJECTED'].includes(item.status))
  const [targets, setTargets] = useState<Record<number, string>>({})
  const [reasons, setReasons] = useState<Record<number, string>>({})
  return (
    <Section title={t('Resource availability ({{count}})', { count: manageable.length })}>
      <Alert color="blue" mb="md">
        {t(
          '"Running" means the qualification is valid and new products may be listed; switching to "pending action" or "offline" only pauses new orders and never lets the platform take over or interrupt delivered resources.'
        )}
      </Alert>
      <Stack>
        {manageable.length === 0 ? (
          <Text c="chatbox-tertiary">{t('No approved resources')}</Text>
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
                    label={t('Switch status')}
                    w={190}
                    value={target}
                    data={[
                      { value: 'DEPLOYING', label: t('Deploying') },
                      { value: 'RUNNING', label: t('Running') },
                      { value: 'PENDING_ACTION', label: t('Pending action') },
                      { value: 'OFFLINE', label: t('Offline') },
                    ]}
                    onChange={(value) => setTargets({ ...targets, [item.id]: value || item.status })}
                  />
                  <TextInput
                    label={t('Reason / notes')}
                    placeholder={String(t('Required when pending action or offline'))}
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
                        t('Device status updated')
                      )
                    }
                  >
                    {t('Save status')}
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
  const { t } = useTranslation()
  const actionable = reservations.filter(
    (item) =>
      ['EXCEPTION_PENDING', 'DISPUTED'].includes(item.status) ||
      (['CONFIRMED', 'IN_USE'].includes(item.status) && new Date(item.endTime).getTime() <= Date.now())
  )
  const [resolutions, setResolutions] = useState<Record<number, 'FULL_REFUND' | 'ACTUAL_USAGE' | 'FULL_SETTLEMENT'>>({})
  const [actuals, setActuals] = useState<Record<number, number>>({})
  const [reasons, setReasons] = useState<Record<number, string>>({})
  return (
    <Section
      title={t('Trade disputes and historical compensation settlement ({{count}})', { count: actionable.length })}
    >
      {actionable.length === 0 ? (
        <Text c="chatbox-tertiary">{t('No orders requiring manual handling')}</Text>
      ) : (
        <Stack>
          {actionable.map((item) => {
            const exception = ['EXCEPTION_PENDING', 'DISPUTED'].includes(item.status)
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
                        {t('Buyer {{buyer}} · Supplier {{supplier}} · {{start}} to', {
                          buyer: item.buyerEmail,
                          supplier: item.supplierEmail || '-',
                          start: formatDate(item.startTime),
                        })}{' '}
                        {formatDate(item.endTime)}
                      </Text>
                    </Box>
                    <Text fw={700}>
                      {t('Frozen: {{amount}}', {
                        amount: t('{{amount}} card hours', { amount: formatCardHours(item.frozenCardHours) }),
                      })}
                    </Text>
                  </Flex>
                  {item.incidentReason && (
                    <Alert color="red">{t('Exception reason: {{reason}}', { reason: item.incidentReason })}</Alert>
                  )}
                  {item.disputeEvidence && (
                    <Alert color="orange">
                      {t('Buyer evidence: {{evidence}}', { evidence: item.disputeEvidence })}
                    </Alert>
                  )}
                  {exception ? (
                    <>
                      <SimpleGrid cols={{ base: 1, sm: 3 }}>
                        <Select
                          label={t('Resolution method')}
                          value={resolution}
                          data={[
                            { value: 'FULL_REFUND', label: t('Full refund to buyer') },
                            { value: 'ACTUAL_USAGE', label: t('Partial settlement, rest refunded') },
                            { value: 'FULL_SETTLEMENT', label: t('Normal settlement per original order') },
                          ]}
                          onChange={(value) =>
                            setResolutions({
                              ...resolutions,
                              [item.id]: (value || 'FULL_REFUND') as 'FULL_REFUND' | 'ACTUAL_USAGE' | 'FULL_SETTLEMENT',
                            })
                          }
                        />
                        <NumberInput
                          label={t('Card hours settled to supplier')}
                          disabled={resolution !== 'ACTUAL_USAGE'}
                          min={0.001}
                          max={item.frozenCardHours}
                          decimalScale={3}
                          value={actuals[item.id] || 0}
                          onChange={(value) => setActuals({ ...actuals, [item.id]: Number(value) || 0 })}
                        />
                        <TextInput
                          label={t('Handling reason')}
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
                            t('Abnormal order handled and settled')
                          )
                        }
                      >
                        {t('Confirm and handle')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      loading={busy === `settle-${item.id}`}
                      onClick={() =>
                        run(`settle-${item.id}`, () => settleAdminReservation(item.id), t('Order settled immediately'))
                      }
                    >
                      {t('Settle immediately (scheduled task compensation)')}
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
  const { t } = useTranslation()
  const items = [
    [t('Pending identity reviews'), overview?.identitiesPending || 0],
    [t('Pending supplier reviews'), overview?.suppliersPending || 0],
    [t('Pending GPU resource reviews'), overview?.nodesPending || 0],
    [t('Pending product reviews'), overview?.productsPending || 0],
    [t('Pending action resources'), overview?.nodesPendingAction || 0],
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
  const { t } = useTranslation()
  const [transferReviewThreshold, setTransferReviewThreshold] = useState(1000)

  useEffect(() => {
    if (!overview) return
    setTransferReviewThreshold(Number(overview.transferReviewThreshold))
  }, [overview])

  return (
    <Section title={t('Settlement rules')}>
      <Flex align="end" gap="md" wrap="wrap">
        <NumberInput
          label={t('Large transfer review threshold (card hours)')}
          min={0.001}
          decimalScale={3}
          value={transferReviewThreshold}
          onChange={(value) => setTransferReviewThreshold(Number(value) || 0)}
          w={240}
        />
        <NumberInput
          label={t('Platform commission (fixed in v1)')}
          description={t('Supplier receives all card hours after order confirmation')}
          value={0}
          disabled
          w={220}
        />
        <Button
          loading={busy === 'admin-settings'}
          disabled={transferReviewThreshold <= 0}
          onClick={() =>
            run(
              'admin-settings',
              () =>
                updateComputeAdminSettings({
                  transferReviewThreshold,
                  platformFeeRate: 0,
                }),
              t('Settlement rules updated')
            )
          }
        >
          {t('Save rules')}
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
  const { t } = useTranslation()
  const pending = identities.filter((item) => item.status === 'PENDING')
  const [reasons, setReasons] = useState<Record<number, string>>({})
  const [details, setDetails] = useState<Record<number, ComputeIdentity>>({})
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState<string | null>(null)
  const openDocument = async (identityId: number, side: 'front' | 'back') => {
    const blob = await getAdminIdentityDocument(identityId, side)
    const url = URL.createObjectURL(blob)
    // 移动端 WebView 无法在浏览器新标签打开 blob URL，改用应用内预览
    setDocumentPreviewUrl(url)
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  const review = (item: ComputeIdentity, approved: boolean) => {
    const identityId = item.id
    if (!identityId) return Promise.resolve(false)
    return run(
      `identity-${identityId}`,
      () => reviewAdminIdentity(identityId, approved, approved ? '' : reasons[identityId] || ''),
      approved
        ? item.verificationType === 'TEST'
          ? t('Internal test verification passed')
          : t('Identity verification passed')
        : t('Identity verification rejected')
    )
  }
  return (
    <Section title={t('Identity verification reviews ({{count}})', { count: pending.length })}>
      {pending.length === 0 ? (
        <Text c="chatbox-tertiary">{t('No identity verifications pending review')}</Text>
      ) : (
        <Stack>
          {pending.map((item) => (
            <Paper key={item.id} withBorder p="md" radius="md">
              <Stack gap="xs">
                <Group>
                  <Text fw={600}>{item.email}</Text>
                  <Badge color={item.verificationType === 'TEST' ? 'orange' : 'blue'}>
                    {item.verificationType === 'TEST' ? t('Internal test mock verification') : t('Real verification')}
                  </Badge>
                </Group>
                <Text size="sm">{t('ID number: {{no}}', { no: item.identityNoMasked || '-' })}</Text>
                {item.id && details[item.id] && (
                  <Alert color="yellow">
                    {t('Name: {{name}}; Full ID number: {{no}} (viewable only for this review)', {
                      name: details[item.id].realName,
                      no: details[item.id].identityNo,
                    })}
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
                    {t('View decrypted details')}
                  </Button>
                  <Button size="xs" variant="light" onClick={() => item.id && openDocument(item.id, 'front')}>
                    {t('View front')}
                  </Button>
                  <Button size="xs" variant="light" onClick={() => item.id && openDocument(item.id, 'back')}>
                    {t('View back')}
                  </Button>
                </Group>
                <TextInput
                  placeholder={String(t('A reason is required when rejecting'))}
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
                    {t('Reject')}
                  </Button>
                  <Button loading={busy === `identity-${item.id}`} onClick={() => review(item, true)}>
                    {t('Approve')}
                  </Button>
                </Group>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
      <Modal
        opened={documentPreviewUrl !== null}
        onClose={() => setDocumentPreviewUrl(null)}
        title={t('ID document preview')}
        size="lg"
        centered
      >
        {documentPreviewUrl && (
          <img src={documentPreviewUrl} alt={String(t('ID document'))} style={{ width: '100%' }} />
        )}
      </Modal>
    </Section>
  )
}

function AdminNodeReviews({ nodes, busy, run }: { nodes: ComputeGpuNode[]; busy: string | null; run: RunAction }) {
  const { t } = useTranslation()
  const pending = nodes.filter((item) => item.status === 'PENDING')
  const [reasons, setReasons] = useState<Record<number, string>>({})
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null)
  const openProof = async (nodeId: number) => {
    const blob = await getAdminNodeProof(nodeId)
    const url = URL.createObjectURL(blob)
    // 移动端 WebView 无法在浏览器新标签打开 blob URL，改用应用内预览
    setProofPreviewUrl(url)
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  return (
    <Section title={t('GPU resource proof reviews ({{count}})', { count: pending.length })}>
      {pending.length === 0 ? (
        <Text c="chatbox-tertiary">{t('No GPU resources pending review')}</Text>
      ) : (
        <Stack>
          {pending.map((item) => (
            <Paper key={item.id} withBorder p="md" radius="md">
              <Stack gap="xs">
                <Group>
                  <Text fw={600}>
                    {item.nodeName} · {item.email}
                  </Text>
                  {Boolean(item.isTest) && <Badge color="orange">{t('Internal test only')}</Badge>}
                </Group>
                <Text size="sm">
                  {item.gpuModel} {item.gpuMemoryGb}GB × {item.gpuCount}；{t('CPU')} {item.cpuDescription || '-'}；
                  {t('RAM')} {item.ramGb}GB；{t('Storage')} {item.storageGb}GB
                </Text>
                <Button size="xs" variant="light" w="fit-content" onClick={() => openProof(item.id)}>
                  {t('View resource proof')}
                </Button>
                <TextInput
                  label={t('Qualification review notes')}
                  value={notes[item.id] || ''}
                  onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })}
                />
                <TextInput
                  placeholder={String(t('A reason is required when rejecting'))}
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
                        t('GPU resource qualification rejected')
                      )
                    }
                  >
                    {t('Reject')}
                  </Button>
                  <Button
                    loading={busy === `node-${item.id}`}
                    onClick={() =>
                      run(
                        `node-${item.id}`,
                        () => reviewAdminNode(item.id, true, '', notes[item.id] || ''),
                        t('GPU resource qualification approved, products can be published')
                      )
                    }
                  >
                    {t('Approve')}
                  </Button>
                </Group>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
      <Modal
        opened={proofPreviewUrl !== null}
        onClose={() => setProofPreviewUrl(null)}
        title={t('Resource proof preview')}
        size="lg"
        centered
      >
        {proofPreviewUrl && <img src={proofPreviewUrl} alt={String(t('Resource proof'))} style={{ width: '100%' }} />}
      </Modal>
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
  const { t } = useTranslation()
  const pending = suppliers.filter((supplier) => supplier.status === 'PENDING')
  return (
    <Section title={t('Supplier reviews ({{count}})', { count: pending.length })}>
      <ReviewList
        empty={t('No suppliers pending review')}
        items={pending.map((supplier) => ({
          key: `supplier-${supplier.id}`,
          title: `${supplier.displayName} · ${supplier.email}`,
          description: `${supplier.contact || t('No contact info provided')}；${supplier.description || t('No notes')}`,
          onReview: (approved, reason) =>
            run(
              `admin-supplier-${supplier.id}`,
              () => reviewAdminSupplier(supplier.id || 0, approved, reason),
              approved ? t('Supplier approved') : t('Supplier rejected')
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
  const { t } = useTranslation()
  const pending = products.filter((product) => product.status === 'PENDING')
  return (
    <Section title={t('Product reviews ({{count}})', { count: pending.length })}>
      <ReviewList
        empty={t('No products pending review')}
        items={pending.map((product) => ({
          key: `product-${product.id}`,
          title: `${product.name} · ${product.productType}`,
          description:
            product.productType === 'GPU'
              ? product.tradeMode === 'MARKETPLACE_FIXED'
                ? String(
                    `${product.gpuModel} ${product.gpuMemoryGb}GB × ${product.gpuCount}，${t('{{hours}} hours', { hours: product.packageDurationHours || 0 })}，${t('{{amount}} card hours', { amount: formatCardHours(product.packagePriceCardHours) })}`
                  )
                : String(
                    t('{{model}} {{vram}}GB × {{count}}, legacy product kept as record only', {
                      model: product.gpuModel,
                      vram: product.gpuMemoryGb ?? 0,
                      count: product.gpuCount ?? 0,
                    })
                  )
              : `${product.modelId}`,
          onReview: (approved, reason) =>
            run(
              `admin-product-${product.id}`,
              () => reviewAdminProduct(product.id, approved, reason),
              approved ? t('Product listed') : t('Product rejected')
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
  const { t } = useTranslation()
  return (
    <Section title={t('Large transfer reviews ({{count}})', { count: transfers.length })}>
      <ReviewList
        empty={t('No large transfers pending review')}
        items={transfers.map((transfer) => ({
          key: `transfer-${transfer.id}`,
          title: `${t('{{amount}} card hours', { amount: formatCardHours(transfer.amount) })} · ${transfer.senderEmail} → ${transfer.recipientEmail}`,
          description: transfer.message || t('No message'),
          onReview: (approved, reason) =>
            run(
              `admin-transfer-${transfer.id}`,
              () => reviewAdminTransfer(transfer.id, approved, reason),
              approved ? t('Large transfer approved') : t('Large transfer rejected')
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
  const { t } = useTranslation()
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
              placeholder={String(t('A reason is required when rejecting'))}
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
                {t('Reject')}
              </Button>
              <Button loading={item.loading} onClick={() => item.onReview(true, '')}>
                {t('Approve')}
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
  const { t } = useTranslation()
  return (
    <SimpleTable
      columns={[t('Time'), t('Type'), t('Change'), t('Available balance'), t('Frozen balance'), t('Notes')]}
      rows={entries.map((entry) => [
        formatDate(entry.createTime),
        statusLabel(t, entry.entryType),
        <Text key="amount" c={entry.direction === 'CREDIT' ? 'green' : 'red'}>
          {entry.direction === 'CREDIT' ? '+' : '-'}
          {formatCardHours(entry.amount)}
        </Text>,
        formatCardHours(entry.availableAfter),
        formatCardHours(entry.frozenAfter),
        entry.description,
      ])}
      empty={t('No card hour ledger entries')}
    />
  )
}

function ApiUsageTable({ entries }: { entries: ComputeApiUsage[] }) {
  const { t } = useTranslation()
  return (
    <SimpleTable
      columns={[
        t('Time'),
        t('Model'),
        t('Input (deducted / granted)'),
        t('Output (deducted / granted)'),
        t('Status / exception'),
      ]}
      rows={entries.map((entry) => [
        formatDate(entry.createTime),
        entry.modelId,
        `${formatTokens(entry.deductedPromptTokens)} / ${formatTokens(entry.giftedPromptTokens)}`,
        `${formatTokens(entry.deductedCompletionTokens)} / ${formatTokens(entry.giftedCompletionTokens)}`,
        entry.errorMessage ? `${statusLabel(t, entry.status)}：${entry.errorMessage}` : statusLabel(t, entry.status),
      ])}
      empty={t('No model API token usage yet')}
    />
  )
}

function OrdersTable({ orders }: { orders: ComputeOrder[] }) {
  const { t } = useTranslation()
  return (
    <SimpleTable
      columns={[t('Time'), t('Order number'), t('Type'), t('Product'), t('Card hours'), t('RMB'), t('Status')]}
      rows={orders.map((order) => [
        formatDate(order.createTime),
        order.orderNo,
        statusLabel(t, order.orderType),
        order.productName || '-',
        formatCardHours(order.cardHours),
        `¥${formatNumber(order.cnyAmount, 4)}`,
        statusLabel(t, order.status),
      ])}
      empty={t('No orders')}
    />
  )
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
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
      {statusLabel(t, status)}
    </Badge>
  )
}

function statusLabels(t: (key: string) => string): Record<string, string> {
  return {
    NONE: t('Not applied'),
    PENDING: t('Pending review'),
    APPROVED: t('Approved'),
    TEST_APPROVED: t('Internal test verification passed'),
    REVOKED: t('Deactivated'),
    SUSPENDED: t('Suspended'),
    CONFIG_REQUIRED: t('Upstream pending configuration'),
    OFFLINE: t('Offline / unlisted'),
    DEPLOYING: t('Deploying'),
    RUNNING: t('Running'),
    PENDING_ACTION: t('Pending action'),
    PAUSED: t('Acceptance suspended'),
    PUBLISHED: t('Listed'),
    REJECTED: t('Rejected'),
    ACTIVE: t('In use'),
    COMPLETED: t('Completed'),
    CANCELLED: t('Cancelled'),
    EXPIRED: t('Expired'),
    PENDING_REVIEW: t('Awaiting admin review'),
    PENDING_RECIPIENT: t('Awaiting recipient confirmation'),
    PENDING_DELIVERY: t('Awaiting supplier delivery'),
    DELIVERED: t('Delivered, awaiting buyer confirmation'),
    DISPUTED: t('Dispute in progress'),
    CONFIRMED: t('Confirmed'),
    IN_USE: t('In use'),
    EXCEPTION_PENDING: t('Exception pending action'),
    REFUNDED: t('Refunded'),
    FROZEN: t('Frozen'),
    CARD_HOUR_PURCHASE: t('Buy card hours'),
    API_ACTIVATION: t('Enable API'),
    API_PACKAGE: t('Token package'),
    API_PACKAGE_PURCHASE: t('Buy token package'),
    GPU_RESERVATION: t('GPU reservation'),
    GPU_MARKETPLACE: t('GPU fixed package'),
    PURCHASE: t('Buy'),
    ADMIN_GRANT: t('Admin grant'),
    API_USAGE: t('API consumption'),
    PAID: t('Deducted from package'),
    GIFTED_OVERAGE: t('Quota exhausted, excess granted'),
    NO_PACKAGE: t('No package, RMB not charged'),
    PARTIAL: t('Partial quota exhausted'),
    EXHAUSTED: t('Exhausted'),
    USAGE_MISSING: t('Usage exception'),
    UPSTREAM_ERROR: t('Upstream error'),
    SUPPLIER_INCOME: t('Supplier income'),
    GPU_RENTAL_INCOME: t('GPU rental income'),
    API_SALES_INCOME: t('Token package sales income'),
    WITHDRAWAL: t('Withdraw to internal wallet'),
    GPU_SETTLEMENT: t('GPU order settlement'),
    GPU_REFUND: t('GPU order refund'),
    AUTO_SETTLEMENT: t('Auto settlement'),
    AUTO_CONFIRM_24H: t('Auto-confirm after 24 hours without dispute'),
    BUYER_CONFIRMED: t('Buyer confirms receipt'),
    FULL_REFUND: t('Full refund'),
    ACTUAL_USAGE: t('Settled by actual usage'),
    FULL_SETTLEMENT: t('Settled per original order'),
    TRANSFER_IN: t('Incoming transfer'),
    TRANSFER_OUT: t('Outgoing transfer'),
    FREEZE: t('Frozen'),
    UNFREEZE: t('Unfrozen'),
    CONSUME_FROZEN: t('Frozen settlement'),
    EXPIRE: t('Expired'),
  }
}

function statusLabel(t: (key: string) => string, status?: string | null) {
  if (!status) return '-'
  return statusLabels(t)[status] || status
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
