import { Badge, Button, Card, Group, Loader, Modal, Pagination, Stack, Tabs, Text, Title } from '@mantine/core'
import { IconExchange, IconHistory, IconShoppingBag } from '@tabler/icons-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useState } from 'react'
import { toast } from 'sonner'
import { walletApi } from '@/api/wallet'
import { CARD_TIME_RATE, formatCardTime, formatCny } from '@/utils/wallet.utils'

const CATEGORY_LABELS: Record<string, string> = {
  gpu: 'GPU 显卡',
  cpu: 'CPU 处理器',
  ssd: '固态硬盘',
  other: '其他',
}
const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: '待发货', color: 'yellow' },
  processing: { label: '处理中', color: 'blue' },
  shipped: { label: '已发货', color: 'cyan' },
  completed: { label: '已完成', color: 'green' },
  cancelled: { label: '已取消', color: 'red' },
}

export function GpuExchangeButton({ availableCardHours }: { availableCardHours?: number }) {
  const [opened, setOpened] = useState(false)
  const [tab, setTab] = useState<'shop' | 'orders'>('shop')
  const [page, setPage] = useState(1)
  const [exchangingId, setExchangingId] = useState<string | null>(null)
  const cardHours = availableCardHours ?? 0

  const products = useQuery({
    queryKey: ['card-time-products'],
    queryFn: walletApi.getCardTimeProducts,
    enabled: opened,
  })
  const orders = useQuery({
    queryKey: ['card-time-exchange-orders', page],
    queryFn: () => walletApi.getExchangeOrders(page, 10),
    enabled: opened && tab === 'orders',
  })
  const exchange = useMutation({
    mutationFn: (productId: string) => walletApi.createExchangeOrder(productId),
    onSuccess: () => {
      toast.success('兑换订单已创建')
      setExchangingId(null)
      setTab('orders')
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '兑换失败'),
  })

  const handleExchange = (productId: string) => {
    exchange.mutate(productId)
    setExchangingId(productId)
  }

  return (
    <>
      <Button
        variant="light"
        leftSection={<IconExchange size={16} />}
        onClick={() => {
          setOpened(true)
          setTab('shop')
        }}
      >
        卡时兑换商品
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={
          <Group gap="sm">
            <IconShoppingBag size={20} />
            <Title order={5}>卡时兑换</Title>
          </Group>
        }
        size="lg"
        centered
      >
        <Tabs value={tab} onChange={(v) => setTab(v as 'shop' | 'orders')}>
          <Tabs.List>
            <Tabs.Tab value="shop" leftSection={<IconShoppingBag size={16} />}>
              {' '}
              商品{' '}
            </Tabs.Tab>
            <Tabs.Tab value="orders" leftSection={<IconHistory size={16} />}>
              {' '}
              订单{' '}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="shop" pt="md">
            <Stack gap="xs">
              <Text size="sm" c="dimmed">
                卡时余额：{formatCardTime(cardHours)}（≈ {formatCny(cardHours * CARD_TIME_RATE)}） · 汇率：1 卡时 ={' '}
                {CARD_TIME_RATE} RMB
              </Text>
              {products.isLoading && <Loader size="sm" />}
              {products.error && (
                <Text c="red" size="sm">
                  商品加载失败
                </Text>
              )}
              {products.data?.map((p) => {
                const canAfford = cardHours >= p.cardTimePrice
                return (
                  <Card key={p.id} withBorder padding="sm">
                    <Group justify="space-between" wrap="nowrap">
                      <Stack gap={2}>
                        <Group gap="xs">
                          <Text fw={700}>{p.name}</Text>
                          <Badge size="xs" variant="light">
                            {CATEGORY_LABELS[p.category] ?? p.category}
                          </Badge>
                          {p.brand && (
                            <Badge size="xs" variant="outline">
                              {p.brand}
                            </Badge>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed">
                          {p.spec}
                        </Text>
                        <Group gap="xs">
                          <Text size="sm">{formatCny(p.rmbPrice)}</Text>
                          <Text size="sm" c="blue" fw={500}>
                            → {formatCardTime(p.cardTimePrice)}
                          </Text>
                          {p.stock >= 0 && (
                            <Text size="xs" c={p.stock > 0 ? 'green' : 'red'}>
                              · 库存 {p.stock}
                            </Text>
                          )}
                        </Group>
                      </Stack>
                      <Button
                        size="sm"
                        color={canAfford ? 'green' : 'gray'}
                        disabled={!canAfford || p.stock === 0 || exchange.isPending}
                        loading={exchangingId === p.id && exchange.isPending}
                        onClick={() => handleExchange(p.id)}
                      >
                        {p.stock === 0 ? '缺货' : canAfford ? '兑换' : '余额不足'}
                      </Button>
                    </Group>
                  </Card>
                )
              })}
              <Text size="xs" c="dimmed" ta="center">
                价格仅供参考，实际以兑换时为准
              </Text>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="orders" pt="md">
            <Stack gap="xs">
              {orders.isLoading && <Loader size="sm" />}
              {orders.error && (
                <Text c="red" size="sm">
                  订单加载失败
                </Text>
              )}
              {orders.data?.items.length === 0 && (
                <Text c="dimmed" ta="center">
                  暂无兑换订单
                </Text>
              )}
              {orders.data?.items.map((o) => {
                const st = ORDER_STATUS[o.status] ?? { label: o.status, color: 'gray' }
                return (
                  <Card key={o.id} withBorder padding="sm">
                    <Group justify="space-between" wrap="nowrap">
                      <Stack gap={2}>
                        <Group gap="xs">
                          <Text fw={600}>{o.productName}</Text>
                          <Badge size="xs" color={st.color}>
                            {st.label}
                          </Badge>
                        </Group>
                        <Text size="xs" c="dimmed">
                          {o.productSpec}
                        </Text>
                        <Group gap="xs">
                          <Text size="sm">消耗 {formatCardTime(o.cardTimeCost)}</Text>
                          <Text size="sm" c="dimmed">
                            · {formatCny(o.rmbPrice)}
                          </Text>
                          {o.trackingNo && (
                            <Text size="xs" c="blue">
                              · 快递 {o.trackingNo}
                            </Text>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed">
                          {dayjs.unix(o.createTime).format('YYYY-MM-DD HH:mm')}
                          {o.status === 'pending' && ' · 等待发货'}
                        </Text>
                      </Stack>
                    </Group>
                  </Card>
                )
              })}
              {orders.data && orders.data.total > orders.data.pageSize && (
                <Pagination
                  value={page}
                  total={Math.ceil(orders.data.total / orders.data.pageSize)}
                  onChange={setPage}
                />
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Modal>
    </>
  )
}
