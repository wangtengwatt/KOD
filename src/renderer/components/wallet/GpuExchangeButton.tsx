import { Badge, Button, Card, Group, Loader, Modal, Pagination, Stack, Tabs, Text, Title } from '@mantine/core'
import { IconExchange, IconHistory, IconShoppingBag } from '@tabler/icons-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { walletApi } from '@/api/wallet'
import { CARD_TIME_RATE, formatCardTime, formatCny } from '@/utils/wallet.utils'

const CATEGORY_LABELS: Record<string, string> = {
  gpu: 'GPU',
  cpu: 'CPU',
  ssd: 'SSD',
  other: 'Other',
}
const ORDER_STATUS: Record<string, { labelKey: string; color: string }> = {
  pending: { labelKey: 'Pending shipment', color: 'yellow' },
  processing: { labelKey: 'Processing', color: 'blue' },
  shipped: { labelKey: 'Shipped', color: 'cyan' },
  completed: { labelKey: 'Completed', color: 'green' },
  cancelled: { labelKey: 'Cancelled', color: 'red' },
}

export function GpuExchangeButton({ availableCardHours }: { availableCardHours?: number }) {
  const { t } = useTranslation()
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
      toast.success(t('Exchange order created'))
      setExchangingId(null)
      setTab('orders')
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t('Exchange failed')),
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
        {t('Exchange card time for products')}
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={
          <Group gap="sm">
            <IconShoppingBag size={20} />
            <Title order={5}>{t('Card time exchange')}</Title>
          </Group>
        }
        size="lg"
        centered
      >
        <Tabs value={tab} onChange={(v) => setTab(v as 'shop' | 'orders')}>
          <Tabs.List>
            <Tabs.Tab value="shop" leftSection={<IconShoppingBag size={16} />}>
              {' '}
              {t('Products')}{' '}
            </Tabs.Tab>
            <Tabs.Tab value="orders" leftSection={<IconHistory size={16} />}>
              {' '}
              {t('Orders')}{' '}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="shop" pt="md">
            <Stack gap="xs">
              <Text size="sm" c="dimmed">
                {t('Card time balance: {{balance}} (≈ {{cny}})', {
                  balance: formatCardTime(cardHours),
                  cny: formatCny(cardHours * CARD_TIME_RATE),
                })}
                · {t('Rate: 1 card hour = {{rate}} RMB', { rate: CARD_TIME_RATE })}
              </Text>
              {products.isLoading && <Loader size="sm" />}
              {products.error && (
                <Text c="red" size="sm">
                  {t('Failed to load products')}
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
                              · {t('Stock: {{stock}}', { stock: p.stock })}
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
                        {p.stock === 0 ? t('Out of stock') : canAfford ? t('Exchange') : t('Insufficient balance')}
                      </Button>
                    </Group>
                  </Card>
                )
              })}
              <Text size="xs" c="dimmed" ta="center">
                {t('Prices are for reference only. The actual exchange price applies.')}
              </Text>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="orders" pt="md">
            <Stack gap="xs">
              {orders.isLoading && <Loader size="sm" />}
              {orders.error && (
                <Text c="red" size="sm">
                  {t('Failed to load orders')}
                </Text>
              )}
              {orders.data?.items.length === 0 && (
                <Text c="dimmed" ta="center">
                  {t('No exchange orders yet')}
                </Text>
              )}
              {orders.data?.items.map((o) => {
                const st = ORDER_STATUS[o.status] ?? { labelKey: o.status, color: 'gray' }
                return (
                  <Card key={o.id} withBorder padding="sm">
                    <Group justify="space-between" wrap="nowrap">
                      <Stack gap={2}>
                        <Group gap="xs">
                          <Text fw={600}>{o.productName}</Text>
                          <Badge size="xs" color={st.color}>
                            {t(st.labelKey)}
                          </Badge>
                        </Group>
                        <Text size="xs" c="dimmed">
                          {o.productSpec}
                        </Text>
                        <Group gap="xs">
                          <Text size="sm">{t('Consumed: {{amount}}', { amount: formatCardTime(o.cardTimeCost) })}</Text>
                          <Text size="sm" c="dimmed">
                            · {formatCny(o.rmbPrice)}
                          </Text>
                          {o.trackingNo && (
                            <Text size="xs" c="blue">
                              · {t('Tracking number: {{no}}', { no: o.trackingNo })}
                            </Text>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed">
                          {dayjs.unix(o.createTime).format('YYYY-MM-DD HH:mm')}
                          {o.status === 'pending' && ` · ${t('waiting for shipment')}`}
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
