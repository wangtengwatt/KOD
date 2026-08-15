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
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const message = (error: unknown) => (error instanceof Error ? error.message : (t('Request failed') ?? ''))
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
          <Title order={3}>{t('Wallet')}</Title>
          <Text size="xs" c="kod-tertiary">
            {t('Service: {{host}}', { host: apiHost })}
          </Text>
        </Stack>
        <Text c="kod-tertiary">
          {t('Log in to your KOD account to view balance, top-up, and transaction records.')}
        </Text>
        <Button onClick={() => navigateToSettings('kod-ai')}>{t('Log in')}</Button>
      </Stack>
    )
  const disabled = !info.data?.enableOnlineTopup || !validAmount || !method || pay.isPending
  const submit = async () => {
    if (disabled || !method) return
    let result: Awaited<ReturnType<typeof pay.mutateAsync>>
    try {
      result = await pay.mutateAsync({ amount: numericAmount, paymentMethod: method.type })
    } catch (error) {
      toast.error(t('Failed to create payment order: {{error}}', { error: message(error) }))
      return
    }
    try {
      await platform.openPaymentUrl(result.paymentUrl)
      setPaymentNotice('opened')
      toast.success(t('The payment page has been opened. Please complete the payment in the browser.'))
    } catch {
      setPaymentNotice('open-failed')
      toast.error(t('Order created, but failed to open the payment page. Please do not place a duplicate order.'))
    }
  }
  const refreshAfterPayment = async () => {
    setRefreshingAfterPayment(true)
    try {
      await refresh()
      toast.success(t('Balance and top-up records refreshed'))
    } finally {
      setRefreshingAfterPayment(false)
    }
  }
  return (
    <Stack p="md" gap="lg">
      <Group justify="space-between">
        <Stack gap={0}>
          <Title order={3}>{t('Wallet')}</Title>
          <Text size="xs" c="kod-tertiary">
            {t('Service: {{host}}', { host: apiHost })}
          </Text>
        </Stack>
        <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={() => void refresh()}>
          {t('Refresh balance and records')}
        </Button>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Card withBorder>
          <Text c="kod-tertiary">{t('Balance')}</Text>
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
          <Text c="kod-tertiary">{t('Historical consumption')}</Text>
          {balance.isLoading ? (
            <Loader size="sm" />
          ) : balance.error ? (
            <Alert color="red">{t('Historical consumption is temporarily unavailable')}</Alert>
          ) : (
            <Title order={2}>{formatCny(balance.data?.historicalConsumption)}</Title>
          )}
        </Card>
        <Card withBorder>
          <Text c="kod-tertiary">{t('Card time balance')}</Text>
          {cardTimeAccount.isLoading ? (
            <Loader size="sm" />
          ) : cardTimeAccount.error ? (
            <Text c="red" size="sm">
              {t('Card time balance is temporarily unavailable')}
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
          <Title order={4}>{t('Top Up')}</Title>
          {info.data?.discount && (
            <Alert color="orange" title={t('Top-up promotion')}>
              {t(
                'The current top-up tier enjoys a discount. The actual payment amount is subject to the server calculation.'
              )}
            </Alert>
          )}
          {info.isLoading && <Loader size="sm" />}
          {info.error && (
            <Alert color="red" title={t('Failed to load top-up configuration')}>
              {message(info.error)}
              <Button mt="xs" size="xs" onClick={() => void info.refetch()}>
                {t('Retry')}
              </Button>
            </Alert>
          )}
          {info.data && !info.data.enableOnlineTopup && (
            <Alert color="yellow">{t('Online top-up is not available yet.')}</Alert>
          )}
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
                label={t('Card time amount')}
                description={t('1 card hour = 1.002 RMB, current minimum {{minimum}}', {
                  minimum: formatCardTime(minimum),
                })}
                min={1}
                step={1}
                allowDecimal={false}
                value={selectedAmount}
                onChange={setSelectedAmount}
              />
              {!validAmount && selectedAmount !== '' && (
                <Text c="red" size="sm">
                  {t('Please enter a positive integer not lower than {{minimum}}.', {
                    minimum: formatCardTime(minimum),
                  })}
                </Text>
              )}
              <Radio.Group label={t('Payment method')} value={methodType} onChange={setMethodType}>
                <Stack mt="xs">
                  {methods.map((item) => (
                    <Radio
                      key={item.type}
                      value={item.type}
                      label={`${paymentMethodName(item.type, item.name)}${item.minTopup ? ` (${t('minimum {{min}}', { min: formatCardTime(item.minTopup) })})` : ''}`}
                    />
                  ))}
                </Stack>
              </Radio.Group>
              <Text>
                {t('Actual payment:')}
                {amount.isPending ? (
                  t('Calculating...')
                ) : amount.error ? (
                  <Text span c="red">
                    {message(amount.error)}
                  </Text>
                ) : discount ? (
                  <>
                    {formatCny(discount.actual)}{' '}
                    {t('(discount {{rate}}%, saving {{saved}})', {
                      rate: Math.round(discount.rate * 100),
                      saved: formatCny(discount.saved),
                    })}
                  </>
                ) : (
                  '—'
                )}
              </Text>
              <Text size="sm" c="kod-tertiary">
                {t(
                  'Clicking this will open the payment page in the system browser. Please complete payment and return to KOD.'
                )}
              </Text>
              <Button
                loading={pay.isPending}
                disabled={disabled || amount.isPending || !!amount.error}
                onClick={() => void submit()}
              >
                {t('Open payment page in system browser')}
              </Button>
            </>
          )}
        </Stack>
      </Card>
      {paymentNotice && (
        <Alert
          color={paymentNotice === 'open-failed' ? 'red' : 'blue'}
          title={
            paymentNotice === 'open-failed'
              ? t('Order created, but failed to open the payment page')
              : t('Please confirm payment status')
          }
          withCloseButton
          onClose={() => setPaymentNotice(null)}
        >
          <Stack gap="xs">
            <Text>
              {paymentNotice === 'open-failed'
                ? t(
                    'Please do not place a duplicate order. Check your default browser or refresh the records later to confirm this order status before proceeding.'
                  )
                : t(
                    'The payment page has been opened, but this does not mean the payment succeeded. Please complete the payment in the system browser and return to KOD.'
                  )}
            </Text>
            <Button size="sm" loading={refreshingAfterPayment} onClick={() => void refreshAfterPayment()}>
              {t('I have completed the payment. Refresh balance and records')}
            </Button>
          </Stack>
        </Alert>
      )}
      <Divider />
      <Stack>
        <Group justify="space-between">
          <Title order={4}>{t('Transaction records')}</Title>
          <Radio.Group value={recordTab} onChange={(v) => setRecordTab(v as 'topup' | 'consume')}>
            <Group gap="lg">
              <Radio
                value="topup"
                label={t('Top-up records{{suffix}}', { suffix: history.data ? ` (${history.data.total})` : '' })}
              />
              <Radio
                value="consume"
                label={t('Consumption records{{suffix}}', {
                  suffix: consumeHistory.data ? ` (${consumeHistory.data.total})` : '',
                })}
              />
            </Group>
          </Radio.Group>
        </Group>

        {recordTab === 'consume' ? (
          <>
            {consumeHistory.isLoading && !consumeHistory.data && <Loader size="sm" />}
            {consumeHistory.error && !consumeHistory.data && (
              <Alert color="red" title={t('Failed to load consumption records')}>
                {message(consumeHistory.error)}
                <Button mt="xs" size="xs" onClick={() => void consumeHistory.refetch()}>
                  {t('Retry')}
                </Button>
              </Alert>
            )}
            {consumeHistory.data && consumeHistory.data.items.length === 0 && (
              <Text size="sm" c="kod-tertiary">
                {t('No consumption records yet. Pay-as-you-go items such as video generation will be listed here.')}
              </Text>
            )}
            {consumeHistory.data?.items.map((item) => (
              <Card key={item.id} withBorder>
                <Flex justify="space-between" gap="md" wrap="wrap">
                  <Stack gap={3}>
                    <Group>
                      <Text fw={600}>
                        {item.bizType === 'video' ? t('Video generation') : (item.bizType ?? t('Consumption'))}
                      </Text>
                      <Badge color="blue" variant="light">
                        {item.modelName || t('Unknown model')}
                      </Badge>
                    </Group>
                    <Text size="sm" c="kod-tertiary">
                      {item.tokens != null ? `${item.tokens.toLocaleString()} tokens` : t('tokens unknown')}
                      {item.unitPrice != null
                        ? ` · ${t('Unit price ¥{{price}}/M tokens', { price: item.unitPrice })}`
                        : ''}
                      {item.duration != null ? ` · ${item.duration}s` : ''}
                      {item.resolution ? ` · ${item.resolution}` : ''}
                    </Text>
                    <Text size="xs" c="kod-tertiary">
                      {dayjs.unix(item.createTime).format('YYYY-MM-DD HH:mm:ss')}
                      {item.balanceAfter != null
                        ? ` · ${t('Balance after deduction: {{balance}}', { balance: formatCny(item.balanceAfter) })}`
                        : ''}
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
              <Alert color="yellow" title={t('Failed to refresh records')}>
                {t('Kept the previously loaded records: {{error}}', { error: message(history.error) })}
                <Button mt="xs" size="xs" onClick={() => void history.refetch()}>
                  {t('Retry refresh')}
                </Button>
              </Alert>
            )}
            {history.error && !history.data && (
              <Alert color="red" title={t('Failed to load records')}>
                {message(history.error)}
                <Button mt="xs" size="xs" onClick={() => void history.refetch()}>
                  {t('Retry')}
                </Button>
              </Alert>
            )}
            {history.data?.items.map((item) => (
              <Card key={item.id} withBorder>
                <Flex justify="space-between" gap="md" wrap="wrap">
                  <Stack gap={3}>
                    <Group>
                      <Text fw={600}>{t('Top up {{amount}}', { amount: formatCardTime(item.amount) })}</Text>
                      <Badge color={statusColor(item.status ?? '')}>
                        {item.status ? formatTopupStatus(item.status) : t('Unknown status')}
                      </Badge>
                    </Group>
                    <Text size="sm" c="kod-tertiary">
                      {item.paymentMethod
                        ? paymentMethodName(item.paymentMethod, item.paymentProvider ?? undefined)
                        : item.paymentProvider || t('Unknown')}{' '}
                      · {t('Order')}{' '}
                      {item.tradeNo
                        ? item.tradeNo.length > 12
                          ? `${item.tradeNo.slice(0, 6)}…${item.tradeNo.slice(-4)}`
                          : item.tradeNo
                        : '—'}
                    </Text>
                    <Text size="xs" c="kod-tertiary">
                      {dayjs.unix(item.createTime).format('YYYY-MM-DD HH:mm:ss')}
                      {item.completeTime
                        ? ` · ${t('Completed at {{time}}', { time: dayjs.unix(item.completeTime).format('YYYY-MM-DD HH:mm:ss') })}`
                        : ''}
                    </Text>
                  </Stack>
                  <Text fw={600}>
                    {item.status === 'pending' ? t('Payable') : item.status === 'success' ? t('Paid') : t('Amount')}{' '}
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
