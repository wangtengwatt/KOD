import { Alert, Badge, Box, Button, Group, Modal, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { computeKeys, useWalletIdentity, walletKeys } from '@/hooks/useWallet'
import { drawLotteryEligibility, type LotteryDraw, type LotteryEligibility } from '@/packages/computeCenter'

const DRAW_REQUEST_STORAGE_PREFIX = 'kod.compute.lottery.draw.'
const pendingDrawRequestIds = new Map<string, string>()

export const LOTTERY_SEGMENTS = [
  { rateBasisPoints: 50, label: '0.5%', color: 'teal.1' },
  { rateBasisPoints: 100, label: '1%', color: 'teal.2' },
  { rateBasisPoints: 200, label: '2%', color: 'teal.3' },
  { rateBasisPoints: 300, label: '3%', color: 'teal.4' },
  { rateBasisPoints: 500, label: '5%', color: 'teal.5' },
] as const

export const lotteryKeys = {
  root: (identity: string) => ['compute', identity, 'lottery'] as const,
  pending: (identity: string) => ['compute', identity, 'lottery', 'eligibilities', 'PENDING'] as const,
  history: (identity: string) => ['compute', identity, 'lottery', 'history'] as const,
}

export type SettlementLotteryModalProps = {
  opened: boolean
  eligibility: LotteryEligibility | null
  onClose: () => void
  onDrawn?: (draw: LotteryDraw) => void
}

export function SettlementLotteryModal({ opened, eligibility, onClose, onDrawn }: SettlementLotteryModalProps) {
  const identity = useWalletIdentity()
  const queryClient = useQueryClient()
  const [drawResult, setDrawResult] = useState<LotteryDraw | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const currentOwnerKey = `${identity ?? 'signed-out'}:${eligibility?.id ?? 'none'}`
  const currentOwnerKeyRef = useRef(currentOwnerKey)
  const pendingOwnerKeyRef = useRef<string | null>(null)
  currentOwnerKeyRef.current = currentOwnerKey

  useEffect(() => {
    currentOwnerKeyRef.current = currentOwnerKey
    pendingOwnerKeyRef.current = null
    setDrawResult(null)
    setError(null)
    setSubmitting(false)
  }, [currentOwnerKey])

  const startDraw = async () => {
    if (!identity || !eligibility || drawResult || pendingOwnerKeyRef.current) return
    const ownerIdentity = identity
    const ownerEligibility = eligibility
    const ownerKey = `${ownerIdentity}:${ownerEligibility.id}`
    const requestId = getDrawRequestId(ownerIdentity, ownerEligibility.id)
    pendingOwnerKeyRef.current = ownerKey
    setSubmitting(true)
    setError(null)
    try {
      const authoritativeResult = await drawLotteryEligibility(ownerEligibility.id, requestId)
      if (currentOwnerKeyRef.current !== ownerKey) return
      if (authoritativeResult.eligibilityId !== ownerEligibility.id) {
        throw new Error('服务端返回的抽奖资格不匹配，请稍后重试。')
      }
      setDrawResult(authoritativeResult)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: lotteryKeys.root(ownerIdentity) }),
        queryClient.invalidateQueries({ queryKey: walletKeys.cardTimeAccount(ownerIdentity) }),
        queryClient.invalidateQueries({ queryKey: computeKeys.account(ownerIdentity) }),
        queryClient.invalidateQueries({ queryKey: computeKeys.assetHistory(ownerIdentity) }),
      ])
      if (currentOwnerKeyRef.current !== ownerKey) return
      onDrawn?.(authoritativeResult)
    } catch (cause) {
      if (currentOwnerKeyRef.current === ownerKey) {
        setError(cause instanceof Error ? cause.message : '抽奖失败，请重试。')
      }
    } finally {
      if (pendingOwnerKeyRef.current === ownerKey) pendingOwnerKeyRef.current = null
      if (currentOwnerKeyRef.current === ownerKey) setSubmitting(false)
    }
  }

  const rateLabel = drawResult ? lotteryRateLabel(drawResult.rateBasisPoints) : null
  const wheelRotation = drawResult ? lotteryLandingRotation(drawResult.rateBasisPoints) : 0

  return (
    <Modal
      opened={opened && eligibility !== null}
      onClose={() => {
        if (!submitting) onClose()
      }}
      title="订单结算抽奖"
      centered
      closeOnClickOutside={!submitting}
      closeOnEscape={!submitting}
      closeButtonProps={{ 'aria-label': '关闭抽奖弹窗', disabled: submitting }}
      size="lg"
    >
      {eligibility && (
        <Stack gap="md">
          <Paper withBorder p="sm" radius="md">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text size="xs" c="dimmed">
                  奖励来源
                </Text>
                <Text fw={700}>{lotterySourceLabel(eligibility.sourceType)}</Text>
              </div>
              <Badge color="teal" variant="light">
                待领取
              </Badge>
            </Group>
            <Text size="sm" mt="xs">
              来源 ID
            </Text>
            <Text size="sm" ff="monospace">
              {eligibility.sourceId}
            </Text>
            <Text size="sm" mt="xs" fw={600}>
              奖励基数 {eligibility.rewardBase} 卡时
            </Text>
            {isZeroLotteryBase(eligibility.rewardBase) && (
              <Text size="sm" c="orange" mt={4}>
                本次可回购资金贡献为 0，因此奖励基数为 0.000 卡时。
              </Text>
            )}
          </Paper>

          <Stack align="center" gap="sm">
            <Box pos="relative" w={232} h={244}>
              <Box
                pos="absolute"
                top={0}
                left="50%"
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '10px solid transparent',
                  borderRight: '10px solid transparent',
                  borderTop: '18px solid var(--mantine-color-dark-7)',
                  transform: 'translateX(-50%)',
                  zIndex: 2,
                }}
              />
              <Box
                role="img"
                aria-label={drawResult && rateLabel ? `转盘结果 ${rateLabel}` : '等待服务端抽奖结果'}
                pos="absolute"
                top={12}
                left={0}
                w={232}
                h={232}
                style={{
                  borderRadius: '50%',
                  border: '8px solid var(--mantine-color-teal-7)',
                  background:
                    'conic-gradient(var(--mantine-color-teal-1) 0deg 72deg, var(--mantine-color-teal-2) 72deg 144deg, var(--mantine-color-teal-3) 144deg 216deg, var(--mantine-color-teal-4) 216deg 288deg, var(--mantine-color-teal-5) 288deg 360deg)',
                  boxShadow: '0 12px 30px rgba(12, 166, 120, 0.18)',
                  transform: `rotate(${wheelRotation}deg)`,
                  transition: drawResult ? 'transform 900ms cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
                }}
              >
                <Box
                  pos="absolute"
                  top="50%"
                  left="50%"
                  w={58}
                  h={58}
                  bg="white"
                  style={{
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)',
                    border: '3px solid var(--mantine-color-teal-7)',
                  }}
                />
              </Box>
            </Box>
            <SimpleGrid cols={5} spacing="xs" w="100%" aria-label="固定奖项范围">
              {LOTTERY_SEGMENTS.map((segment) => (
                <Badge key={segment.rateBasisPoints} color="teal" variant="light" fullWidth>
                  {segment.label}
                </Badge>
              ))}
            </SimpleGrid>
          </Stack>

          <Alert color="teal" title="结算奖励规则">
            <Stack gap={4}>
              <Text size="sm">每个已结算订单或托管租期只能领取一次，抽奖结果与奖励金额均以服务端保存结果为准。</Text>
              <Text size="sm" fw={700}>
                奖励卡时不可回购成人民币
              </Text>
            </Stack>
          </Alert>

          {error && (
            <Alert color="red" title="抽奖请求未完成">
              {error}
            </Alert>
          )}

          {drawResult && rateLabel ? (
            <Paper withBorder p="md" radius="md" bg="teal.0">
              <Title order={4}>获得奖励 {drawResult.rewardAmount} 卡时</Title>
              <SimpleGrid cols={{ base: 1, sm: 2 }} mt="sm" spacing="xs">
                <Text size="sm">奖励比例 {rateLabel}</Text>
                <Text size="sm">奖励基数 {eligibility.rewardBase} 卡时</Text>
                <Text size="sm">抽奖结果 ID {drawResult.id}</Text>
                <Text size="sm">奖励流水 ID {drawResult.rewardLedgerId ?? '-'}</Text>
                <Text size="sm">规则版本 v{drawResult.ruleVersion}</Text>
                <Text size="sm">领取时间 {formatContractDateTime(drawResult.drawnAt)}</Text>
              </SimpleGrid>
              <Text size="sm" fw={700} c="teal.9" mt="sm">
                奖励卡时不可回购成人民币
              </Text>
            </Paper>
          ) : (
            <Button
              fullWidth
              loading={submitting}
              aria-label={submitting ? '等待服务端确认中' : undefined}
              onClick={startDraw}
            >
              {submitting ? '等待服务端确认中' : error ? '重试抽奖' : '开始抽奖'}
            </Button>
          )}
        </Stack>
      )}
    </Modal>
  )
}

export function lotteryRateLabel(rateBasisPoints: number) {
  return LOTTERY_SEGMENTS.find((segment) => segment.rateBasisPoints === rateBasisPoints)?.label ?? '--'
}

export function lotterySourceLabel(sourceType: LotteryEligibility['sourceType']) {
  return sourceType === 'GPU_RESERVATION' ? 'GPU 租赁订单' : '卡时托管租期'
}

function lotteryLandingRotation(rateBasisPoints: number) {
  const index = LOTTERY_SEGMENTS.findIndex((segment) => segment.rateBasisPoints === rateBasisPoints)
  if (index < 0) return 0
  const segmentCenter = index * 72 + 36
  return 720 + (360 - segmentCenter)
}

function isZeroLotteryBase(value: string) {
  return /^0(?:\.0{1,3})?$/.test(value)
}

function formatContractDateTime(value: string) {
  return value.replace('T', ' ')
}

function getDrawRequestId(identity: string, eligibilityId: string) {
  const storageKey = `${DRAW_REQUEST_STORAGE_PREFIX}${identity}.${eligibilityId}`
  try {
    const existing = localStorage.getItem(storageKey)
    if (existing) {
      pendingDrawRequestIds.set(storageKey, existing)
      return existing
    }
    const created = uuidv4()
    pendingDrawRequestIds.set(storageKey, created)
    localStorage.setItem(storageKey, created)
    return created
  } catch {
    const existing = pendingDrawRequestIds.get(storageKey)
    if (existing) return existing
    const created = uuidv4()
    pendingDrawRequestIds.set(storageKey, created)
    return created
  }
}
