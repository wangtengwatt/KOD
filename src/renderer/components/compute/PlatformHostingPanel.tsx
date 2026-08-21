import { Alert, Badge, Button, Card, Group, Modal, Paper, SimpleGrid, Stack, Switch, Text, Title } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  getComputeAccount,
  listPlatformServerLeases,
  listPlatformServerSkus,
  type PlatformServerLease,
  type PlatformServerSku,
  rentPlatformServer,
  setLeaseAutoRenew,
} from '@/packages/computeCenter'

const PLATFORM_SKUS_QUERY_KEY = ['compute', 'platform-hosting', 'skus'] as const
const PLATFORM_LEASES_QUERY_KEY = ['compute', 'platform-hosting', 'leases'] as const
const RENT_REQUEST_STORAGE_PREFIX = 'compute.platform-hosting.rent-request.'
const pendingRentRequestIds = new Map<string, string>()

export function PlatformHostingPanel() {
  const queryClient = useQueryClient()
  const [checkout, setCheckout] = useState<{
    sku: PlatformServerSku
    requestId: string
    userId: number
  } | null>(null)
  const [rentError, setRentError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ color: 'green' | 'red'; text: string } | null>(null)
  const skusQuery = useQuery({
    queryKey: PLATFORM_SKUS_QUERY_KEY,
    queryFn: listPlatformServerSkus,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  })
  const leasesQuery = useQuery({
    queryKey: PLATFORM_LEASES_QUERY_KEY,
    queryFn: listPlatformServerLeases,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  })
  const accountQuery = useQuery({ queryKey: ['compute', 'account'], queryFn: getComputeAccount })

  const refreshAfterRent = async (lease: PlatformServerLease) => {
    queryClient.setQueryData<PlatformServerLease[]>(PLATFORM_LEASES_QUERY_KEY, (current = []) =>
      upsertLease(current, lease)
    )
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['compute', 'account'] }),
      queryClient.invalidateQueries({ queryKey: PLATFORM_SKUS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ['compute', 'supplier-hosting'] }),
      queryClient.invalidateQueries({ queryKey: ['compute', 'supplier-nodes'] }),
      queryClient.invalidateQueries({ queryKey: ['compute', 'supplier-products'] }),
      queryClient.invalidateQueries({ queryKey: ['compute', 'products'] }),
    ])
  }

  const rentMutation = useMutation({
    mutationFn: ({ skuId, requestId }: { skuId: string; requestId: string; userId: number }) =>
      rentPlatformServer(skuId, requestId),
    onMutate: () => setRentError(null),
    onSuccess: async (createdLease, variables) => {
      await refreshAfterRent(createdLease)
      clearRentRequestId(variables.userId, variables.skuId)
      setCheckout(null)
      setFeedback({ color: 'green', text: '月租成功，服务器已按平台统一价格上架' })
    },
    onError: async (error, variables) => {
      let recoveredLease: PlatformServerLease | undefined
      try {
        const serverLeases = await queryClient.fetchQuery({
          queryKey: PLATFORM_LEASES_QUERY_KEY,
          queryFn: listPlatformServerLeases,
          staleTime: 0,
        })
        recoveredLease = serverLeases.find((lease) => lease.requestId === variables.requestId)
      } catch {
        // Preserve the original mutation error when reconciliation is also unavailable.
      }
      if (recoveredLease) {
        await refreshAfterRent(recoveredLease)
        clearRentRequestId(variables.userId, variables.skuId)
        setCheckout(null)
        setFeedback({ color: 'green', text: '月租结果已从服务端确认，服务器已按平台统一价格上架' })
        return
      }
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['compute', 'account'] }),
        queryClient.invalidateQueries({ queryKey: PLATFORM_SKUS_QUERY_KEY }),
      ])
      setRentError(errorMessage(error))
    },
  })

  const renewMutation = useMutation({
    mutationFn: ({ leaseId, enabled }: { leaseId: string; enabled: boolean }) => setLeaseAutoRenew(leaseId, enabled),
    onSuccess: (updatedLease) => {
      queryClient.setQueryData<PlatformServerLease[]>(PLATFORM_LEASES_QUERY_KEY, (current = []) =>
        upsertLease(current, updatedLease)
      )
      setFeedback({ color: 'green', text: updatedLease.autoRenew ? '已开启下期自动续租' : '已关闭下期自动续租' })
    },
    onError: (error) => setFeedback({ color: 'red', text: errorMessage(error) }),
  })

  const loadError = skusQuery.error || leasesQuery.error || accountQuery.error
  const accountUserId = accountQuery.data?.userId
  const redeemableBalance = accountQuery.data?.redeemableCardHours
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
                  <Text fw={700}>月租 {formatCardHours(sku.monthlyRent)} 卡时</Text>
                  <Text size="sm">
                    平台统一销售价 {formatCardHours(sku.platformSalePrice)} 卡时 / {sku.packageDurationHours} 小时
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
                      setCheckout({ sku, requestId: rentRequestId(accountUserId, sku.id), userId: accountUserId })
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
              key={lease.id}
              lease={lease}
              sku={skus.find((candidate) => candidate.id === lease.skuId)}
              changing={renewMutation.isPending && renewMutation.variables?.leaseId === lease.id}
              onAutoRenew={(enabled) => {
                setFeedback(null)
                renewMutation.mutate({ leaseId: lease.id, enabled })
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
            <Text>将从可回购卡时余额扣除 {formatCardHours(checkout.sku.monthlyRent)} 卡时</Text>
            <Text size="sm">
              成功后服务器将按平台统一销售价 {formatCardHours(checkout.sku.platformSalePrice)} 卡时 /{' '}
              {checkout.sku.packageDurationHours} 小时自动上架，自动续租状态以服务端创建的租约为准。
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
                onClick={() =>
                  rentMutation.mutate({
                    skuId: checkout.sku.id,
                    requestId: checkout.requestId,
                    userId: checkout.userId,
                  })
                }
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
  changing,
  onAutoRenew,
}: {
  lease: PlatformServerLease
  sku?: PlatformServerSku
  changing: boolean
  onAutoRenew: (enabled: boolean) => void
}) {
  const projection = leaseProjection(lease)
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
          <Text size="sm">月租：{formatCardHours(lease.monthlyRent)} 卡时</Text>
          <Text size="sm">平台统一销售价：{formatCardHours(lease.salePrice)} 卡时</Text>
        </SimpleGrid>
        <Text size="sm">{termLabel(lease)}</Text>
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

function rentRequestId(userId: number, skuId: string) {
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

function clearRentRequestId(userId: number, skuId: string) {
  const storageKey = `${RENT_REQUEST_STORAGE_PREFIX}${userId}.${skuId}`
  pendingRentRequestIds.delete(storageKey)
  try {
    localStorage.removeItem(storageKey)
  } catch {
    // Local storage may be unavailable in locked-down renderer contexts.
  }
}
