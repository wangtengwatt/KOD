import { Alert, Badge, Button, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconBrain, IconRefresh, IconShieldCheck } from '@tabler/icons-react'
import { useId } from 'react'
import type {
  KaiMarketInferenceView,
  KaiMarketPipeline,
  KaiMarketVerification,
} from '@/packages/compute-market/kaiInference'

export interface KaiMarketInferenceCardProps {
  view: KaiMarketInferenceView
  onRefresh: () => void | Promise<void>
  refreshing?: boolean
}

export function KaiMarketInferenceCard({ view, onRefresh, refreshing = false }: KaiMarketInferenceCardProps) {
  const titleId = useId()
  const lastSuccess = view.lastSuccess
  const status = statusDisplay(view.status)
  const unavailable = view.status === 'UNAVAILABLE'

  return (
    <Paper
      component="section"
      aria-labelledby={titleId}
      withBorder
      radius="lg"
      p={{ base: 'md', sm: 'lg' }}
      style={{ backgroundColor: 'var(--chatbox-background-primary, var(--mantine-color-body))' }}
    >
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
          <div>
            <Group gap="sm">
              <ThemeIcon variant="light" radius="xl" color="teal">
                <IconBrain size={18} />
              </ThemeIcon>
              <Title id={titleId} order={4}>
                Kai AI 行情研判
              </Title>
            </Group>
            <Group
              role="status"
              aria-label="研判状态"
              aria-live="polite"
              aria-atomic="true"
              gap="xs"
              mt={6}
              wrap="wrap"
            >
              <Badge color={status.color} variant="light">
                {status.label}
              </Badge>
              <Text size="sm" c="dimmed">
                {status.description}
              </Text>
            </Group>
          </div>
          <Button
            variant="light"
            color="teal"
            size="xs"
            leftSection={<IconRefresh size={15} />}
            loading={refreshing}
            onClick={() => void onRefresh()}
          >
            {unavailable ? '重试预测' : '重新研判'}
          </Button>
        </Group>

        <Paper component="aside" role="note" withBorder radius="md" p="sm" bg="var(--mantine-color-teal-light)">
          <Group gap="sm" align="flex-start" wrap="nowrap">
            <ThemeIcon variant="transparent" color="teal" size="sm" aria-hidden="true">
              <IconShieldCheck size={18} />
            </ThemeIcon>
            <Text size="sm">AI 研判仅作行情参考，不构成交易建议；模型不会替你下单或执行交易。</Text>
          </Group>
        </Paper>

        <SimpleGrid cols={{ base: 1, sm: lastSuccess ? 2 : 1 }}>
          {lastSuccess && (
            <Timestamp label={unavailable ? '上次成功时间' : '生成时间'} value={lastSuccess.generatedAt} />
          )}
          <Timestamp label="检查时间" value={view.checkedAt} />
        </SimpleGrid>

        {unavailable && (
          <Alert color="red" title="预测服务暂不可用" icon={<IconRefresh size={18} />}>
            {lastSuccess ? '已保留上一次成功预测' : '尚无可显示的预测结果。'}
          </Alert>
        )}

        {lastSuccess ? (
          <>
            <PredictionPanel success={lastSuccess} />
            <PipelinePanel pipeline={lastSuccess.pipeline} />
            <VerificationPanel verification={view.verification} />
          </>
        ) : (
          !unavailable && <Text c="dimmed">尚无可显示的预测结果。</Text>
        )}
      </Stack>
    </Paper>
  )
}

function PredictionPanel({ success }: { success: NonNullable<KaiMarketInferenceView['lastSuccess']> }) {
  const event = success.prediction.nextEvent
  return (
    <Paper component="section" aria-label="模型预测结果" withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" gap="sm" wrap="wrap">
          <Text fw={700}>模型预测结果</Text>
          <Badge color="teal" variant="outline">
            {success.prediction.model}
          </Badge>
        </Group>
        <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {success.prediction.text}
        </Text>
        <Paper withBorder radius="sm" p="sm" bg="var(--mantine-color-teal-light)">
          <Text size="xs" fw={700} c="teal">
            模型预测下一事件
          </Text>
          {event ? (
            <Text size="sm" mt={4}>
              dt_ns {event.dtNs} · {event.side} · 价格 {event.price} · 数量 {event.quantity}
            </Text>
          ) : (
            <Text size="sm" c="dimmed" mt={4}>
              模型未返回可结构化的下一事件。
            </Text>
          )}
        </Paper>
      </Stack>
    </Paper>
  )
}

function PipelinePanel({ pipeline }: { pipeline: KaiMarketPipeline | null }) {
  if (!pipeline) return null
  if (pipeline.status !== 'AVAILABLE') {
    const insufficientOrderBook = pipeline.status === 'INSUFFICIENT_ORDER_BOOK'
    return (
      <Alert color={insufficientOrderBook ? 'yellow' : 'red'}>
        {insufficientOrderBook ? '真实订单簿数据不足，未生成风险分析' : '风险分析服务暂不可用'}
      </Alert>
    )
  }
  return (
    <Paper component="section" aria-label="真实订单簿风险分析" withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" gap="sm" wrap="wrap">
          <Text fw={700}>真实订单簿风险分析</Text>
          <Group gap="xs">
            <Badge color="green" variant="light">
              真实订单簿已确认
            </Badge>
            <Badge color="teal" variant="outline">
              {pipeline.model}
            </Badge>
          </Group>
        </Group>
        <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {pipeline.text}
        </Text>
      </Stack>
    </Paper>
  )
}

function VerificationPanel({ verification }: { verification: KaiMarketVerification | null }) {
  if (!verification) {
    return (
      <Paper component="section" aria-label="真实成交核验" withBorder radius="md" p="md">
        <div role="status" aria-label="真实成交核验状态" aria-live="polite" aria-atomic="true">
          <Text fw={700}>真实成交核验</Text>
          <Text size="sm" c="dimmed" mt={4}>
            尚无真实成交核验结果。
          </Text>
        </div>
      </Paper>
    )
  }
  if (verification.status === 'PENDING') {
    return (
      <Paper component="section" aria-label="真实成交核验" withBorder radius="md" p="md">
        <div role="status" aria-label="真实成交核验状态" aria-live="polite" aria-atomic="true">
          <Text fw={700}>真实成交核验</Text>
          <Text size="sm" c="dimmed" mt={4}>
            等待下一笔真实成交核验
          </Text>
        </div>
      </Paper>
    )
  }

  const heading =
    verification.status === 'MATCHED'
      ? '真实成交核验：已命中'
      : verification.status === 'MISSED'
        ? '真实成交核验：未命中'
        : '真实成交已到达，模型输出无法核验'
  return (
    <Paper component="section" aria-label="真实成交核验" withBorder radius="md" p="md">
      <Stack role="status" aria-label="真实成交核验状态" aria-live="polite" aria-atomic="true" gap="xs">
        <Group justify="space-between" gap="sm" wrap="wrap">
          <Text fw={700}>{heading}</Text>
          <Badge
            color={verification.status === 'MATCHED' ? 'green' : verification.status === 'MISSED' ? 'red' : 'yellow'}
            variant="light"
          >
            {verification.status}
          </Badge>
        </Group>
        <Text size="sm">
          真实成交 {verification.actualTradeId} · {verification.actualSide} · 价格 {verification.actualPrice} · 数量{' '}
          {verification.actualQuantity}
        </Text>
        <Timestamp label="真实成交时间" value={verification.actualAt} />
        {verification.status !== 'UNVERIFIABLE' && (
          <Text size="sm" c="dimmed">
            方向{verification.directionMatched ? '一致' : '不一致'} · 价格误差 {verification.priceError}
          </Text>
        )}
      </Stack>
    </Paper>
  )
}

function Timestamp({ label, value }: { label: string; value: string }) {
  return (
    <Text size="xs" c="dimmed">
      <Text component="span" inherit fw={600}>
        {label}
      </Text>{' '}
      <time dateTime={value}>{value}</time>
    </Text>
  )
}

function statusDisplay(status: KaiMarketInferenceView['status']) {
  if (status === 'FRESH') {
    return { color: 'green', label: '最新预测', description: '实时成交序列已变化' }
  }
  if (status === 'CACHED') {
    return { color: 'teal', label: '缓存预测', description: '当前展示最近一次成功研判' }
  }
  return { color: 'red', label: '服务异常', description: '本次刷新失败，行情报价不受影响' }
}
