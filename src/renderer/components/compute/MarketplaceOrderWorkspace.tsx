import { Alert, Badge, Box, Button, FileInput, Group, Paper, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useComputeQueryKey } from '@/hooks/useWallet'
import type { ComputeReservation } from '@/packages/computeCenter'
import {
  acceptOrderSchedule,
  getOrderMessageImage,
  getOrderSchedule,
  listOrderMessages,
  markOrderMessagesRead,
  proposeOrderSchedule,
  sendOrderImage,
  sendOrderText,
} from '@/packages/computeMarketplace/api'
import {
  escrowSummary,
  isOrderConversationReadonly,
  marketplaceStatus,
  mergeOrderMessages,
} from '@/packages/computeMarketplace/projections'
import type { ComputeOrderMessage } from '@/packages/computeMarketplace/types'

type RunAction = (key: string, action: () => Promise<unknown>, success: string) => Promise<boolean>

export function MarketplaceOrderWorkspace({
  reservation,
  currentUserId,
  busy,
  run,
}: {
  reservation: ComputeReservation
  currentUserId?: string
  busy: string | null
  run: RunAction
}) {
  const queryClient = useQueryClient()
  const computeQueryKey = useComputeQueryKey()
  const [text, setText] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [startTime, setStartTime] = useState('')
  const [messages, setMessages] = useState<ComputeOrderMessage[]>([])
  const messageCursor = useRef({ reservationId: reservation.id, lastId: 0 })
  const readonly = isOrderConversationReadonly(reservation.status)
  const durationHours = Number(reservation.packageDurationHours || 0)
  const endTime = useMemo(() => addHours(startTime, durationHours), [durationHours, startTime])
  const messagesQuery = useQuery({
    queryKey: computeQueryKey('reservation-messages', reservation.id),
    queryFn: () =>
      listOrderMessages(
        reservation.id,
        messageCursor.current.reservationId === reservation.id ? messageCursor.current.lastId : 0
      ),
    refetchInterval: readonly ? false : 5000,
  })
  const scheduleQuery = useQuery({
    queryKey: computeQueryKey('reservation-schedule', reservation.id),
    queryFn: () => getOrderSchedule(reservation.id),
    enabled: reservation.workflowVersion === 2,
    refetchInterval: reservation.status === 'PENDING_SCHEDULE' ? 5000 : false,
  })
  const lastMessage = messages.at(-1)
  const lastMessageId = lastMessage?.id
  const lastMessageSenderUserId = lastMessage?.senderUserId

  useEffect(() => {
    messageCursor.current = { reservationId: reservation.id, lastId: 0 }
    setMessages([])
  }, [reservation.id])

  useEffect(() => {
    if (!messagesQuery.data?.length) return
    const incoming = messagesQuery.data
    messageCursor.current = {
      reservationId: reservation.id,
      lastId: Math.max(messageCursor.current.lastId, incoming.at(-1)?.id || 0),
    }
    setMessages((current) => mergeOrderMessages(current, incoming))
  }, [messagesQuery.data, reservation.id])

  useEffect(() => {
    if (!lastMessageId) return
    if (lastMessageSenderUserId !== currentUserId) {
      void markOrderMessagesRead(reservation.id, lastMessageId).then(() =>
        queryClient.invalidateQueries({ queryKey: computeQueryKey('account') })
      )
    }
  }, [computeQueryKey, currentUserId, lastMessageId, lastMessageSenderUserId, queryClient, reservation.id])

  const refreshWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: computeQueryKey('reservation-messages', reservation.id) }),
      queryClient.invalidateQueries({ queryKey: computeQueryKey('reservation-schedule', reservation.id) }),
    ])
  }

  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
        {escrowSummary(reservation.escrow).map(([label, value]) => (
          <Paper key={label} withBorder p="sm" radius="md">
            <Text size="xs" c="dimmed">
              {label}
            </Text>
            <Text fw={700}>{value}</Text>
          </Paper>
        ))}
      </SimpleGrid>
      <Text size="xs" c="dimmed">
        账户顶部“冻结卡时”是所有进行中订单的合计；本订单以这里的四项资金状态和下方时间线为准。
      </Text>

      {reservation.workflowVersion === 2 && (
        <Paper withBorder p="sm" radius="md">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={600}>结构化排期</Text>
              <Badge color={marketplaceStatus(reservation.status).color}>
                {marketplaceStatus(reservation.status).label}
              </Badge>
            </Group>
            {reservation.status === 'PENDING_SCHEDULE' && (
              <>
                <Alert color="blue">
                  任一方提出开始时间，系统按已购 {durationHours}{' '}
                  小时自动计算结束时间；必须由另一方确认后才锁定节点容量。 截止{' '}
                  {formatDate(reservation.scheduleDeadlineAt)} 未确认会自动取消并全额解冻。
                </Alert>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <TextInput
                    label="建议开始时间"
                    type="datetime-local"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                  />
                  <TextInput label="自动结束时间" type="datetime-local" value={endTime} readOnly />
                </SimpleGrid>
                <Button
                  variant="light"
                  loading={busy === `schedule-propose-${reservation.id}`}
                  disabled={!startTime || !endTime}
                  onClick={() =>
                    run(
                      `schedule-propose-${reservation.id}`,
                      () => proposeOrderSchedule(reservation.id, startTime, endTime),
                      '排期提议已发给对方'
                    ).then(refreshWorkspace)
                  }
                >
                  提交排期提议
                </Button>
              </>
            )}
            {scheduleQuery.data?.booking && (
              <Alert color="green">
                已锁定：{formatDate(scheduleQuery.data.booking.startTime)} 至{' '}
                {formatDate(scheduleQuery.data.booking.endTime)}，{scheduleQuery.data.booking.gpuCount} 张 GPU。
              </Alert>
            )}
            {(scheduleQuery.data?.proposals || []).map((proposal) => (
              <Paper key={proposal.id} withBorder p="xs" radius="sm">
                <Group justify="space-between" align="center">
                  <Box>
                    <Group gap="xs">
                      <Text size="sm" fw={600}>
                        {formatDate(proposal.proposedStart)} 至 {formatDate(proposal.proposedEnd)}
                      </Text>
                      <Badge size="xs" color={marketplaceStatus(proposal.status).color}>
                        {proposal.status === 'PENDING'
                          ? '等待对方确认'
                          : proposal.status === 'ACCEPTED'
                            ? '已接受'
                            : '已被新提议替代'}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">
                      提议方用户 #{proposal.proposerUserId} · {formatDate(proposal.createTime)}
                    </Text>
                  </Box>
                  {proposal.status === 'PENDING' && proposal.proposerUserId !== currentUserId && (
                    <Button
                      size="xs"
                      loading={busy === `schedule-accept-${reservation.id}-${proposal.id}`}
                      onClick={() =>
                        run(
                          `schedule-accept-${reservation.id}-${proposal.id}`,
                          () => acceptOrderSchedule(reservation.id, proposal.id),
                          '排期已确认，节点容量已锁定'
                        ).then(refreshWorkspace)
                      }
                    >
                      接受并锁定容量
                    </Button>
                  )}
                </Group>
              </Paper>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper withBorder p="sm" radius="md">
        <Stack gap="xs">
          <Group justify="space-between">
            <Group gap="xs">
              <Text fw={600}>订单沟通</Text>
              {reservation.unreadMessages ? <Badge size="xs">{reservation.unreadMessages} 条未读</Badge> : null}
            </Group>
            {'Notification' in window && Notification.permission !== 'granted' && (
              <Button size="compact-xs" variant="subtle" onClick={() => void Notification.requestPermission()}>
                开启新消息提醒
              </Button>
            )}
          </Group>
          <Alert color="gray">仅订单买卖双方可见；请勿发送密码或私钥。订单结束后保留只读，聊天图片保留 180 天。</Alert>
          <Stack gap="xs" mah={320} style={{ overflowY: 'auto' }}>
            {messages.length === 0 && <Text c="dimmed">暂无消息，可先通过排期提议开始协商。</Text>}
            {messages.map((message) => (
              <OrderMessage
                key={message.id}
                reservationId={reservation.id}
                message={message}
                currentUserId={currentUserId}
              />
            ))}
          </Stack>
          {!readonly && (
            <>
              <Group align="flex-end" grow>
                <TextInput
                  label="发送文字"
                  value={text}
                  maxLength={2000}
                  onChange={(event) => setText(event.target.value)}
                />
                <Button
                  loading={busy === `message-text-${reservation.id}`}
                  disabled={!text.trim()}
                  onClick={() =>
                    run(`message-text-${reservation.id}`, () => sendOrderText(reservation.id, text), '消息已发送').then(
                      (success) => {
                        if (success) setText('')
                        return refreshWorkspace()
                      }
                    )
                  }
                >
                  发送
                </Button>
              </Group>
              <Group align="flex-end" grow>
                <FileInput
                  label="发送图片"
                  description="JPG、PNG 或 WebP，最大 8 MB"
                  accept="image/jpeg,image/png,image/webp"
                  value={image}
                  onChange={setImage}
                />
                <Button
                  variant="light"
                  loading={busy === `message-image-${reservation.id}`}
                  disabled={!image}
                  onClick={() =>
                    image &&
                    run(
                      `message-image-${reservation.id}`,
                      () => sendOrderImage(reservation.id, image),
                      '图片已发送'
                    ).then((success) => {
                      if (success) setImage(null)
                      return refreshWorkspace()
                    })
                  }
                >
                  发送图片
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Paper>

      {(reservation.fundsEvents || []).length > 0 && (
        <Paper withBorder p="sm" radius="md">
          <Text fw={600} mb="xs">
            订单资金与状态记录
          </Text>
          <Stack gap={4}>
            {(reservation.fundsEvents || []).map((event) => (
              <Group key={event.id} justify="space-between" wrap="nowrap">
                <Text size="sm">{eventLabel(event.eventType)}</Text>
                <Text size="xs" c="dimmed">
                  {event.cardHours == null ? '' : `${Number(event.cardHours).toFixed(3)} 卡时 · `}
                  {formatDate(event.createTime)}
                </Text>
              </Group>
            ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  )
}

function OrderMessage({
  reservationId,
  message,
  currentUserId,
}: {
  reservationId: number
  message: ComputeOrderMessage
  currentUserId?: string
}) {
  const computeQueryKey = useComputeQueryKey()
  const mine = message.senderUserId === currentUserId
  const imageQuery = useQuery({
    queryKey: computeQueryKey('reservation-message-image', reservationId, message.id),
    queryFn: () => getOrderMessageImage(reservationId, message.id),
    enabled: message.messageType === 'IMAGE' && !message.imagePurgedAt,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const imageUrl = useObjectUrl(imageQuery.data)
  if (message.messageType === 'SYSTEM') {
    return (
      <Text size="xs" ta="center" c="dimmed">
        {message.content} · {formatDate(message.createTime)}
      </Text>
    )
  }
  return (
    <Group justify={mine ? 'flex-end' : 'flex-start'}>
      <Paper withBorder p="xs" radius="md" bg={mine ? 'blue.0' : undefined} maw="80%">
        <Text size="xs" c="dimmed">
          {mine ? '我' : message.senderEmail || '对方'} · {formatDate(message.createTime)}
        </Text>
        {message.messageType === 'IMAGE' ? (
          message.imagePurgedAt ? (
            <Text size="sm">图片已按 180 天保留策略清理</Text>
          ) : imageUrl ? (
            <Box
              component="img"
              src={imageUrl}
              alt="订单沟通图片"
              maw={360}
              mah={280}
              style={{ objectFit: 'contain' }}
            />
          ) : (
            <Text size="sm">图片加载中…</Text>
          )
        ) : (
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {message.content}
          </Text>
        )}
      </Paper>
    </Group>
  )
}

function useObjectUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

function addHours(value: string, hours: number) {
  if (!value || !hours) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  date.setHours(date.getHours() + hours)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    CARD_HOURS_FROZEN: '买家付款，卡时进入平台担保',
    SCHEDULE_LOCKED: '双方确认排期，节点容量已锁定',
    RESOURCE_DELIVERED: '卖家已提交交付',
    BUYER_CONFIRMED: '买家确认收货',
    AUTO_CONFIRMED: '24 小时无争议自动确认',
    DISPUTED: '买家发起争议，卡时继续冻结',
    SETTLED: '卡时已结算给卖家',
    REFUNDED: '卡时已退回买家',
    SCHEDULE_TIMEOUT_REFUND: '排期超时，卡时全额退回',
    DELIVERY_TIMEOUT_REFUND: '交付超时，卡时全额退回',
  }
  return labels[type] || type
}
