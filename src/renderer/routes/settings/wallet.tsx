import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Flex,
  Group,
  Loader,
  NumberInput,
  Pagination,
  Radio,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { IconRefresh, IconWallet } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { walletApi } from '@/api/wallet'
import { GpuExchangeButton } from '@/components/wallet/GpuExchangeButton'
import { useWallet, walletKeys } from '@/hooks/useWallet'
import { navigateToSettings } from '@/modals/Settings'
import platform from '@/platform'
import {
  calculateDiscount,
  formatCardTime,
  formatCny,
  formatRmbFromCardTime,
  formatTopupStatus,
  paymentMethodName,
  rmbToCardTime,
} from '@/utils/wallet.utils'

export const Route = createFileRoute('/settings/wallet')({ component: RouteComponent })
const pageSize = 10
const message = (error: unknown) => (error instanceof Error ? error.message : '请求失败')
const statusColor = (status: string) =>
  status === 'success'
    ? 'green'
    : status === 'pending'
      ? 'yellow'
      : status === 'expired'
        ? 'gray'
        : status === 'failed'
          ? 'red'
          : 'gray'

export function RouteComponent() {
  const [page, setPage] = useState(1)
  const { identity, apiHost, info, balance, cardTimeAccount, history, amount, pay, refresh } = useWallet(page, pageSize)
  const [recordTab, setRecordTab] = useState<'topup' | 'consume'>('topup')
  const [consumePage, setConsumePage] = useState(1)
  const consumeHistory = useQuery({
    queryKey: walletKeys.consumeHistory(identity ?? 'signed-out', consumePage, pageSize),
    queryFn: () => walletApi.getConsumeHistory(consumePage, pageSize),
    enabled: identity !== null && recordTab === 'consume',
    retry: 1,
  })
  const [selectedAmount, setSelectedAmount] = useState<number | string>('')
  const [methodType, setMethodType] = useState('')
  const [paymentNotice, setPaymentNotice] = useState<'opened' | 'open-failed' | null>(null)
  const [refreshingAfterPayment, setRefreshingAfterPayment] = useState(false)
  const amountRequest = useRef(0)
  const methods = info.data?.payMethods ?? []
  useEffect(() => {
    if (!methodType && methods[0]) setMethodType(methods[0].type)
  }, [methodType, methods])
  useEffect(() => {
    if (selectedAmount === '' && info.data?.amountOptions[0]) setSelectedAmount(info.data.amountOptions[0])
  }, [selectedAmount, info.data])
  const method = methods.find((item) => item.type === methodType)
  useEffect(() => {
    if (!history.data || history.error) return
    const totalPages = Math.max(1, Math.ceil(history.data.total / history.data.pageSize))
    const responsePage = Math.min(history.data.page, totalPages)
    if (page !== responsePage) setPage(responsePage)
  }, [history.data, history.error, page])
  const numericAmount = Number(selectedAmount)
  const minimum = Math.max(info.data?.minTopup ?? 1, method?.minTopup ?? 0)
  const validAmount = Number.isInteger(numericAmount) && numericAmount > 0 && numericAmount >= minimum
  const discount = useMemo(
    () => (validAmount && amount.data != null ? calculateDiscount(numericAmount, amount.data) : null),
    [amount.data, numericAmount, validAmount]
  )
  useEffect(() => {
    amountRequest.current += 1
    const requestId = amountRequest.current
    if (!validAmount) {
      amount.reset()
      return
    }
    const timer = window.setTimeout(async () => {
      await amount.mutateAsync(numericAmount).catch(() => undefined)
      if (requestId !== amountRequest.current || Number(selectedAmount) !== numericAmount) amount.reset()
    }, 300)
    return () => window.clearTimeout(timer)
  }, [amount.mutateAsync, amount.reset, numericAmount, selectedAmount, validAmount])
  if (!identity)
    return (
      <Stack p="xl" align="flex-start">
        <IconWallet size={40} />
        <Stack gap={0}>
          <Title order={3}>钱包</Title>
          <Text size="xs" c="kod-tertiary">
            服务：{apiHost}
          </Text>
        </Stack>
        <Text c="kod-tertiary">登录 Kod 账户后可查看余额、充值和交易记录。</Text>
        <Button onClick={() => navigateToSettings('kod-ai')}>前往登录</Button>
      </Stack>
    )
  const disabled = !info.data?.enableOnlineTopup || !validAmount || !method || pay.isPending
  const submit = async () => {
    if (disabled || !method) return
    let result: Awaited<ReturnType<typeof pay.mutateAsync>>
    try {
      result = await pay.mutateAsync({ amount: numericAmount, paymentMethod: method.type })
    } catch (error) {
      toast.error(`创建支付订单失败：${message(error)}`)
      return
    }
    try {
      await platform.openPaymentUrl(result.paymentUrl)
      setPaymentNotice('opened')
      toast.success('支付页已打开，请在浏览器中完成支付')
    } catch {
      setPaymentNotice('open-failed')
      toast.error('订单已创建，但支付页打开失败，请勿重复下单')
    }
  }
  const refreshAfterPayment = async () => {
    setRefreshingAfterPayment(true)
    try {
      await refresh()
      toast.success('余额和充值记录已刷新')
    } finally {
      setRefreshingAfterPayment(false)
    }
  }
  return (
    <Stack p="md" gap="lg">
      <Group justify="space-between">
        <Stack gap={0}>
          <Title order={3}>钱包</Title>
          <Text size="xs" c="kod-tertiary">
            服务：{apiHost}
          </Text>
        </Stack>
        <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={() => void refresh()}>
          刷新余额和记录
        </Button>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Card withBorder>
          <Text c="kod-tertiary">余额</Text>
          {balance.isLoading ? (
            <Loader size="sm" />
          ) : balance.error ? (
            <Alert color="red">{message(balance.error)}</Alert>
          ) : (
            <Title order={2}>{formatCny(balance.data?.balance)}</Title>
          )}
          {balance.data && (
            <Text size="sm" c="kod-tertiary">
              ≈ {formatCardTime(rmbToCardTime(balance.data.balance))}
            </Text>
          )}
        </Card>
        <Card withBorder>
          <Text c="kod-tertiary">历史消费</Text>
          {balance.isLoading ? (
            <Loader size="sm" />
          ) : balance.error ? (
            <Alert color="red">历史消费暂不可用</Alert>
          ) : (
            <Title order={2}>{formatCny(balance.data?.historicalConsumption)}</Title>
          )}
        </Card>
        <Card withBorder>
          <Text c="kod-tertiary">卡时余额</Text>
          {cardTimeAccount.isLoading ? (
            <Loader size="sm" />
          ) : cardTimeAccount.error ? (
            <Text c="red" size="sm">
              卡时余额暂不可用
            </Text>
          ) : (
            <Stack gap={0}>
              <Title order={2}>{formatCardTime(cardTimeAccount.data?.availableCardHours)}</Title>
              <Text size="sm" c="kod-tertiary">
                ≈ {formatRmbFromCardTime(cardTimeAccount.data?.availableCardHours ?? 0)}
              </Text>
            </Stack>
          )}
        </Card>
      </SimpleGrid>

      <Group justify="flex-end">
        <GpuExchangeButton availableCardHours={cardTimeAccount.data?.availableCardHours ?? 0} />
      </Group>
      <Card withBorder>
        <Stack>
          <Title order={4}>充值</Title>
          {info.data?.discount && (
            <Alert color="orange" title="充值优惠">
              当前充值档位享受优惠，实际支付金额以服务端计算结果为准。
            </Alert>
          )}
          {info.isLoading && <Loader size="sm" />}
          {info.error && (
            <Alert color="red" title="充值配置加载失败">
              {message(info.error)}
              <Button mt="xs" size="xs" onClick={() => void info.refetch()}>
                重试
              </Button>
            </Alert>
          )}
          {info.data && !info.data.enableOnlineTopup && <Alert color="yellow">在线充值暂未开放。</Alert>}
          {info.data?.enableOnlineTopup && (
            <>
              <Group wrap="wrap">
                {info.data.amountOptions.map((value) => (
                  <Button
                    key={value}
                    variant={selectedAmount === value ? 'filled' : 'light'}
                    onClick={() => setSelectedAmount(value)}
                  >
                    {formatCardTime(value)}
                  </Button>
                ))}
              </Group>
              <NumberInput
                label="卡时数量"
                description={`1 卡时 = 1.002 RMB，当前最低 ${formatCardTime(minimum)}`}
                min={1}
                step={1}
                allowDecimal={false}
                value={selectedAmount}
                onChange={setSelectedAmount}
              />
              {!validAmount && selectedAmount !== '' && (
                <Text c="red" size="sm">
                  请输入不低于 {formatCardTime(minimum)} 的正整数。
                </Text>
              )}
              <Radio.Group label="支付方式" value={methodType} onChange={setMethodType}>
                <Stack mt="xs">
                  {methods.map((item) => (
                    <Radio
                      key={item.type}
                      value={item.type}
                      label={`${paymentMethodName(item.type, item.name)}${item.minTopup ? `（最低 ${formatCardTime(item.minTopup)}）` : ''}`}
                    />
                  ))}
                </Stack>
              </Radio.Group>
              <Text>
                实付金额：
                {amount.isPending ? (
                  '计算中…'
                ) : amount.error ? (
                  <Text span c="red">
                    {message(amount.error)}
                  </Text>
                ) : discount ? (
                  <>
                    {formatCny(discount.actual)}（优惠 {Math.round(discount.rate * 100)}%，节省{' '}
                    {formatCny(discount.saved)}）
                  </>
                ) : (
                  '—'
                )}
              </Text>
              <Text size="sm" c="kod-tertiary">
                点击后将在系统浏览器打开支付页面，请完成支付后返回 Kod。
              </Text>
              <Button
                loading={pay.isPending}
                disabled={disabled || amount.isPending || !!amount.error}
                onClick={() => void submit()}
              >
                在系统浏览器打开支付页
              </Button>
            </>
          )}
        </Stack>
      </Card>
      {paymentNotice && (
        <Alert
          color={paymentNotice === 'open-failed' ? 'red' : 'blue'}
          title={paymentNotice === 'open-failed' ? '订单已创建，但支付页打开失败' : '请确认支付状态'}
          withCloseButton
          onClose={() => setPaymentNotice(null)}
        >
          <Stack gap="xs">
            <Text>
              {paymentNotice === 'open-failed'
                ? '请勿重复下单。请先检查系统默认浏览器或稍后刷新记录，确认该订单状态后再处理。'
                : '支付页面已打开，但这不代表支付成功。请在系统浏览器完成支付后返回 Kod。'}
            </Text>
            <Button size="sm" loading={refreshingAfterPayment} onClick={() => void refreshAfterPayment()}>
              我已完成支付，刷新余额和记录
            </Button>
          </Stack>
        </Alert>
      )}
      <Divider />
      <Stack>
        <Group justify="space-between">
          <Title order={4}>交易记录</Title>
          <Radio.Group value={recordTab} onChange={(v) => setRecordTab(v as 'topup' | 'consume')}>
            <Group gap="lg">
              <Radio value="topup" label={`充值记录${history.data ? `（${history.data.total}）` : ''}`} />
              <Radio
                value="consume"
                label={`消费记录${consumeHistory.data ? `（${consumeHistory.data.total}）` : ''}`}
              />
            </Group>
          </Radio.Group>
        </Group>

        {recordTab === 'consume' ? (
          <>
            {consumeHistory.isLoading && !consumeHistory.data && <Loader size="sm" />}
            {consumeHistory.error && !consumeHistory.data && (
              <Alert color="red" title="消费记录加载失败">
                {message(consumeHistory.error)}
                <Button mt="xs" size="xs" onClick={() => void consumeHistory.refetch()}>
                  重试
                </Button>
              </Alert>
            )}
            {consumeHistory.data && consumeHistory.data.items.length === 0 && (
              <Text size="sm" c="kod-tertiary">
                暂无消费记录。视频生成等按量计费项目会在这里逐条列出。
              </Text>
            )}
            {consumeHistory.data?.items.map((item) => (
              <Card key={item.id} withBorder>
                <Flex justify="space-between" gap="md" wrap="wrap">
                  <Stack gap={3}>
                    <Group>
                      <Text fw={600}>{item.bizType === 'video' ? '视频生成' : (item.bizType ?? '消费')}</Text>
                      <Badge color="blue" variant="light">
                        {item.modelName || '未知模型'}
                      </Badge>
                    </Group>
                    <Text size="sm" c="kod-tertiary">
                      {item.tokens != null ? `${item.tokens.toLocaleString()} tokens` : 'tokens 未知'}
                      {item.unitPrice != null ? ` · 单价 ¥${item.unitPrice}/百万tokens` : ''}
                      {item.duration != null ? ` · ${item.duration}s` : ''}
                      {item.resolution ? ` · ${item.resolution}` : ''}
                    </Text>
                    <Text size="xs" c="kod-tertiary">
                      {dayjs.unix(item.createTime).format('YYYY-MM-DD HH:mm:ss')}
                      {item.balanceAfter != null ? ` · 扣后余额 ${formatCny(item.balanceAfter)}` : ''}
                    </Text>
                  </Stack>
                  <Text fw={600} c="red">
                    -{formatCny(item.amount)}
                  </Text>
                </Flex>
              </Card>
            ))}
            {consumeHistory.data && consumeHistory.data.total > consumeHistory.data.pageSize && (
              <Pagination
                value={consumePage}
                total={Math.ceil(consumeHistory.data.total / consumeHistory.data.pageSize)}
                onChange={setConsumePage}
              />
            )}
          </>
        ) : (
          <>
            {history.isLoading && !history.data && <Loader size="sm" />}
            {history.error && history.data && (
              <Alert color="yellow" title="记录刷新失败">
                已保留上次加载的记录：{message(history.error)}
                <Button mt="xs" size="xs" onClick={() => void history.refetch()}>
                  重试刷新
                </Button>
              </Alert>
            )}
            {history.error && !history.data && (
              <Alert color="red" title="记录加载失败">
                {message(history.error)}
                <Button mt="xs" size="xs" onClick={() => void history.refetch()}>
                  重试
                </Button>
              </Alert>
            )}
            {history.data?.items.map((item) => (
              <Card key={item.id} withBorder>
                <Flex justify="space-between" gap="md" wrap="wrap">
                  <Stack gap={3}>
                    <Group>
                      <Text fw={600}>充值 {formatCardTime(item.amount)}</Text>
                      <Badge color={statusColor(item.status ?? '')}>
                        {item.status ? formatTopupStatus(item.status) : '状态未知'}
                      </Badge>
                    </Group>
                    <Text size="sm" c="kod-tertiary">
                      {item.paymentMethod
                        ? paymentMethodName(item.paymentMethod, item.paymentProvider ?? undefined)
                        : item.paymentProvider || '未知'}{' '}
                      · 订单{' '}
                      {item.tradeNo
                        ? item.tradeNo.length > 12
                          ? `${item.tradeNo.slice(0, 6)}…${item.tradeNo.slice(-4)}`
                          : item.tradeNo
                        : '—'}
                    </Text>
                    <Text size="xs" c="kod-tertiary">
                      {dayjs.unix(item.createTime).format('YYYY-MM-DD HH:mm:ss')}
                      {item.completeTime
                        ? ` · 完成于 ${dayjs.unix(item.completeTime).format('YYYY-MM-DD HH:mm:ss')}`
                        : ''}
                    </Text>
                  </Stack>
                  <Text fw={600}>
                    {item.status === 'pending' ? '应付' : item.status === 'success' ? '实付' : '金额'}{' '}
                    {formatCny(item.money)}
                  </Text>
                </Flex>
              </Card>
            ))}
            {history.data && history.data.total > history.data.pageSize && (
              <Pagination
                value={page}
                total={Math.ceil(history.data.total / history.data.pageSize)}
                onChange={setPage}
              />
            )}
          </>
        )}
      </Stack>
    </Stack>
  )
}
