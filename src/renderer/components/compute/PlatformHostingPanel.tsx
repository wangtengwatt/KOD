import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { computeKeys, getWalletIdentity } from '@/hooks/useWallet'
import {
  getComputeAccount,
  getPlatformLeaseDetails,
  listPlatformServerLeases,
  listPlatformServerSkus,
  type PlatformLeaseDetails,
  type PlatformLeaseIncomeEvent,
  type PlatformServerLease,
  type PlatformServerSku,
  rentPlatformServer,
  setLeaseAutoRenew,
} from '@/packages/computeCenter'
import { useAuthInfoStore } from '@/stores/authInfoStore'

const PLATFORM_SKUS_QUERY_KEY = ['compute', 'platform-hosting', 'skus'] as const
const RENT_REQUEST_STORAGE_PREFIX = 'compute.platform-hosting.rent-request.'
const pendingRentRequestIds = new Map<string, string>()

export function PlatformHostingPanel() {
  const queryClient = useQueryClient()
  const accessToken = useAuthInfoStore((state) => state.accessToken)
  const refreshToken = useAuthInfoStore((state) => state.refreshToken)
  const accountId = useAuthInfoStore((state) => state.accountId)
  const loginEmail = useAuthInfoStore((state) => state.loginEmail)
  const queryIdentity = getWalletIdentity(accountId, loginEmail, accessToken, refreshToken) ?? 'signed-out'
  const platformLeasesQueryKey = computeKeys.platformLeases(queryIdentity)
  const accountQueryKey = computeKeys.account(queryIdentity)
  const [checkout, setCheckout] = useState<{
    sku: PlatformServerSku
    requestId: string
    userId: string
    identity: string
  } | null>(null)
  const [rentError, setRentError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ color: 'green' | 'red'; text: string } | null>(null)
  const previousIdentityRef = useRef(queryIdentity)
  const currentIdentityRef = useRef(queryIdentity)
  currentIdentityRef.current = queryIdentity

  useEffect(() => {
    if (previousIdentityRef.current === queryIdentity) return
    previousIdentityRef.current = queryIdentity
    setCheckout(null)
    setRentError(null)
    setFeedback(null)
  }, [queryIdentity])
  const skusQuery = useQuery({
    queryKey: PLATFORM_SKUS_QUERY_KEY,
    queryFn: listPlatformServerSkus,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  })
  const leasesQuery = useQuery({
    queryKey: platformLeasesQueryKey,
    queryFn: listPlatformServerLeases,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  })
  const accountQuery = useQuery({ queryKey: accountQueryKey, queryFn: getComputeAccount })

  const refreshAfterRent = async (lease: PlatformServerLease) => {
    queryClient.setQueryData<PlatformServerLease[]>(platformLeasesQueryKey, (current = []) =>
      upsertLease(current, lease)
    )
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: accountQueryKey }),
      queryClient.invalidateQueries({ queryKey: computeKeys.legacyAccount }),
      queryClient.invalidateQueries({ queryKey: PLATFORM_SKUS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ['compute', queryIdentity, 'supplier-hosting'] }),
      queryClient.invalidateQueries({ queryKey: ['compute', queryIdentity, 'supplier-nodes'] }),
      queryClient.invalidateQueries({ queryKey: ['compute', queryIdentity, 'supplier-products'] }),
      queryClient.invalidateQueries({ queryKey: ['compute', queryIdentity, 'products'] }),
    ])
  }

  const rentMutation = useMutation({
    mutationFn: ({ skuId, requestId }: { skuId: string; requestId: string; userId: string; identity: string }) =>
      rentPlatformServer(skuId, requestId),
    onMutate: () => setRentError(null),
    onSuccess: async (createdLease, variables) => {
      if (currentIdentityRef.current !== variables.identity) {
        clearRentRequestId(variables.userId, variables.skuId)
        return
      }
      await refreshAfterRent(createdLease)
      clearRentRequestId(variables.userId, variables.skuId)
      if (currentIdentityRef.current !== variables.identity) return
      setCheckout(null)
      setFeedback({ color: 'green', text: '月租成功，服务器已按平台统一价格上架' })
    },
    onError: async (error, variables) => {
      if (currentIdentityRef.current !== variables.identity) return
      let recoveredLease: PlatformServerLease | undefined
      try {
        const serverLeases = await queryClient.fetchQuery({
          queryKey: platformLeasesQueryKey,
          queryFn: listPlatformServerLeases,
          staleTime: 0,
        })
        recoveredLease = serverLeases.find(
          (lease) => lease.requestId === variables.requestId && lease.skuId === variables.skuId
        )
      } catch {
        // Preserve the original mutation error when reconciliation is also unavailable.
      }
      if (currentIdentityRef.current !== variables.identity) return
      if (recoveredLease) {
        await refreshAfterRent(recoveredLease)
        clearRentRequestId(variables.userId, variables.skuId)
        if (currentIdentityRef.current !== variables.identity) return
        setCheckout(null)
        setFeedback({ color: 'green', text: '月租结果已从服务端确认，服务器已按平台统一价格上架' })
        return
      }
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: accountQueryKey }),
        queryClient.invalidateQueries({ queryKey: computeKeys.legacyAccount }),
        queryClient.invalidateQueries({ queryKey: PLATFORM_SKUS_QUERY_KEY }),
      ])
      if (currentIdentityRef.current !== variables.identity) return
      setRentError(errorMessage(error))
    },
  })

  const renewMutation = useMutation({
    mutationFn: ({ leaseId, enabled }: { leaseId: string; enabled: boolean; identity: string }) =>
      setLeaseAutoRenew(leaseId, enabled),
    onSuccess: (updatedLease, variables) => {
      if (currentIdentityRef.current !== variables.identity) return
      queryClient.setQueryData<PlatformServerLease[]>(platformLeasesQueryKey, (current = []) =>
        upsertLease(current, updatedLease)
      )
      setFeedback({ color: 'green', text: updatedLease.autoRenew ? '已开启下期自动续租' : '已关闭下期自动续租' })
    },
    onError: (error, variables) => {
      if (currentIdentityRef.current === variables.identity) {
        setFeedback({ color: 'red', text: errorMessage(error) })
      }
    },
  })

  const loadError = skusQuery.error || leasesQuery.error || accountQuery.error
  const accountUserId = accountQuery.data?.userId
  const redeemableBalance = accountQuery.data?.withdrawableCardHours
  const skus = skusQuery.data || []
  const leases = leasesQuery.data || []

  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Title order={4}>卡时托管</Title>
        <Text size="sm" c="dimmed" mt={4}>
          月租平台服务器后自动按平台统一售价上架；仅可回购卡时可支付月租，奖励卡时不能用于月租。
        </Text>
        <Text size="sm" fw={600} mt="xs">
          可回购卡时余额 {formatCardHours(redeemableBalance)}
        </Text>
      </Paper>

      {loadError && (
        <Alert color="red" title="卡时托管加载失败">
          {errorMessage(loadError)}
        </Alert>
      )}
      {feedback && <Alert color={feedback.color}>{feedback.text}</Alert>}

      <Stack gap="sm">
        <Title order={5}>平台服务器库存</Title>
        {skusQuery.isLoading ? (
          <Text c="dimmed">正在加载平台服务器…</Text>
        ) : skus.length === 0 ? (
          <Text c="dimmed">暂无可租用的平台服务器。</Text>
        ) : (
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {skus.map((sku) => (
              <Card key={sku.id} withBorder padding="md" radius="md">
                <Stack gap="xs">
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text fw={700}>{sku.name}</Text>
                      <Text size="sm" c="dimmed">
                        {sku.description}
                      </Text>
                    </div>
                    <Badge color={sku.availableInventory > 0 ? 'green' : 'gray'}>
                      库存 {sku.availableInventory} / {sku.totalInventory}
                    </Badge>
                  </Group>
                  <Group gap="xs">
                    <Badge variant="light">{sku.region}</Badge>
                    <Text size="sm">
                      {sku.gpuModel} × {sku.gpuCount} · {sku.gpuMemoryGb}GB
                    </Text>
                  </Group>
                  <Text size="sm">
                    {sku.cpuDescription} · 内存 {sku.ramGb}GB · 存储 {sku.storageGb}GB · {sku.networkDescription}
                  </Text>
                  <Text fw={700}>月租 {sku.monthlyRent} 卡时</Text>
                  <Text size="sm">
                    平台统一销售价 {sku.platformSalePrice} 卡时 / {sku.packageDurationHours} 小时
                  </Text>
                  <Text size="xs" c="dimmed">
                    售价与交付规则由平台统一管理，用户不可修改。
                  </Text>
                  <Button
                    disabled={sku.availableInventory <= 0 || accountUserId === undefined}
                    loading={rentMutation.isPending && checkout?.sku.id === sku.id}
                    onClick={() => {
                      setFeedback(null)
                      setRentError(null)
                      if (accountUserId === undefined) return
                      setCheckout({
                        sku,
                        requestId: rentRequestId(accountUserId, sku.id),
                        userId: accountUserId,
                        identity: queryIdentity,
                      })
                    }}
                  >
                    {sku.availableInventory <= 0 ? '已售罄' : '租用一个月'}
                  </Button>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        )}
      </Stack>

      <Stack gap="sm">
        <Title order={5}>我的平台租约</Title>
        {leasesQuery.isLoading ? (
          <Text c="dimmed">正在加载租约…</Text>
        ) : leases.length === 0 ? (
          <Text c="dimmed">尚无平台服务器租约。</Text>
        ) : (
          leases.map((lease) => (
            <LeaseCard
              key={`${queryIdentity}:${lease.id}`}
              lease={lease}
              sku={skus.find((candidate) => candidate.id === lease.skuId)}
              queryIdentity={queryIdentity}
              changing={renewMutation.isPending && renewMutation.variables?.leaseId === lease.id}
              onAutoRenew={(enabled) => {
                setFeedback(null)
                renewMutation.mutate({ leaseId: lease.id, enabled, identity: queryIdentity })
              }}
            />
          ))
        )}
      </Stack>

      <Modal
        opened={Boolean(checkout)}
        onClose={() => {
          if (rentMutation.isPending) return
          setRentError(null)
          setCheckout(null)
        }}
        title="确认月租"
        centered
      >
        {checkout && (
          <Stack gap="sm">
            <Text fw={600}>{checkout.sku.name}</Text>
            <Text>将从可回购卡时余额扣除 {checkout.sku.monthlyRent} 卡时</Text>
            <Text size="sm">
              成功后服务器将按平台统一销售价 {checkout.sku.platformSalePrice} 卡时 / {checkout.sku.packageDurationHours}{' '}
              小时自动上架，自动续租状态以服务端创建的租约为准。
            </Text>
            {rentError && <Alert color="red">{rentError}</Alert>}
            <Group justify="flex-end">
              <Button
                variant="default"
                disabled={rentMutation.isPending}
                onClick={() => {
                  setRentError(null)
                  setCheckout(null)
                }}
              >
                取消
              </Button>
              <Button
                loading={rentMutation.isPending}
                onClick={() => {
                  if (checkout.identity !== queryIdentity) {
                    setCheckout(null)
                    return
                  }
                  rentMutation.mutate({
                    skuId: checkout.sku.id,
                    requestId: checkout.requestId,
                    userId: checkout.userId,
                    identity: checkout.identity,
                  })
                }}
              >
                确认租用
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  )
}

function LeaseCard({
  lease,
  sku,
  queryIdentity,
  changing,
  onAutoRenew,
}: {
  lease: PlatformServerLease
  sku?: PlatformServerSku
  queryIdentity: string
  changing: boolean
  onAutoRenew: (enabled: boolean) => void
}) {
  const projection = leaseProjection(lease)
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const detailsQuery = useQuery({
    queryKey: ['compute', queryIdentity, 'platform-hosting', 'leases', lease.id, 'details'],
    queryFn: () => getPlatformLeaseDetails(lease.id),
    enabled: detailsExpanded,
    retry: false,
    refetchInterval: detailsExpanded ? 10_000 : false,
    refetchIntervalInBackground: false,
  })
  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text fw={700}>{sku?.name || `平台服务器 SKU ${lease.skuId}`}</Text>
            <Text size="xs" c="dimmed">
              租约 {lease.leaseNo}
            </Text>
          </div>
          <Badge color={projection.color}>{projection.leaseStatus}</Badge>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Text size="sm">租约状态：{lease.status}</Text>
          <Text size="sm">接单状态：{projection.intake}</Text>
          <Text size="sm">市场状态：{projection.market}</Text>
          <Text size="sm">续租次数：{lease.renewalCount}</Text>
          <Text size="sm">月租：{lease.monthlyRent} 卡时</Text>
          <Text size="sm">平台统一销售价：{lease.salePrice} 卡时</Text>
        </SimpleGrid>
        <Text size="sm">{termLabel(lease)}</Text>
        <Button
          variant="light"
          color="teal"
          aria-expanded={detailsExpanded}
          onClick={() => setDetailsExpanded((current) => !current)}
        >
          {detailsExpanded ? '收起订单收益日志' : '展开订单收益日志'}
        </Button>
        {detailsExpanded && (
          <LeaseFinancialDetails
            leaseNo={lease.leaseNo}
            details={detailsQuery.data}
            loading={detailsQuery.isLoading}
            error={detailsQuery.error}
            onRetry={() => void detailsQuery.refetch()}
          />
        )}
        {lease.status === 'ACTIVE' && (
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Text size="sm" fw={600}>
                下期续租
              </Text>
              <Text size="xs" c="dimmed">
                关闭只影响下一个租期，当前租期仍然有效；到期停止接收新订单，存量订单履约完毕后下架释放。
              </Text>
            </div>
            <Switch
              size="xs"
              aria-label="自动续租"
              checked={lease.autoRenew}
              disabled={changing}
              onChange={(event) => onAutoRenew(event.currentTarget.checked)}
            />
          </Group>
        )}
        {lease.status !== 'ACTIVE' && <Alert color={projection.color}>{projection.explanation}</Alert>}
      </Stack>
    </Card>
  )
}

function LeaseFinancialDetails({
  leaseNo,
  details,
  loading,
  error,
  onRetry,
}: {
  leaseNo: string
  details?: PlatformLeaseDetails
  loading: boolean
  error: unknown
  onRetry: () => void
}) {
  if (loading) return <Text c="dimmed">正在加载成本与收益…</Text>
  if (error) {
    return (
      <Alert color="red" title="订单收益日志加载失败">
        <Stack gap="xs">
          <Text size="sm">{errorMessage(error)}</Text>
          <Button variant="light" color="red" size="xs" onClick={onRetry}>
            重试
          </Button>
        </Stack>
      </Alert>
    )
  }
  if (!details) return null

  const currentPeriod = details.periods.find((period) => period.status === 'ACTIVE') ?? details.periods.at(-1)
  return (
    <Paper component="section" aria-label={`租约 ${leaseNo} 成本与收益`} withBorder p="sm" radius="md">
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }}>
          <SummaryMetric label="累计租赁成本" value={details.totalCost} />
          <SummaryMetric label="待结算收入" value={details.totalPendingIncome} />
          <SummaryMetric label="已结算总额" value={details.totalSettledIncome} />
          <SummaryMetric label="平台服务费" value={details.totalFee} />
          <SummaryMetric label="净收益" value={details.totalNetIncome} />
        </SimpleGrid>

        <Paper withBorder p="sm" radius="sm">
          <Text fw={600} size="sm">
            当前租赁周期
          </Text>
          {currentPeriod ? (
            <SimpleGrid cols={{ base: 1, sm: 2 }} mt={4}>
              <Text size="sm">第 {currentPeriod.periodNo} 期</Text>
              <Text size="sm">本期租赁成本 {currentPeriod.rentCardHours} 卡时</Text>
              <Text size="sm">周期状态：{periodStatusLabel(currentPeriod.status)}</Text>
              <Text size="sm">
                {formatContractDateTime(currentPeriod.startedAt)} 至 {formatContractDateTime(currentPeriod.endsAt)}
              </Text>
            </SimpleGrid>
          ) : (
            <Text size="sm" c="dimmed" mt={4}>
              暂无租赁周期记录。
            </Text>
          )}
        </Paper>

        <div>
          <Text fw={600} size="sm" mb="xs">
            订单收益日志
          </Text>
          {details.incomeEvents.length === 0 ? (
            <Text size="sm" c="dimmed">
              暂无订单收益记录。
            </Text>
          ) : (
            <IncomeEventTable events={details.incomeEvents} />
          )}
        </div>
      </Stack>
    </Paper>
  )
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <Paper component="section" aria-label={`${label} ${value} 卡时`} withBorder p="xs" radius="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={700}>
        {value} 卡时
      </Text>
    </Paper>
  )
}

function IncomeEventTable({ events }: { events: PlatformLeaseIncomeEvent[] }) {
  return (
    <Table.ScrollContainer minWidth={1_100}>
      <Table striped highlightOnHover withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>状态</Table.Th>
            <Table.Th>订单号</Table.Th>
            <Table.Th>订单 ID</Table.Th>
            <Table.Th>商品 ID</Table.Th>
            <Table.Th>服务时间</Table.Th>
            <Table.Th>结算时间</Table.Th>
            <Table.Th>订单总额</Table.Th>
            <Table.Th>平台服务费</Table.Th>
            <Table.Th>净收益</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {events.map((event) => (
            <Table.Tr key={event.id}>
              <Table.Td>
                <Badge color={event.settlementStatus === 'SETTLED' ? 'green' : 'orange'} variant="light">
                  {event.settlementStatus === 'SETTLED' ? '已结算' : '待结算'}
                </Badge>
              </Table.Td>
              <Table.Td>{event.orderNo}</Table.Td>
              <Table.Td>{event.orderId}</Table.Td>
              <Table.Td>{event.productId}</Table.Td>
              <Table.Td>
                {formatContractDateTime(event.serviceStartedAt)} 至 {formatContractDateTime(event.serviceEndedAt)}
              </Table.Td>
              <Table.Td>{formatContractDateTime(event.settledAt)}</Table.Td>
              <Table.Td>{event.grossCardHours}</Table.Td>
              <Table.Td>{event.platformFeeCardHours}</Table.Td>
              <Table.Td>{event.netIncomeCardHours}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

function periodStatusLabel(status: PlatformLeaseDetails['periods'][number]['status']) {
  return status === 'ACTIVE' ? '进行中（ACTIVE）' : '已完成（COMPLETED）'
}

function formatContractDateTime(value?: string | null) {
  return value ? value.replace('T', ' ') : '-'
}

function leaseProjection(lease: PlatformServerLease) {
  if (lease.status === 'STOPPING') {
    return {
      color: 'orange',
      leaseStatus: '清空预约中',
      intake: '已停止接单',
      market: '市场停止新接单',
      explanation: '租期已到期，正在履行存量订单；预约和争议全部清空后自动下架并释放服务器。',
    }
  }
  if (lease.status === 'RELEASED') {
    return {
      color: 'gray',
      leaseStatus: '已释放',
      intake: '已停止接单',
      market: '市场已下架',
      explanation: '服务器已下架并释放回平台库存。',
    }
  }
  return {
    color: 'green',
    leaseStatus: '租赁中',
    intake: '接单中',
    market: '市场已上架',
    explanation: '',
  }
}

function termLabel(lease: PlatformServerLease) {
  const expiry = new Date(lease.expiresAt)
  const formattedExpiry = formatDateTime(lease.expiresAt)
  if (lease.status === 'RELEASED') {
    return `释放时间：${formatDateTime(lease.releasedAt)}`
  }
  if (lease.status === 'STOPPING') {
    return `到期时间：${formattedExpiry}；停止接单时间：${formatDateTime(lease.stoppingAt)}`
  }
  if (Number.isNaN(expiry.getTime())) return `到期时间：${formattedExpiry}`
  const remainingMs = expiry.getTime() - Date.now()
  if (remainingMs <= 0) return `当前租期已到期，等待服务端推进续租；到期时间 ${formattedExpiry}`
  const remainingDays = Math.ceil(remainingMs / 86_400_000)
  return `当前租期剩余 ${remainingDays} 天，到期时间 ${formattedExpiry}`
}

function upsertLease(current: PlatformServerLease[], updated: PlatformServerLease) {
  const existing = current.findIndex((lease) => lease.id === updated.id)
  if (existing < 0) return [updated, ...current]
  return current.map((lease) => (lease.id === updated.id ? updated : lease))
}

function formatCardHours(value: number | undefined) {
  return value === undefined ? '加载中…' : value.toFixed(3)
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value.replace('T', ' ') : date.toLocaleString('zh-CN', { hour12: false })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败'
}

function rentRequestId(userId: string, skuId: string) {
  const storageKey = `${RENT_REQUEST_STORAGE_PREFIX}${userId}.${skuId}`
  try {
    const existing = localStorage.getItem(storageKey)
    if (existing) {
      pendingRentRequestIds.set(storageKey, existing)
      return existing
    }
    const created = uuidv4()
    pendingRentRequestIds.set(storageKey, created)
    localStorage.setItem(storageKey, created)
    return created
  } catch {
    const existing = pendingRentRequestIds.get(storageKey)
    if (existing) return existing
    const created = uuidv4()
    pendingRentRequestIds.set(storageKey, created)
    return created
  }
}

function clearRentRequestId(userId: string, skuId: string) {
  const storageKey = `${RENT_REQUEST_STORAGE_PREFIX}${userId}.${skuId}`
  pendingRentRequestIds.delete(storageKey)
  try {
    localStorage.removeItem(storageKey)
  } catch {
    // Local storage may be unavailable in locked-down renderer contexts.
  }
}
