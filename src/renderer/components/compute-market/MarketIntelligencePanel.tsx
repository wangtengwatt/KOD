import {
  Alert,
  Badge,
  Box,
  Button,
  Flex,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import {
  IconArrowsExchange,
  IconChartLine,
  IconClock,
  IconDatabase,
  IconExternalLink,
  IconMaximize,
  IconRefresh,
  IconShieldCheck,
  IconStack2,
} from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getKaiMarketInference,
  getKaiMarketInferenceContracts,
  type KaiMarketInferenceContract,
  type KaiMarketInferenceView,
  refreshKaiMarketInference,
} from '@/packages/compute-market/kaiInference'
import {
  calculateMarketFreshness,
  evaluateMarketCapabilities,
  HISTORY_REFRESH_MS,
  isTrustedMarketSourceUrl,
  LIVE_REFRESH_MS,
  mergeMarketHistoryWithLatest,
  type PublicCardHourMarketStats,
  type PublicCardHourTrade,
  sanitizeLegacyMarketHistory,
  sanitizeLegacyMarketSnapshot,
  sanitizePublicCardHourMarketStats,
  summarizeCompletedCardHourTrades,
} from '@/packages/compute-market/marketIntelligence'
import { SIMULATED_MARKET_DISCLOSURE, SIMULATED_MARKET_DISPLAY_UNIT } from '@/packages/compute-market/simulatedMarket'
import {
  type CardHourMarketStats,
  type ComputeMarketPriceHistory,
  type ComputeMarketPricePoint,
  type ComputeMarketPriceQuote,
  type ComputeMarketPriceSnapshot,
  getCardHourMarketStats,
  getComputeMarketPriceHistory,
  getComputeMarketPrices,
} from '@/packages/computeCenter'
import type { WalletIdentity } from '@/packages/walletIdentity'
import platform from '@/platform'
import { KaiMarketInferenceCard } from './KaiMarketInferenceCard'

export type MarketPriceRange = '1h' | '6h' | '24h' | '7d'
export type MarketView = 'gpu-reference' | 'card-hours'

export interface MarketIntelligenceApi {
  getLatest: () => Promise<ComputeMarketPriceSnapshot>
  getHistory: (model: string, range: MarketPriceRange) => Promise<ComputeMarketPriceHistory>
  getCardStats: () => Promise<CardHourMarketStats>
}

export interface MarketInferenceApi {
  getContracts: (identity: WalletIdentity, signal?: AbortSignal) => Promise<KaiMarketInferenceContract[]>
  getInference: (contractId: string, identity: WalletIdentity, signal?: AbortSignal) => Promise<KaiMarketInferenceView>
  refreshInference: (
    contractId: string,
    identity: WalletIdentity,
    signal?: AbortSignal
  ) => Promise<KaiMarketInferenceView>
}

const defaultApi: MarketIntelligenceApi = {
  getLatest: getComputeMarketPrices,
  getHistory: getComputeMarketPriceHistory,
  getCardStats: getCardHourMarketStats,
}

const defaultInferenceApi: MarketInferenceApi = {
  getContracts: getKaiMarketInferenceContracts,
  getInference: getKaiMarketInference,
  refreshInference: refreshKaiMarketInference,
}

const rangeOptions = [
  { value: '1h', label: '近 1 小时' },
  { value: '6h', label: '近 6 小时' },
  { value: '24h', label: '近 24 小时' },
  { value: '7d', label: '近 7 天' },
]

export function MarketIntelligencePanel({
  api = defaultApi,
  inferenceApi = defaultInferenceApi,
  identity = null,
  initialView = 'gpu-reference',
  enableFullscreen = true,
  enableAdvanced = false,
  simulationMode = false,
}: {
  api?: MarketIntelligenceApi
  inferenceApi?: MarketInferenceApi
  identity?: WalletIdentity | null
  initialView?: MarketView
  enableFullscreen?: boolean
  enableAdvanced?: boolean
  simulationMode?: boolean
}) {
  const queryClient = useQueryClient()
  const [view, setView] = useState<MarketView>(initialView)
  const [gpuModel, setGpuModel] = useState('H100')
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null)
  const [range, setRange] = useState<MarketPriceRange>('24h')
  const [fullScreen, setFullScreen] = useState(false)
  const queryScope = simulationMode ? 'simulated' : 'live'
  const liveRefreshMs = simulationMode ? 1_000 : LIVE_REFRESH_MS
  const historyRefreshMs = simulationMode ? 5_000 : HISTORY_REFRESH_MS

  const latestQuery = useQuery({
    queryKey: ['compute', 'market-intelligence', queryScope, 'latest'],
    queryFn: async () => sanitizeLegacyMarketSnapshot(await api.getLatest()),
    enabled: view === 'gpu-reference',
    retry: false,
    refetchInterval: () => backgroundAwareInterval(liveRefreshMs),
    refetchIntervalInBackground: false,
  })
  const historyQuery = useQuery({
    queryKey: ['compute', 'market-intelligence', queryScope, 'history', gpuModel, range],
    queryFn: async () => sanitizeLegacyMarketHistory(await api.getHistory(gpuModel, range)),
    enabled: view === 'gpu-reference',
    retry: false,
    refetchInterval: () => backgroundAwareInterval(historyRefreshMs),
    refetchIntervalInBackground: false,
  })
  const cardStatsQuery = useQuery({
    queryKey: ['compute', 'market-intelligence', queryScope, 'card-hour-stats'],
    queryFn: async () => sanitizePublicCardHourMarketStats(await api.getCardStats()),
    enabled: view === 'card-hours',
    retry: false,
    refetchInterval: () => backgroundAwareInterval(historyRefreshMs),
    refetchIntervalInBackground: false,
  })

  const inferenceEnabled = Boolean(identity) && view === 'gpu-reference' && !simulationMode
  const contractDirectoryQuery = useQuery({
    queryKey: ['compute', 'market-inference', identity ?? 'signed-out', 'contracts'],
    queryFn: ({ signal }) => inferenceApi.getContracts(identity as WalletIdentity, signal),
    enabled: inferenceEnabled,
    retry: false,
  })

  const snapshot = latestQuery.data
  useEffect(() => {
    if (!snapshot?.trackedModels.length || snapshot.trackedModels.includes(gpuModel)) return
    setGpuModel(snapshot.trackedModels[0])
  }, [gpuModel, snapshot?.trackedModels])

  const quotes = useMemo(
    () => (snapshot?.quotes || []).filter((quote) => quote.gpuModel === gpuModel),
    [gpuModel, snapshot?.quotes]
  )
  const chartPoints = useMemo(() => mergeHistoryAndLive(historyQuery.data, quotes), [historyQuery.data, quotes])

  const matchingContracts = useMemo(
    () => (contractDirectoryQuery.data ?? []).filter((contract) => sameGpuModel(contract.gpuModel, gpuModel)),
    [contractDirectoryQuery.data, gpuModel]
  )
  const selectedContract = useMemo(
    () => matchingContracts.find(({ contractId }) => contractId === selectedContractId) ?? null,
    [matchingContracts, selectedContractId]
  )

  useEffect(() => {
    if (!inferenceEnabled) {
      setSelectedContractId(null)
      return
    }
    if (selectedContract) return
    setSelectedContractId(matchingContracts.find(({ status }) => status === 'trading')?.contractId ?? null)
  }, [inferenceEnabled, matchingContracts, selectedContract])

  const inferenceQueryKey = useMemo(
    () =>
      [
        'compute',
        'market-inference',
        identity ?? 'signed-out',
        'contract',
        selectedContract?.contractId ?? 'none',
      ] as const,
    [identity, selectedContract?.contractId]
  )
  const inferenceQuery = useQuery({
    queryKey: inferenceQueryKey,
    queryFn: ({ signal }) =>
      inferenceApi.getInference(selectedContract?.contractId as string, identity as WalletIdentity, signal),
    enabled: inferenceEnabled && Boolean(selectedContract),
    retry: false,
  })

  const inferenceOwner =
    inferenceEnabled && identity && selectedContract ? `${identity}\u0000${selectedContract.contractId}` : null
  const inferenceOwnerRef = useRef(inferenceOwner)
  inferenceOwnerRef.current = inferenceOwner
  const refreshRequestRef = useRef<{ sequence: number; controller: AbortController | null }>({
    sequence: 0,
    controller: null,
  })
  const [refreshState, setRefreshState] = useState<{
    owner: string | null
    pending: boolean
    failed: boolean
  }>({ owner: null, pending: false, failed: false })

  useEffect(() => {
    if (!inferenceOwner) return
    return () => {
      refreshRequestRef.current.sequence += 1
      refreshRequestRef.current.controller?.abort()
      refreshRequestRef.current.controller = null
    }
  }, [inferenceOwner])

  const runInferenceRefresh = useCallback(async () => {
    if (!identity || !selectedContract || !inferenceOwner) return

    const owner = inferenceOwner
    const contractId = selectedContract.contractId
    const queryKey = ['compute', 'market-inference', identity, 'contract', contractId] as const
    const sequence = refreshRequestRef.current.sequence + 1
    refreshRequestRef.current.sequence = sequence
    refreshRequestRef.current.controller?.abort()
    const controller = new AbortController()
    refreshRequestRef.current.controller = controller
    setRefreshState({ owner, pending: true, failed: false })

    try {
      const nextView = await inferenceApi.refreshInference(contractId, identity, controller.signal)
      if (
        controller.signal.aborted ||
        refreshRequestRef.current.sequence !== sequence ||
        inferenceOwnerRef.current !== owner
      ) {
        return
      }
      queryClient.setQueryData(queryKey, nextView)
      setRefreshState({ owner, pending: false, failed: false })
    } catch {
      if (
        controller.signal.aborted ||
        refreshRequestRef.current.sequence !== sequence ||
        inferenceOwnerRef.current !== owner
      ) {
        return
      }
      setRefreshState({ owner, pending: false, failed: true })
    } finally {
      if (refreshRequestRef.current.sequence === sequence) refreshRequestRef.current.controller = null
    }
  }, [identity, inferenceApi, inferenceOwner, queryClient, selectedContract])

  const automaticRefreshCycle =
    inferenceOwner && latestQuery.isSuccess && latestQuery.dataUpdatedAt > 0 && inferenceQuery.isFetched
      ? `${inferenceOwner}\u0000${latestQuery.dataUpdatedAt}`
      : null
  const automaticRefreshCycleRef = useRef<string | null>(null)
  useEffect(() => {
    if (!automaticRefreshCycle || automaticRefreshCycleRef.current === automaticRefreshCycle) return
    automaticRefreshCycleRef.current = automaticRefreshCycle
    void runInferenceRefresh()
  }, [automaticRefreshCycle, runInferenceRefresh])

  const currentRefreshState = refreshState.owner === inferenceOwner ? refreshState : null
  const inferenceContent = inferenceEnabled ? (
    <MarketInferenceSection
      gpuModel={gpuModel}
      contracts={matchingContracts}
      selectedContractId={selectedContract?.contractId ?? null}
      onContractChange={setSelectedContractId}
      directoryLoading={contractDirectoryQuery.isLoading}
      directoryError={contractDirectoryQuery.error}
      inference={inferenceQuery.data}
      inferenceLoading={inferenceQuery.isLoading}
      inferenceError={inferenceQuery.error}
      refreshFailed={Boolean(currentRefreshState?.failed)}
      refreshing={Boolean(currentRefreshState?.pending)}
      onRefresh={runInferenceRefresh}
    />
  ) : null

  const content = (
    <>
      <MarketDashboardContent
        view={view}
        onViewChange={setView}
        gpuModel={gpuModel}
        onGpuModelChange={setGpuModel}
        range={range}
        onRangeChange={setRange}
        snapshot={snapshot}
        quotes={quotes}
        chartPoints={chartPoints}
        latestError={latestQuery.error}
        latestLoading={latestQuery.isLoading}
        latestFetching={latestQuery.isFetching}
        historyLoading={historyQuery.isLoading}
        historyError={historyQuery.error}
        cardStats={cardStatsQuery.data}
        cardStatsError={cardStatsQuery.error}
        cardStatsLoading={cardStatsQuery.isLoading}
        onRetryLatest={() => void latestQuery.refetch()}
        onRetryHistory={() => void historyQuery.refetch()}
        onRetryCardStats={() => void cardStatsQuery.refetch()}
        enableAdvanced={enableAdvanced}
        simulationMode={simulationMode}
        liveRefreshMs={liveRefreshMs}
        historyRefreshMs={historyRefreshMs}
        inferenceContent={inferenceContent}
      />
      {simulationMode && (
        <Text size="10px" c="dimmed" ta="center" px="md" pt="xs">
          {SIMULATED_MARKET_DISCLOSURE}
        </Text>
      )}
    </>
  )

  return (
    <Stack gap="md">
      <Paper
        withBorder
        radius="lg"
        p={{ base: 'md', sm: 'lg' }}
        style={{ backgroundColor: 'var(--chatbox-background-primary, var(--mantine-color-body))' }}
      >
        <Flex justify="space-between" align="flex-start" gap="md" wrap="wrap">
          <Box>
            <Group gap="sm">
              <ThemeIcon variant="light" radius="xl" color="chatbox-brand">
                <IconChartLine size={18} />
              </ThemeIcon>
              <Title order={3}>算力实时行情</Title>
            </Group>
            <Text size="sm" c="dimmed" mt={6} maw={760}>
              {simulationMode
                ? '展示算力模型合约报价、供需、成交与价格趋势。'
                : '汇总全球 GPU 第三方参考价与 KOD 卡时市场真实库存、成交；不同计价单位分开展示。'}
            </Text>
          </Box>
          {enableFullscreen && (
            <Button variant="light" leftSection={<IconMaximize size={16} />} onClick={() => setFullScreen(true)}>
              全屏展示
            </Button>
          )}
        </Flex>
      </Paper>

      {!fullScreen && content}

      {enableFullscreen && (
        <Modal
          opened={fullScreen}
          onClose={() => setFullScreen(false)}
          fullScreen
          title="算力实时行情 · 全屏展示"
          styles={{
            content: { backgroundColor: 'var(--chatbox-background-secondary, var(--mantine-color-gray-0))' },
            body: { padding: 'var(--mantine-spacing-lg)' },
          }}
        >
          {content}
        </Modal>
      )}
    </Stack>
  )
}

function MarketDashboardContent({
  view,
  onViewChange,
  gpuModel,
  onGpuModelChange,
  range,
  onRangeChange,
  snapshot,
  quotes,
  chartPoints,
  latestError,
  latestLoading,
  latestFetching,
  historyLoading,
  historyError,
  cardStats,
  cardStatsError,
  cardStatsLoading,
  onRetryLatest,
  onRetryHistory,
  onRetryCardStats,
  enableAdvanced,
  simulationMode,
  liveRefreshMs,
  historyRefreshMs,
  inferenceContent,
}: {
  view: MarketView
  onViewChange: (value: MarketView) => void
  gpuModel: string
  onGpuModelChange: (value: string) => void
  range: MarketPriceRange
  onRangeChange: (value: MarketPriceRange) => void
  snapshot?: ComputeMarketPriceSnapshot
  quotes: ComputeMarketPriceQuote[]
  chartPoints: ComputeMarketPricePoint[]
  latestError: Error | null
  latestLoading: boolean
  latestFetching: boolean
  historyLoading: boolean
  historyError: Error | null
  cardStats?: PublicCardHourMarketStats
  cardStatsError: Error | null
  cardStatsLoading: boolean
  onRetryLatest: () => void
  onRetryHistory: () => void
  onRetryCardStats: () => void
  enableAdvanced: boolean
  simulationMode: boolean
  liveRefreshMs: number
  historyRefreshMs: number
  inferenceContent?: ReactNode
}) {
  return (
    <Tabs value={view} onChange={(value) => value && onViewChange(value as MarketView)} keepMounted>
      <Tabs.List>
        <Tabs.Tab value="gpu-reference" leftSection={<IconDatabase size={15} />}>
          {simulationMode ? '算力合约行情' : '全球 GPU 参考价'}
        </Tabs.Tab>
        <Tabs.Tab value="card-hours" leftSection={<IconStack2 size={15} />}>
          {simulationMode ? '市场供需与成交' : 'KOD 卡时行情'}
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="gpu-reference" pt="md">
        <GpuReferenceView
          gpuModel={gpuModel}
          onGpuModelChange={onGpuModelChange}
          range={range}
          onRangeChange={onRangeChange}
          snapshot={snapshot}
          quotes={quotes}
          chartPoints={chartPoints}
          error={latestError}
          loading={latestLoading}
          fetching={latestFetching}
          historyLoading={historyLoading}
          historyError={historyError}
          onRetry={onRetryLatest}
          onRetryHistory={onRetryHistory}
          enableAdvanced={enableAdvanced}
          simulationMode={simulationMode}
          liveRefreshMs={liveRefreshMs}
          historyRefreshMs={historyRefreshMs}
        />
        {inferenceContent}
      </Tabs.Panel>

      <Tabs.Panel value="card-hours" pt="md">
        <CardHourMarketView
          stats={cardStats}
          error={cardStatsError}
          loading={cardStatsLoading}
          onRetry={onRetryCardStats}
          enableAdvanced={enableAdvanced}
          simulationMode={simulationMode}
          historyRefreshMs={historyRefreshMs}
        />
      </Tabs.Panel>
    </Tabs>
  )
}

function MarketInferenceSection({
  gpuModel,
  contracts,
  selectedContractId,
  onContractChange,
  directoryLoading,
  directoryError,
  inference,
  inferenceLoading,
  inferenceError,
  refreshFailed,
  refreshing,
  onRefresh,
}: {
  gpuModel: string
  contracts: KaiMarketInferenceContract[]
  selectedContractId: string | null
  onContractChange: (contractId: string | null) => void
  directoryLoading: boolean
  directoryError: Error | null
  inference?: KaiMarketInferenceView
  inferenceLoading: boolean
  inferenceError: Error | null
  refreshFailed: boolean
  refreshing: boolean
  onRefresh: () => void | Promise<void>
}) {
  if (directoryLoading && contracts.length === 0) {
    return <InferenceStatusPanel title="正在加载预测合约" description="正在读取可用于 Kai AI 行情研判的真实合约。" />
  }

  if (directoryError && contracts.length === 0) {
    return <InferenceStatusPanel title="预测服务暂不可用" description="真实行情不受影响，请稍后重试。" tone="red" />
  }

  if (contracts.length === 0) {
    return (
      <InferenceStatusPanel
        title="当前 GPU 型号暂无可用预测合约"
        description={`${gpuModel} 的真实行情仍可正常查看。`}
      />
    )
  }

  const options = contracts.map((contract) => ({
    value: contract.contractId,
    label: contractLabel(contract),
  }))

  return (
    <Stack gap="md" mt="md">
      <Paper withBorder radius="lg" p="md">
        <Flex justify="space-between" align="end" gap="md" wrap="wrap">
          <Select
            label="预测合约"
            description="仅使用同源后端返回的真实合约；切换后不会改变行情报价。"
            data={options}
            value={selectedContractId}
            onChange={onContractChange}
            searchable
            clearable={false}
            w={{ base: '100%', sm: 480 }}
          />
          {selectedContractId && (
            <Text size="xs" c="dimmed" maw={520} style={{ overflowWrap: 'anywhere' }}>
              合约 ID {selectedContractId}
            </Text>
          )}
        </Flex>
      </Paper>

      {(directoryError || inferenceError || refreshFailed) && (
        <InferenceStatusPanel
          title="预测服务暂不可用"
          description={inference ? '已保留最近一次成功研判，真实行情不受影响。' : '真实行情不受影响，请稍后重试。'}
          tone="red"
          action={
            !inference && (inferenceError || refreshFailed) ? (
              <Button
                variant="light"
                color="red"
                size="xs"
                leftSection={<IconRefresh size={15} />}
                loading={refreshing}
                onClick={() => void onRefresh()}
              >
                重试预测
              </Button>
            ) : undefined
          }
        />
      )}

      {inference ? (
        <KaiMarketInferenceCard view={inference} onRefresh={onRefresh} refreshing={refreshing} />
      ) : inferenceLoading ? (
        <InferenceStatusPanel title="正在加载 Kai AI 行情研判" description="正在读取该合约最近一次服务端研判。" />
      ) : !inferenceError ? (
        <InferenceStatusPanel title="尚无预测结果" description="等待真实行情刷新后由后端判断是否生成研判。" />
      ) : null}
    </Stack>
  )
}

function InferenceStatusPanel({
  title,
  description,
  tone = 'teal',
  action,
}: {
  title: string
  description: string
  tone?: 'teal' | 'red'
  action?: ReactNode
}) {
  return (
    <Paper
      component="section"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      withBorder
      radius="lg"
      p="md"
      mt="md"
      bg={tone === 'red' ? 'var(--mantine-color-red-light)' : 'var(--mantine-color-teal-light)'}
    >
      <Group justify="space-between" align="center" gap="md" wrap="wrap">
        <Box>
          <Text fw={700} c={tone === 'red' ? 'red' : 'teal'}>
            {title}
          </Text>
          <Text size="sm" c="dimmed" mt={4}>
            {description}
          </Text>
        </Box>
        {action}
      </Group>
    </Paper>
  )
}

function contractLabel(contract: KaiMarketInferenceContract) {
  return `${contract.model} · ${contract.runtime} · ${contract.deliveryAt} · ${contract.status}`
}

function sameGpuModel(left: string, right: string) {
  return left.trim().toLocaleUpperCase('en-US') === right.trim().toLocaleUpperCase('en-US')
}

function GpuReferenceView({
  gpuModel,
  onGpuModelChange,
  range,
  onRangeChange,
  snapshot,
  quotes,
  chartPoints,
  error,
  loading,
  fetching,
  historyLoading,
  historyError,
  onRetry,
  onRetryHistory,
  enableAdvanced,
  simulationMode,
  liveRefreshMs,
  historyRefreshMs,
}: {
  gpuModel: string
  onGpuModelChange: (value: string) => void
  range: MarketPriceRange
  onRangeChange: (value: MarketPriceRange) => void
  snapshot?: ComputeMarketPriceSnapshot
  quotes: ComputeMarketPriceQuote[]
  chartPoints: ComputeMarketPricePoint[]
  error: Error | null
  loading: boolean
  fetching: boolean
  historyLoading: boolean
  historyError: Error | null
  onRetry: () => void
  onRetryHistory: () => void
  enableAdvanced: boolean
  simulationMode: boolean
  liveRefreshMs: number
  historyRefreshMs: number
}) {
  const availableQuotes = quotes.filter(hasPrice)
  const prices = availableQuotes
    .map((quote) => (simulationMode ? quote.priceCnyPerGpuHour : quote.priceUsdPerGpuHour))
    .filter((price): price is number => typeof price === 'number' && Number.isFinite(price) && price > 0)
  const summary = summarizeSeries(chartPoints, availableQuotes[0]?.source, simulationMode)
  const sampleSize = availableQuotes.reduce((total, quote) => total + (quote.sampleSize || 0), 0)
  const freshness = calculateMarketFreshness({ generatedAt: snapshot?.generatedAt })
  const freshnessState = freshnessDisplay(freshness)

  return (
    <Stack gap="md">
      {!simulationMode && (
        <Alert color="yellow" icon={<IconShieldCheck size={18} />} title="第三方参考行情">
          Vast.ai 与 Akamai 数据仅供跨平台比价，不能在 KOD 直接下单。无报价时显示“暂无报价”，不会以 0 元代替。
        </Alert>
      )}

      {error && (
        <Alert color="red" title="GPU 行情服务暂不可用" withCloseButton={false} icon={<IconRefresh size={18} />}>
          <Group justify="space-between" align="center" gap="sm">
            <Text size="sm">行情服务请求失败，请稍后重试。</Text>
            <Button variant="light" color="red" size="xs" onClick={onRetry}>
              手动重试
            </Button>
          </Group>
        </Alert>
      )}

      <Flex justify="space-between" align="end" gap="md" wrap="wrap">
        <Group align="end" gap="sm">
          <Select
            label="GPU 型号"
            data={snapshot?.trackedModels.length ? snapshot.trackedModels : ['H100', 'H200', 'A100', 'RTX 4090']}
            value={gpuModel}
            onChange={(value) => value && onGpuModelChange(value)}
            searchable
            w={220}
          />
          <Select
            label="时间范围"
            data={rangeOptions}
            value={range}
            onChange={(value) => value && onRangeChange(value as MarketPriceRange)}
            w={150}
          />
        </Group>
        <Group gap="xs">
          <Badge color={error ? 'red' : fetching ? 'yellow' : freshnessState.color} variant="light">
            {error ? '刷新失败' : fetching ? '同步中' : `${freshnessState.label} · ${liveRefreshMs / 1000} 秒`}
          </Badge>
          <Text size="xs" c="dimmed">
            更新时间：{formatDateTime(snapshot?.generatedAt)}
          </Text>
        </Group>
      </Flex>

      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md">
        <MetricCard
          label="当前最低参考价"
          value={prices.length ? `${simulationMode ? '¥' : '$'}${formatNumber(Math.min(...prices), 4)}` : '--'}
          suffix={simulationMode ? '/ 百万 Token' : '/ GPU·小时'}
        />
        <MetricCard
          label={`${rangeLabel(range)}变化`}
          value={
            summary.changePercent == null
              ? '--'
              : `${summary.changePercent >= 0 ? '+' : ''}${summary.changePercent.toFixed(2)}%`
          }
          tone={summary.changePercent == null ? 'neutral' : summary.changePercent >= 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          label={`${rangeLabel(range)}高 / 低`}
          value={
            summary.high == null
              ? '--'
              : `${simulationMode ? '¥' : '$'}${formatNumber(summary.high, 3)} / ${simulationMode ? '¥' : '$'}${formatNumber(summary.low, 3)}`
          }
        />
        <MetricCard label="可用来源 / 样本" value={`${availableQuotes.length} / ${sampleSize || '--'}`} />
      </SimpleGrid>

      {loading && !snapshot ? (
        <EmptyPanel title="正在加载 GPU 行情" description="正在连接行情服务并校验数据来源。" />
      ) : quotes.length === 0 ? (
        <EmptyPanel title="暂无可用报价" description="该型号当前没有第三方报价；请选择其他型号或稍后重试。" />
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {quotes.map((quote, index) => (
            <SourceQuoteCard
              key={`${quote.source}:${quote.gpuModel}`}
              quote={quote}
              refreshFailed={Boolean(error)}
              simulationMode={simulationMode}
              displayLabel={simulationMode ? simulatedContractLabel(quote.sourceLabel, index) : quote.sourceLabel}
            />
          ))}
        </SimpleGrid>
      )}

      <Paper withBorder radius="lg" p={{ base: 'md', sm: 'lg' }}>
        <Flex justify="space-between" align="flex-start" gap="sm" wrap="wrap" mb="md">
          <Box>
            <Title order={4}>
              {gpuModel} {simulationMode ? '合约' : ''}价格趋势
            </Title>
            <Text size="xs" c="dimmed">
              历史数据每 {historyRefreshMs / 1000} 秒校准；切换时间范围时重新获取完整序列。
            </Text>
          </Box>
          <Badge variant="outline" color="gray">
            {simulationMode ? SIMULATED_MARKET_DISPLAY_UNIT.priceLabel : 'USD / GPU·小时'}
          </Badge>
        </Flex>
        {historyError ? (
          <Alert color="red" title="历史行情暂不可用" icon={<IconRefresh size={18} />}>
            <Group justify="space-between" align="center" gap="sm">
              <Text size="sm">无法读取价格历史，请稍后重试。</Text>
              <Button variant="light" color="red" size="xs" onClick={onRetryHistory}>
                重试历史行情
              </Button>
            </Group>
          </Alert>
        ) : historyLoading && chartPoints.length === 0 ? (
          <EmptyPanel title="正在加载价格趋势" description="历史行情准备中。" compact />
        ) : (
          <MarketTrendChart points={chartPoints} simulationMode={simulationMode} />
        )}
      </Paper>

      {enableAdvanced && !simulationMode && (
        <AdvancedCapabilities availableSourceCount={availableQuotes.length} hasCompletedTrades={false} />
      )}
    </Stack>
  )
}

function SourceQuoteCard({
  quote,
  refreshFailed,
  simulationMode,
  displayLabel,
}: {
  quote: ComputeMarketPriceQuote
  refreshFailed: boolean
  simulationMode: boolean
  displayLabel: string
}) {
  const status = refreshFailed ? { label: '缓存数据', color: 'yellow' } : quoteStatus(quote)
  const available = hasPrice(quote)
  const trustedSource = isTrustedMarketSourceUrl(quote.sourceUrl)

  return (
    <Paper
      withBorder
      radius="lg"
      p="lg"
      style={{ backgroundColor: 'var(--chatbox-background-primary, var(--mantine-color-body))' }}
    >
      <Flex justify="space-between" align="flex-start" gap="md">
        <Box>
          <Text fw={700}>{displayLabel}</Text>
          <Text size="xs" c="dimmed">
            {simulationMode
              ? '算力模型合约报价'
              : quote.quoteType === 'MEDIAN_AVAILABLE'
                ? '当前可租实例中位价'
                : '官方公开起步小时标价'}
          </Text>
        </Box>
        <Badge color={status.color} variant="light">
          {status.label}
        </Badge>
      </Flex>

      {available ? (
        <Stack gap={4} mt="md">
          <Group gap={6} align="baseline">
            <Text size="2rem" fw={750}>
              {simulationMode ? '¥' : '$'}
              {formatNumber(simulationMode ? quote.priceCnyPerGpuHour : quote.priceUsdPerGpuHour, 4)}
            </Text>
            <Text size="sm" c="dimmed">
              {simulationMode ? '/ 百万 Token' : '/ GPU·小时'}
            </Text>
          </Group>
          {!simulationMode && (
            <Text size="sm">
              约 ¥{formatNumber(quote.priceCnyPerGpuHour, 4)} / GPU·小时
              {quote.cardHoursPerGpuHour == null ? '' : ` · ${formatNumber(quote.cardHoursPerGpuHour, 3)} 卡时`}
            </Text>
          )}
          <Group gap="md">
            <Text size="xs" c="dimmed">
              样本：{quote.sampleSize == null ? '不适用' : `${quote.sampleSize} 个`}
            </Text>
            <Text size="xs" c="dimmed">
              采样：{formatDateTime(quote.sampledAt)}
            </Text>
          </Group>
        </Stack>
      ) : (
        <Stack gap={3} mt="lg">
          <Text size="xl" fw={700} c="dimmed">
            暂无报价
          </Text>
          <Text size="xs" c="dimmed">
            该来源当前没有此型号的有效报价，请稍后重试。
          </Text>
        </Stack>
      )}

      {!simulationMode && (
        <Tooltip label={trustedSource ? '在系统浏览器中打开官方来源' : '来源域名未通过安全校验'}>
          <Box w="fit-content">
            <Button
              variant="subtle"
              size="xs"
              px={0}
              mt="sm"
              disabled={!trustedSource}
              rightSection={trustedSource ? <IconExternalLink size={14} /> : undefined}
              onClick={trustedSource ? () => void platform.openLink(quote.sourceUrl) : undefined}
            >
              {trustedSource ? '查看官方来源' : '来源链接不可用'}
            </Button>
          </Box>
        </Tooltip>
      )}
    </Paper>
  )
}

function CardHourMarketView({
  stats,
  error,
  loading,
  onRetry,
  enableAdvanced,
  simulationMode,
  historyRefreshMs,
}: {
  stats?: PublicCardHourMarketStats
  error: Error | null
  loading: boolean
  onRetry: () => void
  enableAdvanced: boolean
  simulationMode: boolean
  historyRefreshMs: number
}) {
  const tradeSummary = useMemo(() => summarizeCompletedCardHourTrades(stats?.recentTrades || []), [stats?.recentTrades])
  const completedTrades = tradeSummary.completedTrades

  return (
    <Stack gap="md">
      {!simulationMode && (
        <Alert color="blue" icon={<IconShieldCheck size={18} />} title="KOD 平台真实卡时行情">
          库存与成交均来自 KOD 卡时市场。成交列表不展示交易双方身份，也不推断不存在的买卖方向。
        </Alert>
      )}

      {error && (
        <Alert color="red" title="卡时行情暂不可用" icon={<IconRefresh size={18} />}>
          <Group justify="space-between" align="center" gap="sm">
            <Text size="sm">无法读取卡时市场数据，请稍后重试。</Text>
            <Button variant="light" color="red" size="xs" onClick={onRetry}>
              手动重试
            </Button>
          </Group>
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, xs: 2, lg: enableAdvanced ? 4 : 3 }} spacing="md">
        <MetricCard
          label={simulationMode ? '合约总供给' : '标准卡时可售库存'}
          value={formatMarketQuantity(stats?.standardInventory, simulationMode)}
        />
        <MetricCard
          label={simulationMode ? '当前可用供给' : '指定 GPU 卡时库存'}
          value={formatMarketQuantity(stats?.specificInventory, simulationMode)}
        />
        <MetricCard
          label={simulationMode ? '近 24 小时成交量' : '近 24 小时成交'}
          value={formatMarketQuantity(stats?.volume24h, simulationMode)}
        />
        {enableAdvanced && <MetricCard label="近期已完成成交" value={stats ? `${completedTrades.length} 笔` : '--'} />}
      </SimpleGrid>

      {enableAdvanced && (
        <>
          <Paper withBorder radius="lg" p={{ base: 'md', sm: 'lg' }}>
            <Flex justify="space-between" align="center" gap="sm" wrap="wrap" mb="md">
              <Box>
                <Title order={4}>近期成交</Title>
                <Text size="xs" c="dimmed">
                  仅呈现公开脱敏、状态为已完成且数值有效的成交。
                </Text>
              </Box>
              <Badge color={error ? 'red' : loading ? 'yellow' : 'green'} variant="light">
                {error ? '读取失败' : loading ? '同步中' : `每 ${historyRefreshMs / 1000} 秒更新`}
              </Badge>
            </Flex>

            {loading && !stats ? (
              <EmptyPanel
                title={simulationMode ? '正在加载供需行情' : '正在加载卡时行情'}
                description={simulationMode ? '正在读取库存和成交。' : '正在读取真实库存和成交。'}
                compact
              />
            ) : completedTrades.length === 0 ? (
              <EmptyPanel
                title="当前暂无已完成成交"
                description={
                  simulationMode ? '当前尚未形成已完成成交。' : '库存可以真实为 0；缺失的价格和成交不会被模拟数据替代。'
                }
                compact
              />
            ) : (
              <CompletedTradesTable trades={completedTrades} simulationMode={simulationMode} />
            )}
          </Paper>

          {!simulationMode && (
            <AdvancedCapabilities availableSourceCount={0} hasCompletedTrades={completedTrades.length > 0} />
          )}
        </>
      )}
    </Stack>
  )
}

function CompletedTradesTable({ trades, simulationMode }: { trades: PublicCardHourTrade[]; simulationMode: boolean }) {
  return (
    <ScrollArea>
      <Table verticalSpacing="sm" miw={680} highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>完成时间</Table.Th>
            <Table.Th>资产类型</Table.Th>
            <Table.Th>GPU 型号</Table.Th>
            <Table.Th ta="right">成交数量{simulationMode ? '（百万 Token）' : ''}</Table.Th>
            <Table.Th ta="right">成交单价{simulationMode ? '（CNY/百万 Token）' : ''}</Table.Th>
            <Table.Th ta="right">成交金额</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {trades.map((trade) => (
            <Table.Tr key={trade.id}>
              <Table.Td>{formatDateTime(trade.completedAt)}</Table.Td>
              <Table.Td>
                {simulationMode ? '算力合约' : trade.assetType === 'STANDARD' ? '标准卡时' : '指定 GPU 卡时'}
              </Table.Td>
              <Table.Td>{trade.gpuModel || '通用'}</Table.Td>
              <Table.Td ta="right">{formatMarketQuantity(trade.quantity, simulationMode)}</Table.Td>
              <Table.Td ta="right">{formatTradePrice(trade.unitPrice, trade.priceCurrency)}</Table.Td>
              <Table.Td ta="right">{formatTradePrice(trade.totalPrice, trade.priceCurrency)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  )
}

function AdvancedCapabilities({
  availableSourceCount,
  hasCompletedTrades,
}: {
  availableSourceCount: number
  hasCompletedTrades: boolean
}) {
  const gates = evaluateMarketCapabilities({
    trades: { provenance: 'REAL', count: hasCompletedTrades ? 1 : 0 },
  })
  const capabilities = [
    {
      title: '同型号来源比价',
      description: '至少两个可信来源同时提供同型号、同单位的有效报价。',
      ready: availableSourceCount >= 2,
    },
    {
      title: '真实成交分析',
      description: '仅在存在已完成的 KOD 卡时成交时开放成交统计。',
      ready: gates.p2.recentTrades.enabled,
    },
    {
      title: '供应深度与多合约比较',
      description: '等待接入真实挂牌、可比标的与至少两个有效交付期限。',
      ready: false,
    },
    {
      title: '标准合约能力',
      description: '仅在真实双边订单、撮合、持仓、风控及结算全部具备后开放。',
      ready: false,
    },
  ]

  return (
    <Paper withBorder radius="lg" p={{ base: 'md', sm: 'lg' }}>
      <Group gap="sm" mb="xs">
        <IconArrowsExchange size={18} />
        <Title order={4}>高级行情能力</Title>
      </Group>
      <Text size="xs" c="dimmed" mb="md">
        组件只在真实性条件满足时标记可用；不会渲染模拟盘口、假期货按钮或虚构期限结构。
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        {capabilities.map((item) => (
          <Paper
            key={item.title}
            withBorder
            radius="md"
            p="md"
            style={{ backgroundColor: 'var(--chatbox-background-secondary, var(--mantine-color-gray-0))' }}
          >
            <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
              <Box>
                <Text fw={650} size="sm">
                  {item.title}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {item.description}
                </Text>
              </Box>
              <Badge color={item.ready ? 'green' : 'gray'} variant="light" style={{ flexShrink: 0 }}>
                {item.ready ? '条件满足' : '待接入'}
              </Badge>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>
    </Paper>
  )
}

function MetricCard({
  label,
  value,
  suffix,
  tone = 'neutral',
}: {
  label: string
  value: string
  suffix?: string
  tone?: 'neutral' | 'positive' | 'negative'
}) {
  const color = tone === 'positive' ? 'green' : tone === 'negative' ? 'red' : undefined
  return (
    <Paper
      withBorder
      radius="lg"
      p="md"
      style={{ backgroundColor: 'var(--chatbox-background-primary, var(--mantine-color-body))' }}
    >
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Group gap={6} align="baseline" mt={5} wrap="nowrap">
        <Text fw={750} size="xl" c={color} truncate>
          {value}
        </Text>
        {suffix && (
          <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
            {suffix}
          </Text>
        )}
      </Group>
    </Paper>
  )
}

function MarketTrendChart({ points, simulationMode }: { points: ComputeMarketPricePoint[]; simulationMode: boolean }) {
  const width = 960
  const height = 300
  const padding = { left: 64, right: 24, top: 20, bottom: 42 }
  const valid = points
    .map((point) => ({
      ...point,
      timestamp: new Date(point.sampledAt).getTime(),
      displayPrice: simulationMode ? point.priceCnyPerGpuHour : point.priceUsdPerGpuHour,
    }))
    .filter(
      (
        point
      ): point is ComputeMarketPricePoint & {
        timestamp: number
        displayPrice: number
      } =>
        Number.isFinite(point.timestamp) &&
        typeof point.displayPrice === 'number' &&
        Number.isFinite(point.displayPrice) &&
        point.displayPrice > 0
    )

  if (valid.length === 0) {
    return (
      <EmptyPanel
        title={simulationMode ? '正在积累行情' : '正在积累真实行情'}
        description={
          simulationMode ? '收到有效报价后将绘制价格趋势。' : '收到有效报价后才会绘制趋势，不使用模拟数据补线。'
        }
        compact
      />
    )
  }

  const timestamps = valid.map((point) => point.timestamp)
  const prices = valid.map((point) => point.displayPrice)
  const minTime = Math.min(...timestamps)
  const maxTime = Math.max(...timestamps)
  const rawMin = Math.min(...prices)
  const rawMax = Math.max(...prices)
  const yPadding = Math.max((rawMax - rawMin) * 0.12, rawMax * 0.03, 0.01)
  const minPrice = Math.max(0, rawMin - yPadding)
  const maxPrice = rawMax + yPadding
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const x = (value: number) => padding.left + ((value - minTime) / Math.max(1, maxTime - minTime)) * plotWidth
  const y = (value: number) =>
    padding.top + (1 - (value - minPrice) / Math.max(0.000001, maxPrice - minPrice)) * plotHeight
  const sources = [...new Set(valid.map((point) => point.source))]
  const colors = ['var(--chatbox-tint-brand, #5b5bd6)', 'var(--chatbox-tint-success, #2f9e44)', '#868e96']
  const gridValues = Array.from({ length: 5 }, (_, index) => minPrice + ((maxPrice - minPrice) * index) / 4)

  return (
    <Box style={{ width: '100%', overflow: 'hidden' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={simulationMode ? '算力合约人民币每百万 Token 价格趋势图' : 'GPU 美元每小时价格趋势图'}
        style={{ display: 'block', width: '100%', minHeight: 180 }}
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(value)}
              y2={y(value)}
              stroke="var(--chatbox-border-secondary, #dee2e6)"
              strokeDasharray="4 5"
            />
            <text
              x={padding.left - 10}
              y={y(value) + 4}
              textAnchor="end"
              fontSize="11"
              fill="currentColor"
              opacity="0.62"
            >
              {simulationMode ? '¥' : '$'}
              {value.toFixed(2)}
            </text>
          </g>
        ))}
        {sources.map((source, index) => {
          const series = downsampleChartPoints(
            valid.filter((point) => point.source === source).sort((a, b) => a.timestamp - b.timestamp)
          )
          const polyline = series.map((point) => `${x(point.timestamp)},${y(point.displayPrice)}`).join(' ')
          return (
            <g key={source}>
              <polyline
                fill="none"
                stroke={colors[index % colors.length]}
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={polyline}
              />
              {series.map((point) => (
                <circle
                  key={`${source}:${point.sampledAt}`}
                  cx={x(point.timestamp)}
                  cy={y(point.displayPrice)}
                  r="3"
                  fill={colors[index % colors.length]}
                >
                  <title>{`${point.gpuModel} · ${simulationMode ? '¥' : '$'}${point.displayPrice.toFixed(4)} · ${formatDateTime(point.sampledAt)}`}</title>
                </circle>
              ))}
            </g>
          )
        })}
        <text x={padding.left} y={height - 12} fontSize="11" fill="currentColor" opacity="0.62">
          {formatChartTime(minTime)}
        </text>
        <text
          x={width - padding.right}
          y={height - 12}
          textAnchor="end"
          fontSize="11"
          fill="currentColor"
          opacity="0.62"
        >
          {formatChartTime(maxTime)}
        </text>
      </svg>
      <Group gap="md" justify="center" mt="xs">
        {sources.map((source, index) => (
          <Group key={source} gap={6}>
            <Box w={18} h={3} style={{ borderRadius: 3, backgroundColor: colors[index % colors.length] }} />
            <Text size="xs">{simulationMode ? `合约 ${index + 1}` : sourceLabel(source)}</Text>
          </Group>
        ))}
      </Group>
    </Box>
  )
}

function EmptyPanel({
  title,
  description,
  compact = false,
}: {
  title: string
  description: string
  compact?: boolean
}) {
  return (
    <Stack align="center" justify="center" gap={5} py={compact ? 'lg' : 42} ta="center">
      <ThemeIcon variant="light" color="gray" radius="xl">
        <IconClock size={17} />
      </ThemeIcon>
      <Text fw={650} size="sm">
        {title}
      </Text>
      <Text size="xs" c="dimmed" maw={480}>
        {description}
      </Text>
    </Stack>
  )
}

function backgroundAwareInterval(interval: number) {
  return typeof document !== 'undefined' && document.hidden ? false : interval
}

function mergeHistoryAndLive(history: ComputeMarketPriceHistory | undefined, quotes: ComputeMarketPriceQuote[]) {
  return quotes.reduce(
    (points, quote) => mergeMarketHistoryWithLatest(points, quote),
    mergeMarketHistoryWithLatest(history?.points || [])
  )
}

function summarizeSeries(points: ComputeMarketPricePoint[], source: string | undefined, simulationMode: boolean) {
  const series = points
    .filter((point) => !source || point.source === source)
    .sort((a, b) => new Date(a.sampledAt).getTime() - new Date(b.sampledAt).getTime())
  if (series.length === 0) return { high: null, low: null, changePercent: null }
  const prices = series
    .map((point) => (simulationMode ? point.priceCnyPerGpuHour : point.priceUsdPerGpuHour))
    .filter((price): price is number => typeof price === 'number' && Number.isFinite(price) && price > 0)
  if (prices.length === 0) return { high: null, low: null, changePercent: null }
  const first = prices[0]
  const last = prices.at(-1)
  if (first === undefined || last === undefined) return { high: null, low: null, changePercent: null }
  return {
    high: Math.max(...prices),
    low: Math.min(...prices),
    changePercent: first > 0 ? ((last - first) / first) * 100 : null,
  }
}

function hasPrice(quote: ComputeMarketPriceQuote): quote is ComputeMarketPriceQuote & { priceUsdPerGpuHour: number } {
  return (
    (quote.status === 'OK' || quote.status === 'STALE') &&
    Number.isFinite(quote.priceUsdPerGpuHour) &&
    (quote.priceUsdPerGpuHour ?? 0) > 0
  )
}

function quoteStatus(quote: ComputeMarketPriceQuote) {
  switch (quote.status) {
    case 'OK':
      return { label: '数据正常', color: 'green' }
    case 'STALE':
      return { label: '数据延迟', color: 'yellow' }
    case 'UNAVAILABLE':
      return { label: '来源异常', color: 'red' }
    case 'UNCONFIGURED':
      return { label: '未配置', color: 'orange' }
    default:
      return { label: '暂无该型号', color: 'gray' }
  }
}

function freshnessDisplay(freshness: ReturnType<typeof calculateMarketFreshness>) {
  switch (freshness) {
    case 'FRESH':
      return { label: '数据实时', color: 'green' }
    case 'STALE':
      return { label: '数据延迟', color: 'yellow' }
    case 'BLOCKED':
      return { label: '数据已阻断', color: 'red' }
    default:
      return { label: '状态未知', color: 'gray' }
  }
}

function sourceLabel(source: ComputeMarketPricePoint['source']) {
  return source === 'VAST_AI' ? 'Vast.ai' : source === 'AKAMAI' ? 'Akamai' : source
}

function simulatedContractLabel(label: string, index: number) {
  const suffix = label.match(/^合约\s+\d+\s*·\s*(.+)$/)?.[1]?.trim()
  return `合约 ${index + 1}${suffix ? ` · ${suffix}` : ''}`
}

function formatNumber(value: number | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return '--'
  return value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function formatMarketQuantity(value: number | undefined, simulationMode: boolean) {
  if (value == null || !Number.isFinite(value)) return '--'
  return `${value.toLocaleString('zh-CN', { maximumFractionDigits: 3 })} ${
    simulationMode ? SIMULATED_MARKET_DISPLAY_UNIT.quantityLabel : '卡时'
  }`
}

function formatTradePrice(value: number, currency: PublicCardHourTrade['priceCurrency']) {
  const formatted = value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return currency === 'CNY' ? `¥${formatted}` : `${formatted} 标准卡时`
}

function downsampleChartPoints<T>(points: T[], maxPoints = 600) {
  if (points.length <= maxPoints) return points
  const lastIndex = points.length - 1
  return Array.from({ length: maxPoints }, (_, index) => points[Math.round((index * lastIndex) / (maxPoints - 1))])
}

function formatDateTime(value?: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '--'
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatChartTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function rangeLabel(range: MarketPriceRange) {
  return rangeOptions.find((item) => item.value === range)?.label.replace('近 ', '') || range
}

export default MarketIntelligencePanel
