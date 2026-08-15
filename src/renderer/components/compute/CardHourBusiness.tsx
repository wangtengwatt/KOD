import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Flex,
  Group,
  Modal,
  NumberInput,
  Paper,
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
  IconArrowsExchange,
  IconChecklist,
  IconCloudUpload,
  IconCreditCard,
  IconDatabase,
  IconPackageExport,
  IconReceipt,
} from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  acceptCardHourRfqQuote,
  type CardHourAssetType,
  type CardHourDeposit,
  type CardHourListing,
  type CardHourLot,
  type CardHourPurchaseQuote,
  type CardHourRedemption,
  type CardHourRfq,
  type CardHourRfqQuote,
  type ComputeAccount,
  cancelCardHourListing,
  confirmCardHourPurchaseQuote,
  confirmCardHourRedemption,
  createAdminCardHourRate,
  createCardHourDeposit,
  createCardHourListing,
  createCardHourPurchaseQuote,
  createCardHourRedemption,
  createCardHourRfq,
  deliverCardHourRedemption,
  disputeCardHourRedemption,
  getCardHourCustody,
  getCardHourMarketStats,
  listAdminCardHourDeposits,
  listAdminCardHourRedemptions,
  listCardHourDeposits,
  listCardHourLots,
  listCardHourMarketListings,
  listCardHourRates,
  listCardHourRedemptions,
  listCardHourRfqQuotes,
  listCardHourRfqs,
  listCardHourTrades,
  listComputeProducts,
  listMyCardHourListings,
  listSupplierNodes,
  quoteCardHourRfq,
  resolveAdminCardHourRedemption,
  reviewAdminCardHourDeposit,
  submitCardHourRedemptionUsage,
  topUpCardHourRedemption,
} from '@/packages/computeCenter'
import { copyToClipboard } from '@/packages/navigator'

type RunAction = (key: string, action: () => Promise<unknown>, success: string) => Promise<boolean>
type RunCardHourAction = (
  key: string,
  action: (autoTopUp: boolean) => Promise<unknown>,
  success: string
) => Promise<boolean>

const businessEntries = [
  {
    value: 'custody',
    title: '卡时托管',
    text: '管理来源批次、有效期、冻结状态和托管记账',
    button: '查看托管',
    icon: IconDatabase,
  },
  {
    value: 'deposit',
    title: '卡时存入',
    text: '验收 GPU 时段后按版本倍率登记为标准卡时',
    button: '申请存入',
    icon: IconCloudUpload,
  },
  {
    value: 'transfer',
    title: '闲置卡时转让',
    text: '所有用户可受限转让自有闲置批次',
    button: '查看规则',
    icon: IconArrowsExchange,
  },
  {
    value: 'redeem',
    title: '卡时取出',
    text: '兑换为真实 GPU 实例并形成实际用量凭证',
    button: '取出使用',
    icon: IconPackageExport,
  },
  {
    value: 'group',
    title: '卡时团购',
    text: '按目标卡时量组合采购，成团后统一分配',
    button: '查看团购',
    icon: IconChecklist,
  },
  {
    value: 'installment',
    title: '卡时分期',
    text: '由持牌合作方提供授信，平台不自行放贷',
    button: '了解分期',
    icon: IconCreditCard,
  },
  {
    value: 'exchange',
    title: '卡时置换',
    text: '按版本化倍率在标准卡时与指定卡时之间置换',
    button: '发起置换',
    icon: IconReceipt,
  },
] as const

export function CardHourMarketplace({
  account,
  isLoggedIn,
  busy,
  run,
  runCardHourAction,
}: {
  account?: ComputeAccount
  isLoggedIn: boolean
  busy: string | null
  run: RunAction
  runCardHourAction: RunCardHourAction
}) {
  const queryClient = useQueryClient()
  const listings = useQuery({ queryKey: ['compute', 'card-market', 'listings'], queryFn: listCardHourMarketListings })
  const stats = useQuery({ queryKey: ['compute', 'card-market', 'stats'], queryFn: getCardHourMarketStats })
  const rates = useQuery({ queryKey: ['compute', 'card-market', 'rates'], queryFn: listCardHourRates })
  const lots = useQuery({
    queryKey: ['compute', 'card-market', 'lots'],
    queryFn: listCardHourLots,
    enabled: isLoggedIn,
  })
  const rfqs = useQuery({
    queryKey: ['compute', 'card-market', 'rfqs'],
    queryFn: listCardHourRfqs,
    enabled: isLoggedIn,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['compute'] })

  return (
    <Stack gap="md">
      <Alert color="blue" title="卡时交易市场">
        在这里购买标准卡时或指定 GPU 卡时、发布采购询价，已认证供应方也可以发布卡时商品。
      </Alert>
      <MarketSummary stats={stats.data} />
      <Tabs defaultValue="spot" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="spot">卡时现货</Tabs.Tab>
          <Tabs.Tab value="rfq">询价采购</Tabs.Tab>
          <Tabs.Tab value="publish">发布卡时</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="spot" pt="md">
          <ListingMarket
            listings={listings.data || []}
            isLoggedIn={isLoggedIn}
            busy={busy}
            run={run}
            runCardHourAction={runCardHourAction}
            onDone={refresh}
          />
        </Tabs.Panel>
        <Tabs.Panel value="rfq" pt="md">
          {!isLoggedIn ? (
            <Alert color="yellow">登录后才能发布询价、查看报价或选中成交。</Alert>
          ) : (
            <RfqMarket
              account={account}
              rfqs={rfqs.data || []}
              lots={lots.data || []}
              busy={busy}
              run={run}
              runCardHourAction={runCardHourAction}
              onDone={refresh}
            />
          )}
        </Tabs.Panel>
        <Tabs.Panel value="publish" pt="md">
          {!isLoggedIn ? (
            <Alert color="yellow">登录并完成供应方认证后才能发布卡时商品。</Alert>
          ) : account?.supplierStatus !== 'APPROVED' ? (
            <Alert color="yellow">完成供应方认证后才能发布卡时商品。</Alert>
          ) : (
            <ListingForm
              title="发布卡时销售商品"
              marketType="PRIMARY_SALE"
              lots={lots.data || []}
              rates={rates.data || []}
              busy={busy}
              run={run}
              onDone={refresh}
            />
          )}
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}

export function CardHourBusiness({
  account,
  isLoggedIn,
  busy,
  run,
  runCardHourAction,
  directTransferPanel,
}: {
  account?: ComputeAccount
  isLoggedIn: boolean
  busy: string | null
  run: RunAction
  runCardHourAction: RunCardHourAction
  directTransferPanel?: React.ReactNode
}) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('custody')
  const rates = useQuery({ queryKey: ['compute', 'card-market', 'rates'], queryFn: listCardHourRates })
  const lots = useQuery({
    queryKey: ['compute', 'card-market', 'lots'],
    queryFn: listCardHourLots,
    enabled: isLoggedIn,
  })
  const custody = useQuery({
    queryKey: ['compute', 'card-market', 'custody'],
    queryFn: getCardHourCustody,
    enabled: isLoggedIn,
  })
  const deposits = useQuery({
    queryKey: ['compute', 'card-market', 'deposits'],
    queryFn: listCardHourDeposits,
    enabled: isLoggedIn,
  })
  const trades = useQuery({
    queryKey: ['compute', 'card-market', 'trades'],
    queryFn: listCardHourTrades,
    enabled: isLoggedIn,
  })
  const myListings = useQuery({
    queryKey: ['compute', 'card-market', 'my-listings'],
    queryFn: listMyCardHourListings,
    enabled: isLoggedIn,
  })
  const nodes = useQuery({ queryKey: ['compute', 'supplier-nodes'], queryFn: listSupplierNodes, enabled: isLoggedIn })
  const products = useQuery({ queryKey: ['compute', 'products', 'GPU'], queryFn: () => listComputeProducts('GPU') })
  const buyerRedemptions = useQuery({
    queryKey: ['compute', 'card-market', 'redemptions', 'buyer'],
    queryFn: () => listCardHourRedemptions('buyer'),
    enabled: isLoggedIn,
  })
  const supplierRedemptions = useQuery({
    queryKey: ['compute', 'card-market', 'redemptions', 'supplier'],
    queryFn: () => listCardHourRedemptions('supplier'),
    enabled: isLoggedIn,
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['compute'] })
  }

  return (
    <Stack gap="md">
      <Alert color="blue" title="卡时是平台内算力权益凭证">
        这里管理你已经拥有的卡时批次、托管、存入、转让和取出。购买、询价或发布商品请前往算力市场。
      </Alert>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
        {businessEntries.map((entry) => {
          const Icon = entry.icon
          return (
            <Card key={entry.value} withBorder padding="md">
              <Group align="flex-start" wrap="nowrap">
                <ThemeIcon variant="light" size="lg">
                  <Icon size={20} />
                </ThemeIcon>
                <Stack gap={4} style={{ flex: 1 }}>
                  <Text fw={700}>{entry.title}</Text>
                  <Text size="sm" c="dimmed" mih={42}>
                    {entry.text}
                  </Text>
                  <Button size="xs" variant="light" onClick={() => setTab(entry.value)}>
                    {entry.button}
                  </Button>
                </Stack>
              </Group>
            </Card>
          )
        })}
      </SimpleGrid>

      <Tabs value={tab} onChange={(value) => value && setTab(value)} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="custody">托管账本</Tabs.Tab>
          <Tabs.Tab value="deposit">存入</Tabs.Tab>
          <Tabs.Tab value="transfer">闲置转让</Tabs.Tab>
          <Tabs.Tab value="redeem">取出</Tabs.Tab>
          <Tabs.Tab value="group">团购</Tabs.Tab>
          <Tabs.Tab value="installment">分期</Tabs.Tab>
          <Tabs.Tab value="exchange">置换</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="custody" pt="md">
          <CustodyLedger custody={custody.data} />
          {isLoggedIn && (
            <TradeRecords
              trades={trades.data || []}
              listings={myListings.data || []}
              busy={busy}
              run={run}
              onDone={refresh}
            />
          )}
        </Tabs.Panel>

        <Tabs.Panel value="deposit" pt="md">
          {!isLoggedIn ? (
            <Alert color="yellow">登录并完成供应方认证后才能申请卡时存入。</Alert>
          ) : (
            <DepositPanel
              supplierApproved={account?.supplierStatus === 'APPROVED'}
              nodes={nodes.data || []}
              deposits={deposits.data || []}
              busy={busy}
              run={run}
              onDone={refresh}
            />
          )}
        </Tabs.Panel>

        <Tabs.Panel value="transfer" pt="md">
          {!isLoggedIn && (
            <Alert color="yellow" mb="md">
              登录后才能进行卡时转让。
            </Alert>
          )}
          {directTransferPanel && (
            <Stack mb="lg">
              <Title order={5}>定向无偿转让</Title>
              <Text size="sm" c="dimmed">
                输入接收方 KOD 邮箱，将卡时定向转给指定用户；这不是市场出售。
              </Text>
              {directTransferPanel}
              <Divider label="或者上架闲置批次" labelPosition="center" />
            </Stack>
          )}
          <Alert color="blue" mb="md">
            闲置批次可以公开上架，由其他用户购买。批次必须未冻结且剩余有效期不少于 7 天；每笔交易固定收取 0.002
            卡时，双方各承担 0.001 卡时。
          </Alert>
          {isLoggedIn && (
            <ListingForm
              title="发布闲置卡时转让"
              marketType="IDLE_TRANSFER"
              lots={lots.data || []}
              rates={rates.data || []}
              busy={busy}
              run={run}
              onDone={refresh}
            />
          )}
        </Tabs.Panel>

        <Tabs.Panel value="redeem" pt="md">
          {!isLoggedIn ? (
            <Alert color="yellow">登录后才能把卡时取出为真实 GPU 实例。</Alert>
          ) : (
            <RedemptionPanel
              products={products.data || []}
              buyerEntries={buyerRedemptions.data || []}
              supplierEntries={supplierRedemptions.data || []}
              account={account}
              busy={busy}
              run={run}
              runCardHourAction={runCardHourAction}
              onDone={refresh}
            />
          )}
        </Tabs.Panel>

        <Tabs.Panel value="group" pt="md">
          <ComingSoon
            title="卡时团购"
            text="目标卡时量、成团截止、统一采购、参与者份额分配和失败退款规则已经确定；第一版暂不开放真实收款。"
          />
        </Tabs.Panel>
        <Tabs.Panel value="installment" pt="md">
          <ComingSoon
            title="卡时分期"
            text="只允许持牌合作方提供授信，KOD 不自行放贷；未来仅按已支付且已消费部分计算佣金。"
          />
        </Tabs.Panel>
        <Tabs.Panel value="exchange" pt="md">
          <ComingSoon
            title="卡时置换"
            text="将按管理员发布的版本化倍率在标准卡时与指定 GPU 卡时之间置换；旧订单始终保留原锁定版本。"
          />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}

function MarketSummary({
  stats,
}: {
  stats?: { standardInventory: number; specificInventory: number; volume24h: number }
}) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 3 }}>
      <Metric label="标准卡时可售库存" value={hours(stats?.standardInventory)} />
      <Metric label="指定 GPU 卡时库存" value={hours(stats?.specificInventory)} />
      <Metric label="近 24 小时成交" value={hours(stats?.volume24h)} />
    </SimpleGrid>
  )
}

function ListingMarket({
  listings,
  isLoggedIn,
  busy,
  run,
  runCardHourAction,
  onDone,
}: {
  listings: CardHourListing[]
  isLoggedIn: boolean
  busy: string | null
  run: RunAction
  runCardHourAction: RunCardHourAction
  onDone: () => Promise<void>
}) {
  const [quote, setQuote] = useState<CardHourPurchaseQuote | null>(null)
  return (
    <>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {listings.map((item) => (
          <Card key={item.id} withBorder>
            <Stack gap="xs">
              <Group justify="space-between">
                <Badge color={item.assetType === 'STANDARD' ? 'blue' : 'violet'}>
                  {item.assetType === 'STANDARD' ? '标准卡时' : `${item.gpuModel} 指定卡时`}
                </Badge>
                <Badge variant="light">{item.marketType === 'IDLE_TRANSFER' ? '闲置转让' : '供应方销售'}</Badge>
              </Group>
              <Title order={5}>{item.title}</Title>
              <Text size="sm" c="dimmed">
                {item.description || '无补充说明'}
              </Text>
              <Text>数量：{hours(item.quantity)}</Text>
              <Text fw={700}>
                单价：{item.priceCurrency === 'CNY' ? `¥${money(item.unitPrice)}` : `${hours(item.unitPrice)} 标准卡时`}
              </Text>
              <Text size="sm">有效期：{date(item.assetExpiresAt)}</Text>
              <Text size="sm">
                卖方：{item.sellerName || '已认证供应方'} · {item.sellerEmail}
              </Text>
              <Group gap="xs">
                {item.identityVerified && <Badge color="teal">已实名认证</Badge>}
                {item.nodeVerified && <Badge color="green">已验机</Badge>}
              </Group>
              <Button
                disabled={!isLoggedIn}
                loading={busy === `card-listing-quote-${item.id}`}
                onClick={async () => {
                  let created: CardHourPurchaseQuote | null = null
                  const ok = await run(
                    `card-listing-quote-${item.id}`,
                    async () => {
                      created = await createCardHourPurchaseQuote(item.id)
                    },
                    '价格、汇率、有效期和服务费已锁定 30 分钟'
                  )
                  if (ok) setQuote(created)
                }}
              >
                选购卡时
              </Button>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
      {listings.length === 0 && <Text c="dimmed">暂无可售卡时商品</Text>}
      <Modal opened={Boolean(quote)} onClose={() => setQuote(null)} title="确认锁价订单" centered>
        {quote && (
          <Stack>
            <Alert color="blue">
              锁价截止：{date(quote.expiresAt)}。确认后原子完成扣款、批次转移、卖方结算和双方服务费记账。
            </Alert>
            <Text>数量：{hours(quote.quantity)}</Text>
            <Text>
              商品金额：
              {quote.priceCurrency === 'CNY' ? `¥${money(quote.totalPrice)}` : `${hours(quote.totalPrice)} 卡时`}
            </Text>
            <Text>买方固定服务费：0.001 卡时</Text>
            <Text>批次有效期：{date(quote.assetExpiresAt)}</Text>
            <Button
              loading={busy === `card-quote-confirm-${quote.id}`}
              onClick={async () => {
                const ok =
                  quote.priceCurrency === 'CARD_HOUR'
                    ? await runCardHourAction(
                        `card-quote-confirm-${quote.id}`,
                        (auto) => confirmCardHourPurchaseQuote(quote.id, auto),
                        '卡时商品购买成功，批次已进入我的资产'
                      )
                    : await run(
                        `card-quote-confirm-${quote.id}`,
                        () => confirmCardHourPurchaseQuote(quote.id),
                        '标准卡时购买成功，批次已进入我的资产'
                      )
                if (ok) {
                  setQuote(null)
                  await onDone()
                }
              }}
            >
              确认购买
            </Button>
          </Stack>
        )}
      </Modal>
    </>
  )
}

function ListingForm({
  title,
  marketType,
  lots,
  rates,
  busy,
  run,
  onDone,
}: {
  title: string
  marketType: 'PRIMARY_SALE' | 'IDLE_TRANSFER'
  lots: CardHourLot[]
  rates: Array<{ gpuModel: string; multiplier: number; status: string }>
  busy: string | null
  run: RunAction
  onDone: () => Promise<void>
}) {
  const [form, setForm] = useState({
    sourceLotId: 0,
    assetType: 'STANDARD' as CardHourAssetType,
    gpuModel: 'H100',
    quantity: 1,
    unitPrice: 1,
    assetExpiresAt: futureDate(30),
    listingExpiresAt: futureDate(3),
    title: marketType === 'PRIMARY_SALE' ? '标准卡时销售' : '闲置卡时转让',
    description: '',
  })
  const chosen = lots.find((lot) => lot.id === form.sourceLotId)
  const availableLots = lots.filter((lot) => Number(lot.availableAmount) > 0)
  const gpuOptions = [...new Set(rates.filter((rate) => rate.status === 'ACTIVE').map((rate) => rate.gpuModel))]
  const effectiveType = marketType === 'IDLE_TRANSFER' && chosen ? chosen.assetType : form.assetType
  return (
    <Paper withBorder p="md">
      <Title order={5}>{title}</Title>
      <Alert color="yellow" my="sm">
        上架后立即冻结来源批次。商品有效期至少剩余 7 天；同一批次不能被重复销售或重复用于 GPU 订单。
      </Alert>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        <Select
          label="来源批次"
          value={form.sourceLotId ? String(form.sourceLotId) : null}
          data={availableLots.map((lot) => ({
            value: String(lot.id),
            label: `#${lot.id} ${lot.assetType === 'STANDARD' ? '标准' : lot.gpuModel} · 可用 ${hours(lot.availableAmount)} · ${date(lot.expiresAt)}`,
          }))}
          onChange={(value) => setForm({ ...form, sourceLotId: Number(value) || 0 })}
        />
        <Select
          label="出售卡时类型"
          value={effectiveType}
          disabled={marketType === 'IDLE_TRANSFER'}
          data={[
            { value: 'STANDARD', label: '标准卡时' },
            { value: 'SPECIFIC', label: '指定 GPU 卡时' },
          ]}
          onChange={(value) => setForm({ ...form, assetType: (value || 'STANDARD') as CardHourAssetType })}
        />
        {effectiveType === 'SPECIFIC' && marketType === 'PRIMARY_SALE' && (
          <Select
            label="锁定 GPU 型号"
            value={form.gpuModel}
            data={gpuOptions}
            onChange={(value) => setForm({ ...form, gpuModel: value || 'H100' })}
          />
        )}
        <NumberInput
          label="出售数量"
          min={0.001}
          decimalScale={3}
          value={form.quantity}
          onChange={(value) => setForm({ ...form, quantity: Number(value) || 0 })}
        />
        <NumberInput
          label={
            effectiveType === 'STANDARD' && marketType === 'PRIMARY_SALE'
              ? '单价（人民币/卡时）'
              : '单价（标准卡时/卡时）'
          }
          min={0.0001}
          decimalScale={4}
          value={form.unitPrice}
          onChange={(value) => setForm({ ...form, unitPrice: Number(value) || 0 })}
        />
        <TextInput
          type="datetime-local"
          label="商品卡时有效期"
          value={form.assetExpiresAt}
          onChange={(event) => setForm({ ...form, assetExpiresAt: event.currentTarget.value })}
        />
        <TextInput
          type="datetime-local"
          label="挂单截止时间"
          value={form.listingExpiresAt}
          onChange={(event) => setForm({ ...form, listingExpiresAt: event.currentTarget.value })}
        />
        <TextInput
          label="标题"
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.currentTarget.value })}
        />
      </SimpleGrid>
      <Textarea
        mt="sm"
        label="说明"
        value={form.description}
        onChange={(event) => setForm({ ...form, description: event.currentTarget.value })}
      />
      <Button
        mt="md"
        loading={busy === `create-listing-${marketType}`}
        disabled={!form.sourceLotId || !form.title.trim() || form.quantity <= 0 || form.unitPrice <= 0}
        onClick={async () => {
          const ok = await run(
            `create-listing-${marketType}`,
            () =>
              createCardHourListing({
                ...form,
                marketType,
                assetType: effectiveType,
                gpuModel: effectiveType === 'SPECIFIC' ? form.gpuModel : null,
                assetExpiresAt: toIso(form.assetExpiresAt),
                listingExpiresAt: toIso(form.listingExpiresAt),
              }),
            '卡时批次已冻结并上架'
          )
          if (ok) await onDone()
        }}
      >
        发布并冻结库存
      </Button>
    </Paper>
  )
}

function RfqMarket({
  account,
  rfqs,
  lots,
  busy,
  run,
  runCardHourAction,
  onDone,
}: {
  account?: ComputeAccount
  rfqs: CardHourRfq[]
  lots: CardHourLot[]
  busy: string | null
  run: RunAction
  runCardHourAction: RunCardHourAction
  onDone: () => Promise<void>
}) {
  const [form, setForm] = useState({
    assetType: 'STANDARD' as CardHourAssetType,
    gpuModel: 'H100',
    quantity: 10,
    minimumExpiresAt: futureDate(30),
    requirements: '',
  })
  const [quoteForm, setQuoteForm] = useState({ rfqId: 0, sourceLotId: 0, unitPrice: 1 })
  const [quotesFor, setQuotesFor] = useState<CardHourRfq | null>(null)
  const quotes = useQuery({
    queryKey: ['compute', 'card-market', 'rfq-quotes', quotesFor?.id],
    queryFn: () => listCardHourRfqQuotes(quotesFor?.id || 0),
    enabled: Boolean(quotesFor),
  })
  return (
    <Stack>
      <Paper withBorder p="md">
        <Title order={5}>发布询价</Title>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mt="sm">
          <Select
            label="需求类型"
            value={form.assetType}
            data={[
              { value: 'STANDARD', label: '标准卡时' },
              { value: 'SPECIFIC', label: '指定 GPU 卡时' },
            ]}
            onChange={(value) => setForm({ ...form, assetType: (value || 'STANDARD') as CardHourAssetType })}
          />
          {form.assetType === 'SPECIFIC' && (
            <TextInput
              label="GPU 型号"
              value={form.gpuModel}
              onChange={(event) => setForm({ ...form, gpuModel: event.currentTarget.value })}
            />
          )}
          <NumberInput
            label="需求数量"
            min={0.001}
            decimalScale={3}
            value={form.quantity}
            onChange={(value) => setForm({ ...form, quantity: Number(value) || 0 })}
          />
          <TextInput
            type="datetime-local"
            label="最低有效期"
            value={form.minimumExpiresAt}
            onChange={(event) => setForm({ ...form, minimumExpiresAt: event.currentTarget.value })}
          />
        </SimpleGrid>
        <Textarea
          mt="sm"
          label="需求说明"
          value={form.requirements}
          onChange={(event) => setForm({ ...form, requirements: event.currentTarget.value })}
        />
        <Button
          mt="md"
          loading={busy === 'create-rfq'}
          onClick={async () => {
            const ok = await run(
              'create-rfq',
              () =>
                createCardHourRfq({
                  ...form,
                  gpuModel: form.assetType === 'SPECIFIC' ? form.gpuModel : null,
                  minimumExpiresAt: toIso(form.minimumExpiresAt),
                  requirements: form.requirements,
                }),
              '询价已发布'
            )
            if (ok) await onDone()
          }}
        >
          发布询价
        </Button>
      </Paper>

      {rfqs.map((item) => (
        <Card key={item.id} withBorder>
          <Flex justify="space-between" gap="md" wrap="wrap">
            <Stack gap={4}>
              <Group>
                <Badge>{item.assetType === 'STANDARD' ? '标准卡时' : item.gpuModel}</Badge>
                <Badge variant="light">{statusLabel(item.status)}</Badge>
              </Group>
              <Text fw={700}>
                {item.rfqNo} · {hours(item.quantity)}
              </Text>
              <Text size="sm">
                买方：{item.buyerEmail} · 已收到 {item.quoteCount || 0} 个有效报价
              </Text>
              <Text size="sm">
                最低有效期：{date(item.minimumExpiresAt)} · 询价截止：{date(item.closesAt)}
              </Text>
              {item.requirements && (
                <Text size="sm" c="dimmed">
                  {item.requirements}
                </Text>
              )}
            </Stack>
            <Group align="end">
              {account?.supplierStatus === 'APPROVED' &&
                item.buyerUserId !== account.userId &&
                item.status === 'OPEN' && (
                  <Stack gap={4}>
                    <Select
                      label="报价来源批次"
                      value={
                        quoteForm.rfqId === item.id && quoteForm.sourceLotId ? String(quoteForm.sourceLotId) : null
                      }
                      data={lots
                        .filter((lot) => lot.availableAmount > 0)
                        .map((lot) => ({
                          value: String(lot.id),
                          label: `#${lot.id} ${lot.assetType === 'STANDARD' ? '标准' : lot.gpuModel} ${hours(lot.availableAmount)}`,
                        }))}
                      onChange={(value) =>
                        setQuoteForm({ ...quoteForm, rfqId: item.id, sourceLotId: Number(value) || 0 })
                      }
                    />
                    <NumberInput
                      label="报价单价"
                      min={0.0001}
                      decimalScale={4}
                      value={quoteForm.rfqId === item.id ? quoteForm.unitPrice : 1}
                      onChange={(value) =>
                        setQuoteForm({ ...quoteForm, rfqId: item.id, unitPrice: Number(value) || 0 })
                      }
                    />
                    <Button
                      size="xs"
                      disabled={quoteForm.rfqId !== item.id || !quoteForm.sourceLotId}
                      loading={busy === `quote-rfq-${item.id}`}
                      onClick={async () => {
                        const ok = await run(
                          `quote-rfq-${item.id}`,
                          () => quoteCardHourRfq(item.id, quoteForm.sourceLotId, quoteForm.unitPrice),
                          '报价已提交，库存锁定 30 分钟'
                        )
                        if (ok) await onDone()
                      }}
                    >
                      提交报价
                    </Button>
                  </Stack>
                )}
              {item.buyerUserId === account?.userId && (
                <Button variant="light" onClick={() => setQuotesFor(item)}>
                  查看并选择报价
                </Button>
              )}
            </Group>
          </Flex>
        </Card>
      ))}
      <Modal opened={Boolean(quotesFor)} onClose={() => setQuotesFor(null)} title="询价报价" centered size="lg">
        <Stack>
          {(quotes.data || []).map((item: CardHourRfqQuote) => (
            <Card key={item.id} withBorder>
              <Group justify="space-between">
                <Stack gap={2}>
                  <Text fw={700}>
                    {item.supplierName || '已认证供应方'} · {item.supplierEmail}
                  </Text>
                  <Text>
                    {item.unitPrice} {item.priceCurrency === 'CNY' ? '人民币/卡时' : '标准卡时/卡时'}
                  </Text>
                  <Text size="sm">报价截止：{date(item.expiresAt)}</Text>
                </Stack>
                <Button
                  loading={busy === `accept-rfq-${item.id}`}
                  disabled={item.status !== 'ACTIVE'}
                  onClick={async () => {
                    const action = (auto: boolean) => acceptCardHourRfqQuote(item.id, auto)
                    const ok =
                      item.priceCurrency === 'CARD_HOUR'
                        ? await runCardHourAction(`accept-rfq-${item.id}`, action, '报价已选中并完成成交')
                        : await run(`accept-rfq-${item.id}`, () => action(false), '报价已选中并完成成交')
                    if (ok) {
                      setQuotesFor(null)
                      await onDone()
                    }
                  }}
                >
                  选中成交
                </Button>
              </Group>
            </Card>
          ))}
          {(quotes.data || []).length === 0 && <Text c="dimmed">暂无有效报价</Text>}
        </Stack>
      </Modal>
    </Stack>
  )
}

function CustodyLedger({
  custody,
}: {
  custody?: { lots: CardHourLot[]; feeEnabled: boolean; accruedFee: number; rule: string }
}) {
  return (
    <Stack>
      <Alert color="blue" title="托管费用状态">
        {custody?.rule || '正在加载托管规则'}；当前累计记账费用 {hours(custody?.accruedFee)}，不会实际扣款。
      </Alert>
      <BatchTable lots={custody?.lots || []} />
    </Stack>
  )
}

function BatchTable({ lots }: { lots: CardHourLot[] }) {
  return (
    <Table.ScrollContainer minWidth={900}>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>批次</Table.Th>
            <Table.Th>类型</Table.Th>
            <Table.Th>来源</Table.Th>
            <Table.Th>原始</Table.Th>
            <Table.Th>可用</Table.Th>
            <Table.Th>冻结</Table.Th>
            <Table.Th>有效期</Table.Th>
            <Table.Th>托管</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {lots.map((lot) => (
            <Table.Tr key={lot.id}>
              <Table.Td>#{lot.id}</Table.Td>
              <Table.Td>{lot.assetType === 'STANDARD' ? '标准卡时' : `${lot.gpuModel} 指定卡时`}</Table.Td>
              <Table.Td>
                {lot.sourceType} · {lot.sourceRef}
              </Table.Td>
              <Table.Td>{hours(lot.originalAmount)}</Table.Td>
              <Table.Td>{hours(lot.availableAmount)}</Table.Td>
              <Table.Td>{hours(lot.frozenAmount)}</Table.Td>
              <Table.Td>{date(lot.expiresAt)}</Table.Td>
              <Table.Td>
                {lot.custodyStatus} / {hours(lot.custodyFeeAccrued)}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

function DepositPanel({
  supplierApproved,
  nodes,
  deposits,
  busy,
  run,
  onDone,
}: {
  supplierApproved: boolean
  nodes: Array<{ id: number; nodeName: string; gpuModel: string; gpuCount: number; status: string }>
  deposits: CardHourDeposit[]
  busy: string | null
  run: RunAction
  onDone: () => Promise<void>
}) {
  const [form, setForm] = useState({
    nodeId: 0,
    availableFrom: futureHours(1),
    availableTo: futureDate(30),
    expiresAt: futureDate(29),
  })
  return (
    <Stack>
      <Alert color={supplierApproved ? 'blue' : 'yellow'}>
        {supplierApproved
          ? '平台将按已验机节点的 GPU 型号、GPU 数量、可提供时长和当前倍率自动计算入账数量。'
          : '请先完成实名认证、供应方认证和 GPU 验机。'}
      </Alert>
      {supplierApproved && (
        <Paper withBorder p="md">
          <Title order={5}>申请存入</Title>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mt="sm">
            <Select
              label="已验机节点"
              value={form.nodeId ? String(form.nodeId) : null}
              data={nodes
                .filter((node) => node.status === 'RUNNING')
                .map((node) => ({
                  value: String(node.id),
                  label: `${node.nodeName} · ${node.gpuModel} × ${node.gpuCount}`,
                }))}
              onChange={(value) => setForm({ ...form, nodeId: Number(value) || 0 })}
            />
            <TextInput
              type="datetime-local"
              label="可提供开始时间"
              value={form.availableFrom}
              onChange={(event) => setForm({ ...form, availableFrom: event.currentTarget.value })}
            />
            <TextInput
              type="datetime-local"
              label="可提供结束时间"
              value={form.availableTo}
              onChange={(event) => setForm({ ...form, availableTo: event.currentTarget.value })}
            />
            <TextInput
              type="datetime-local"
              label="批次有效期"
              value={form.expiresAt}
              onChange={(event) => setForm({ ...form, expiresAt: event.currentTarget.value })}
            />
          </SimpleGrid>
          <Button
            mt="md"
            disabled={!form.nodeId}
            loading={busy === 'card-deposit'}
            onClick={async () => {
              const ok = await run(
                'card-deposit',
                () =>
                  createCardHourDeposit({
                    nodeId: form.nodeId,
                    availableFrom: toIso(form.availableFrom),
                    availableTo: toIso(form.availableTo),
                    expiresAt: toIso(form.expiresAt),
                  }),
                '存入申请已提交，等待管理员验收'
              )
              if (ok) await onDone()
            }}
          >
            申请存入
          </Button>
        </Paper>
      )}
      <RecordTable
        headers={['申请单', '节点', 'GPU', '时段', '折算', '状态']}
        rows={deposits.map((item) => [
          item.depositNo,
          item.nodeName || `#${item.nodeId}`,
          `${item.gpuModel} × ${item.gpuCount}`,
          `${date(item.availableFrom)} 至 ${date(item.availableTo)}`,
          `${hours(item.gpuHours)} GPU 卡时 × ${item.rateMultiplier} = ${hours(item.standardCardHours)}`,
          item.rejectionReason ? `${statusLabel(item.status)}：${item.rejectionReason}` : statusLabel(item.status),
        ])}
      />
    </Stack>
  )
}

function RedemptionPanel({
  products,
  buyerEntries,
  supplierEntries,
  account,
  busy,
  run,
  runCardHourAction,
  onDone,
}: {
  products: Array<{
    nodeId?: number | null
    name: string
    gpuModel?: string | null
    gpuCount?: number | null
    status: string
  }>
  buyerEntries: CardHourRedemption[]
  supplierEntries: CardHourRedemption[]
  account?: ComputeAccount
  busy: string | null
  run: RunAction
  runCardHourAction: RunCardHourAction
  onDone: () => Promise<void>
}) {
  const availableNodes = useMemo(
    () => [...new Map(products.filter((p) => p.nodeId).map((p) => [p.nodeId, p])).values()],
    [products]
  )
  const [form, setForm] = useState({
    nodeId: 0,
    gpuCount: 1,
    startTime: futureHours(2),
    endTime: futureHours(26),
    buyerPublicKey: '',
  })
  return (
    <Stack>
      <Alert color="yellow" title="平台不远程控制供应方 GPU">
        订单结束或额度耗尽时由平台提醒供应方人工停机；供应方提交实际用量和凭证，买方 24 小时内确认或争议。
      </Alert>
      <Paper withBorder p="md">
        <Title order={5}>取出为 GPU 实例</Title>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mt="sm">
          <Select
            label="GPU 节点商品"
            value={form.nodeId ? String(form.nodeId) : null}
            data={availableNodes.map((p) => ({
              value: String(p.nodeId),
              label: `${p.name} · ${p.gpuModel} × ${p.gpuCount}`,
            }))}
            onChange={(value) => setForm({ ...form, nodeId: Number(value) || 0 })}
          />
          <NumberInput
            label="GPU 数量"
            min={1}
            value={form.gpuCount}
            onChange={(value) => setForm({ ...form, gpuCount: Number(value) || 1 })}
          />
          <TextInput
            type="datetime-local"
            label="开始时间"
            value={form.startTime}
            onChange={(event) => setForm({ ...form, startTime: event.currentTarget.value })}
          />
          <TextInput
            type="datetime-local"
            label="结束时间"
            value={form.endTime}
            onChange={(event) => setForm({ ...form, endTime: event.currentTarget.value })}
          />
        </SimpleGrid>
        <Textarea
          mt="sm"
          label="买方 SSH 公钥"
          description="只提交 ssh-ed25519、ssh-rsa 等 OpenSSH 公钥。私钥始终保存在买方自己的电脑，平台和供应方都不需要私钥。"
          placeholder="ssh-ed25519 AAAA... buyer-device"
          autosize
          minRows={3}
          value={form.buyerPublicKey}
          onChange={(event) => setForm({ ...form, buyerPublicKey: event.currentTarget.value })}
        />
        <Text size="sm" c="dimmed" mt="sm">
          扣减顺序：先扣即将到期且型号匹配的指定 GPU 卡时，不足部分再扣标准卡时。当前标准卡时{' '}
          {hours(account?.availableCardHours)}。
        </Text>
        <Button
          mt="md"
          disabled={!form.nodeId || !form.buyerPublicKey.trim()}
          loading={busy === 'card-redemption'}
          onClick={async () => {
            const ok = await runCardHourAction(
              'card-redemption',
              (auto) =>
                createCardHourRedemption(
                  {
                    nodeId: form.nodeId,
                    gpuCount: form.gpuCount,
                    startTime: toIso(form.startTime),
                    endTime: toIso(form.endTime),
                    buyerPublicKey: form.buyerPublicKey,
                  },
                  auto
                ),
              '取出订单已创建，等待供应方交付'
            )
            if (ok) await onDone()
          }}
        >
          取出使用
        </Button>
      </Paper>
      <Title order={5}>我的取出订单</Title>
      {buyerEntries.map((entry) => (
        <RedemptionCard
          key={`b-${entry.id}`}
          entry={entry}
          role="buyer"
          busy={busy}
          run={run}
          runCardHourAction={runCardHourAction}
          onDone={onDone}
        />
      ))}
      {supplierEntries.length > 0 && (
        <>
          <Title order={5}>待我交付的取出订单</Title>
          {supplierEntries.map((entry) => (
            <RedemptionCard
              key={`s-${entry.id}`}
              entry={entry}
              role="supplier"
              busy={busy}
              run={run}
              runCardHourAction={runCardHourAction}
              onDone={onDone}
            />
          ))}
        </>
      )}
    </Stack>
  )
}

function RedemptionCard({
  entry,
  role,
  busy,
  run,
  runCardHourAction,
  onDone,
}: {
  entry: CardHourRedemption
  role: 'buyer' | 'supplier'
  busy: string | null
  run: RunAction
  runCardHourAction: RunCardHourAction
  onDone: () => Promise<void>
}) {
  const [delivery, setDelivery] = useState({ sshHost: '', sshPort: 22, sshUsername: '', note: '' })
  const [usage, setUsage] = useState({ actualGpuHours: entry.bookedGpuHours, evidence: '' })
  const [dispute, setDispute] = useState('')
  const canDispute =
    role === 'buyer' &&
    (['DELIVERED', 'USAGE_SUBMITTED', 'PENDING_ACTION'].includes(entry.status) ||
      (entry.status === 'PENDING_DELIVERY' && new Date(entry.startTime).getTime() <= Date.now()))
  return (
    <Card withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={700}>
            {entry.redemptionNo} · {entry.gpuModel} × {entry.gpuCount}
          </Text>
          <Badge>{statusLabel(entry.status)}</Badge>
        </Group>
        <Text size="sm">
          {date(entry.startTime)} 至 {date(entry.endTime)} · 预订 {hours(entry.bookedGpuHours)} GPU 卡时
        </Text>
        <Text size="sm">
          冻结：指定 {hours(entry.specificHoursFrozen)} / 标准 {hours(entry.standardHoursFrozen)}
        </Text>
        {entry.deliveryInfo && (
          <Alert color="blue">
            <Text style={{ whiteSpace: 'pre-wrap' }}>{entry.deliveryInfo}</Text>
          </Alert>
        )}
        {entry.usageEvidence && <Alert color="teal">交付凭证：{entry.usageEvidence}</Alert>}
        {entry.stopRemindedAt && (
          <Alert color="orange">订单时段已经结束；买方应停止使用，供应方应移除买方公钥或停用临时账号。</Alert>
        )}
        {role === 'supplier' && entry.status === 'PENDING_DELIVERY' && (
          <>
            <Alert color="blue">
              平台不收集任何私钥。请把下方买方公钥安装到订单专属临时账号；订单结束后由你移除公钥或停用账号。
            </Alert>
            <Textarea label="买方 SSH 公钥（只读）" value={entry.buyerPublicKey || ''} readOnly autosize minRows={3} />
            <Button
              size="xs"
              variant="light"
              w="fit-content"
              onClick={() => copyToClipboard(entry.buyerPublicKey || '')}
            >
              复制买方公钥
            </Button>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                label="SSH 地址"
                value={delivery.sshHost}
                onChange={(e) => setDelivery({ ...delivery, sshHost: e.currentTarget.value })}
              />
              <NumberInput
                label="SSH 端口"
                value={delivery.sshPort}
                onChange={(v) => setDelivery({ ...delivery, sshPort: Number(v) || 22 })}
              />
              <TextInput
                label="订单专属临时用户名"
                value={delivery.sshUsername}
                onChange={(e) => setDelivery({ ...delivery, sshUsername: e.currentTarget.value })}
              />
              <TextInput
                label="交付说明（禁止填写密码或私钥）"
                value={delivery.note}
                onChange={(e) => setDelivery({ ...delivery, note: e.currentTarget.value })}
              />
            </SimpleGrid>
            <Button
              loading={busy === `deliver-redemption-${entry.id}`}
              onClick={async () => {
                const ok = await run(
                  `deliver-redemption-${entry.id}`,
                  () => deliverCardHourRedemption(entry.id, delivery),
                  'GPU 连接信息已加密交付'
                )
                if (ok) await onDone()
              }}
            >
              加密交付
            </Button>
          </>
        )}
        {role === 'supplier' && entry.status === 'DELIVERED' && (
          <>
            <NumberInput
              label="实际 GPU 卡时"
              value={usage.actualGpuHours}
              onChange={(v) => setUsage({ ...usage, actualGpuHours: Number(v) || 0 })}
            />
            <Textarea
              label="用量与交付凭证"
              value={usage.evidence}
              onChange={(e) => setUsage({ ...usage, evidence: e.currentTarget.value })}
            />
            <Button
              loading={busy === `usage-redemption-${entry.id}`}
              onClick={async () => {
                const ok = await run(
                  `usage-redemption-${entry.id}`,
                  () => submitCardHourRedemptionUsage(entry.id, usage.actualGpuHours, usage.evidence),
                  '实际用量已提交，等待买方确认'
                )
                if (ok) await onDone()
              }}
            >
              提交实际用量
            </Button>
          </>
        )}
        {role === 'buyer' && entry.status === 'PENDING_ACTION' && (
          <Alert color="orange" title="实际用量超过预订">
            <Text size="sm">
              供应方申报 {hours(entry.actualGpuHours)} GPU 卡时，超过预订{' '}
              {hours(Math.max(0, (entry.actualGpuHours || 0) - entry.bookedGpuHours))}
              。请核实凭证后主动补足；卡时不足时可确认用人民币钱包兑换刚好缺少的卡时。
            </Text>
            <Button
              mt="sm"
              loading={busy === `top-up-redemption-${entry.id}`}
              onClick={async () => {
                const ok = await runCardHourAction(
                  `top-up-redemption-${entry.id}`,
                  (auto) => topUpCardHourRedemption(entry.id, auto),
                  '超量卡时已补足，请确认用量或发起争议'
                )
                if (ok) await onDone()
              }}
            >
              补足并进入确认
            </Button>
          </Alert>
        )}
        {canDispute && (
          <Group>
            {entry.status === 'USAGE_SUBMITTED' && (
              <Button
                loading={busy === `confirm-redemption-${entry.id}`}
                onClick={async () => {
                  const ok = await run(
                    `confirm-redemption-${entry.id}`,
                    () => confirmCardHourRedemption(entry.id),
                    '用量已确认，未使用额度已退回'
                  )
                  if (ok) await onDone()
                }}
              >
                确认用量
              </Button>
            )}
            <TextInput placeholder="争议原因" value={dispute} onChange={(e) => setDispute(e.currentTarget.value)} />
            <Button
              color="red"
              variant="light"
              disabled={!dispute.trim()}
              loading={busy === `dispute-redemption-${entry.id}`}
              onClick={async () => {
                const ok = await run(
                  `dispute-redemption-${entry.id}`,
                  () => disputeCardHourRedemption(entry.id, dispute),
                  '争议已提交，等待管理员处理'
                )
                if (ok) await onDone()
              }}
            >
              发起争议
            </Button>
          </Group>
        )}
      </Stack>
    </Card>
  )
}

function TradeRecords({
  trades,
  listings,
  busy,
  run,
  onDone,
}: {
  trades: Array<{
    tradeNo: string
    assetType: string
    gpuModel?: string | null
    quantity: number
    totalPrice: number
    priceCurrency: string
    status: string
    completedAt: string
  }>
  listings: CardHourListing[]
  busy: string | null
  run: RunAction
  onDone: () => Promise<void>
}) {
  return (
    <Stack mt="md">
      <Title order={5}>我的挂单</Title>
      <RecordTable
        headers={['挂单', '类型', '数量', '单价', '有效期', '状态/操作']}
        rows={listings.map((item) => [
          item.listingNo,
          item.assetType === 'STANDARD' ? '标准' : item.gpuModel || '指定',
          hours(item.quantity),
          `${item.unitPrice} ${item.priceCurrency}`,
          date(item.assetExpiresAt),
          ['PUBLISHED', 'QUOTE_RESERVED'].includes(item.status) ? (
            <Button
              key={item.id}
              size="xs"
              color="red"
              variant="light"
              loading={busy === `cancel-listing-${item.id}`}
              onClick={async () => {
                const ok = await run(
                  `cancel-listing-${item.id}`,
                  () => cancelCardHourListing(item.id),
                  '挂单已下架并解冻'
                )
                if (ok) await onDone()
              }}
            >
              下架
            </Button>
          ) : (
            statusLabel(item.status)
          ),
        ])}
      />
      <Title order={5}>卡时成交记录</Title>
      <RecordTable
        headers={['成交单', '类型', '数量', '成交额', '状态', '时间']}
        rows={trades.map((item) => [
          item.tradeNo,
          item.assetType === 'STANDARD' ? '标准' : item.gpuModel || '指定',
          hours(item.quantity),
          `${item.totalPrice} ${item.priceCurrency}`,
          statusLabel(item.status),
          date(item.completedAt),
        ])}
      />
    </Stack>
  )
}

export function CardHourAdminPanel({ busy, run }: { busy: string | null; run: RunAction }) {
  const queryClient = useQueryClient()
  const deposits = useQuery({ queryKey: ['compute', 'admin', 'card-deposits'], queryFn: listAdminCardHourDeposits })
  const rates = useQuery({ queryKey: ['compute', 'card-market', 'rates'], queryFn: listCardHourRates })
  const redemptions = useQuery({
    queryKey: ['compute', 'admin', 'card-redemptions'],
    queryFn: listAdminCardHourRedemptions,
  })
  const [rate, setRate] = useState({ versionNo: 'V2', gpuModel: '', multiplier: 1, notes: '' })
  const [resolution, setResolution] = useState<Record<number, { actual: number; reason: string }>>({})
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['compute'] })
  return (
    <Stack>
      <Paper withBorder p="md">
        <Title order={5}>GPU 折算倍率版本</Title>
        <Alert color="yellow" my="sm">
          修改只对新存入、销售和置换生效；历史订单继续使用原锁定版本。
        </Alert>
        <SimpleGrid cols={{ base: 1, sm: 4 }}>
          <TextInput
            label="版本号"
            value={rate.versionNo}
            onChange={(e) => setRate({ ...rate, versionNo: e.currentTarget.value })}
          />
          <TextInput
            label="GPU 型号"
            value={rate.gpuModel}
            onChange={(e) => setRate({ ...rate, gpuModel: e.currentTarget.value })}
          />
          <NumberInput
            label="标准卡时倍率"
            min={0.0001}
            decimalScale={4}
            value={rate.multiplier}
            onChange={(v) => setRate({ ...rate, multiplier: Number(v) || 0 })}
          />
          <TextInput
            label="说明"
            value={rate.notes}
            onChange={(e) => setRate({ ...rate, notes: e.currentTarget.value })}
          />
        </SimpleGrid>
        <Button
          mt="md"
          disabled={!rate.versionNo.trim() || !rate.gpuModel.trim()}
          loading={busy === 'admin-card-rate'}
          onClick={async () => {
            const ok = await run('admin-card-rate', () => createAdminCardHourRate(rate), '新倍率版本已启用')
            if (ok) await refresh()
          }}
        >
          发布新倍率版本
        </Button>
        <RecordTable
          headers={['版本', 'GPU', '倍率', '状态', '生效时间']}
          rows={(rates.data || []).map((item) => [
            item.versionNo,
            item.gpuModel,
            item.multiplier,
            statusLabel(item.status),
            date(item.effectiveFrom),
          ])}
        />
      </Paper>
      <Paper withBorder p="md">
        <Title order={5}>卡时存入验收</Title>
        <Stack mt="sm">
          {(deposits.data || [])
            .filter((item) => item.status === 'PENDING')
            .map((item) => (
              <Card key={item.id} withBorder>
                <Group justify="space-between">
                  <Stack gap={2}>
                    <Text fw={700}>
                      {item.depositNo} · {item.email}
                    </Text>
                    <Text size="sm">
                      {item.nodeName} · {item.gpuModel} × {item.gpuCount}
                    </Text>
                    <Text size="sm">
                      {hours(item.gpuHours)} GPU 卡时 × {item.rateMultiplier} = {hours(item.standardCardHours)} 标准卡时
                    </Text>
                    <Text size="sm">
                      占用时段：{date(item.availableFrom)} 至 {date(item.availableTo)}
                    </Text>
                  </Stack>
                  <Group>
                    <Button
                      color="red"
                      variant="light"
                      loading={busy === `deposit-reject-${item.id}`}
                      onClick={async () => {
                        const ok = await run(
                          `deposit-reject-${item.id}`,
                          () => reviewAdminCardHourDeposit(item.id, false, '验收不通过'),
                          '存入申请已拒绝'
                        )
                        if (ok) await refresh()
                      }}
                    >
                      拒绝
                    </Button>
                    <Button
                      loading={busy === `deposit-approve-${item.id}`}
                      onClick={async () => {
                        const ok = await run(
                          `deposit-approve-${item.id}`,
                          () => reviewAdminCardHourDeposit(item.id, true, ''),
                          'GPU 算力额度已验收入账'
                        )
                        if (ok) await refresh()
                      }}
                    >
                      验收通过
                    </Button>
                  </Group>
                </Group>
              </Card>
            ))}
          {(deposits.data || []).filter((item) => item.status === 'PENDING').length === 0 && (
            <Text c="dimmed">暂无待验收存入申请</Text>
          )}
        </Stack>
      </Paper>
      <Paper withBorder p="md">
        <Title order={5}>卡时取出异常与争议</Title>
        <Stack mt="sm">
          {(redemptions.data || [])
            .filter((item) => ['DISPUTED', 'PENDING_ACTION'].includes(item.status))
            .map((item) => {
              const current = resolution[item.id] || {
                actual: Math.min(item.actualGpuHours || item.bookedGpuHours, item.bookedGpuHours),
                reason: '',
              }
              return (
                <Card key={item.id} withBorder>
                  <Stack>
                    <Group justify="space-between">
                      <Text fw={700}>
                        {item.redemptionNo} · {item.gpuModel} × {item.gpuCount}
                      </Text>
                      <Badge color="red">{statusLabel(item.status)}</Badge>
                    </Group>
                    <Text size="sm">
                      冻结上限 {hours(item.bookedGpuHours)}，供应方申报 {hours(item.actualGpuHours)}
                    </Text>
                    {item.disputeReason && <Alert color="red">买方争议：{item.disputeReason}</Alert>}
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                      <NumberInput
                        label="裁定实际 GPU 卡时"
                        min={0}
                        max={item.bookedGpuHours}
                        decimalScale={3}
                        value={current.actual}
                        onChange={(value) =>
                          setResolution({ ...resolution, [item.id]: { ...current, actual: Number(value) || 0 } })
                        }
                      />
                      <TextInput
                        label="裁定说明"
                        value={current.reason}
                        onChange={(event) =>
                          setResolution({ ...resolution, [item.id]: { ...current, reason: event.currentTarget.value } })
                        }
                      />
                    </SimpleGrid>
                    <Button
                      disabled={!current.reason.trim()}
                      loading={busy === `resolve-card-redemption-${item.id}`}
                      onClick={async () => {
                        const ok = await run(
                          `resolve-card-redemption-${item.id}`,
                          () => resolveAdminCardHourRedemption(item.id, current.actual, current.reason),
                          '取出订单已按裁定用量结算'
                        )
                        if (ok) await refresh()
                      }}
                    >
                      确认裁定并结算
                    </Button>
                  </Stack>
                </Card>
              )
            })}
          {(redemptions.data || []).filter((item) => ['DISPUTED', 'PENDING_ACTION'].includes(item.status)).length ===
            0 && <Text c="dimmed">暂无待处理的卡时取出订单</Text>}
        </Stack>
      </Paper>
    </Stack>
  )
}

function ComingSoon({ title, text }: { title: string; text: string }) {
  return (
    <Paper withBorder p="xl">
      <Badge color="gray">规则已确定 · 暂未开放交易</Badge>
      <Title order={4} mt="sm">
        {title}
      </Title>
      <Text mt="sm">{text}</Text>
      <Divider my="md" />
      <Text size="sm" c="dimmed">
        开放前将补齐合作协议、退款规则、风险披露、账务对账和真实合作方接入，不会使用模拟成交数据。
      </Text>
    </Paper>
  )
}

function RecordTable({ headers, rows }: { headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <Table.ScrollContainer minWidth={760}>
      <Table striped>
        <Table.Thead>
          <Table.Tr>
            {headers.map((header) => (
              <Table.Th key={header}>{header}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr key={String(row[0])}>
              {row.map((cell, cellIndex) => (
                <Table.Td key={headers[cellIndex]}>{cell}</Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Paper withBorder p="md">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text size="xl" fw={700}>
        {value}
      </Text>
    </Paper>
  )
}

function hours(value?: number | string | null) {
  const number = Number(value || 0)
  return `${Number.isFinite(number) ? number.toFixed(3) : '0.000'} 卡时`
}

function money(value?: number | string | null) {
  return Number(value || 0).toFixed(4)
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    ACTIVE: '有效',
    APPROVED: '已通过',
    CANCELLED: '已取消',
    COMPLETED: '已完成',
    DELIVERED: '已交付',
    DISPUTED: '争议处理中',
    EXPIRED: '已到期',
    LOCKED: '锁价中',
    OPEN: '询价中',
    PENDING: '待审核',
    PENDING_ACTION: '待补足/待处理',
    PENDING_DELIVERY: '待供应方交付',
    PUBLISHED: '销售中',
    QUOTE_RESERVED: '报价锁定中',
    REJECTED: '未通过',
    RETIRED: '已停用',
    RUNNING: '运行中',
    SOLD: '已成交',
    USAGE_SUBMITTED: '待确认用量',
  }
  return labels[value] || value
}

function date(value?: string | null) {
  if (!value) return '永久有效'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('zh-CN')
}

function futureDate(days: number) {
  const date = new Date(Date.now() + days * 86400000)
  date.setSeconds(0, 0)
  return localInput(date)
}

function futureHours(hours: number) {
  const date = new Date(Date.now() + hours * 3600000)
  date.setSeconds(0, 0)
  return localInput(date)
}

function localInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function toIso(value: string) {
  return new Date(value).toISOString().slice(0, 19)
}
