import { Alert, Badge, Button, Card, Group, Paper, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useWalletIdentity } from '@/hooks/useWallet'
import {
  type LotteryEligibility,
  type LotteryHistory,
  listLotteryEligibilities,
  listLotteryHistory,
} from '@/packages/computeCenter'
import { lotteryKeys, lotteryRateLabel, lotterySourceLabel, SettlementLotteryModal } from './SettlementLotteryModal'

type SelectedEligibility = {
  identity: string
  eligibility: LotteryEligibility
}

export function SettlementLotteryPanel() {
  const identity = useWalletIdentity()
  const queryIdentity = identity ?? 'signed-out'
  const [selected, setSelected] = useState<SelectedEligibility | null>(null)
  const selectedOwnerRef = useRef(identity)
  const pendingQuery = useQuery({
    queryKey: lotteryKeys.pending(queryIdentity),
    queryFn: () => listLotteryEligibilities('PENDING'),
    enabled: identity !== null,
    retry: false,
  })
  const historyQuery = useQuery({
    queryKey: lotteryKeys.history(queryIdentity),
    queryFn: listLotteryHistory,
    enabled: identity !== null,
    retry: false,
  })

  useEffect(() => {
    if (selectedOwnerRef.current === identity) return
    selectedOwnerRef.current = identity
    setSelected(null)
  }, [identity])

  if (!identity) {
    return (
      <Alert color="blue" title="登录后查看抽奖资格">
        已结算的 GPU 租赁订单和卡时托管租期会在这里生成抽奖资格。
      </Alert>
    )
  }

  const pending = pendingQuery.data ?? []
  const history = historyQuery.data ?? []
  const selectedEligibility = selected?.identity === identity ? selected.eligibility : null

  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={3}>抽奖中心</Title>
            <Text size="sm" c="dimmed" mt={4}>
              GPU 租赁订单与卡时托管租期完成结算后，各获得一次抽奖资格；关闭弹窗不会消耗资格。
            </Text>
          </div>
          <Badge color="teal" size="lg" variant="light">
            待领取 {pending.length}
          </Badge>
        </Group>
        <Alert color="teal" mt="md" title="奖励进入专用卡时余额">
          <Stack gap={4}>
            <Text size="sm">抽奖比例固定为 0.5%、1%、2%、3%、5%，服务端保存唯一结果。</Text>
            <Text size="sm" fw={700}>
              奖励卡时不可回购成人民币
            </Text>
          </Stack>
        </Alert>
      </Paper>

      <Stack gap="sm">
        <Title order={4}>待领取资格</Title>
        {pendingQuery.isLoading ? (
          <Text c="dimmed">正在加载待领取抽奖资格…</Text>
        ) : pendingQuery.error ? (
          <LotteryLoadError
            title="待领取资格加载失败"
            error={pendingQuery.error}
            onRetry={() => void pendingQuery.refetch()}
          />
        ) : pending.length === 0 ? (
          <Text c="dimmed">暂无待领取抽奖资格。</Text>
        ) : (
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {pending.map((eligibility) => {
              const sourceLabel = lotterySourceLabel(eligibility.sourceType)
              return (
                <Card
                  component="section"
                  aria-label={`待领取 ${sourceLabel} ${eligibility.sourceId}`}
                  key={eligibility.id}
                  withBorder
                  padding="md"
                  radius="md"
                >
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Text fw={700}>{sourceLabel}</Text>
                      <Badge color="orange" variant="light">
                        待领取
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">
                      资格 ID
                    </Text>
                    <Text size="sm" ff="monospace">
                      {eligibility.id}
                    </Text>
                    <Text size="xs" c="dimmed">
                      来源 ID
                    </Text>
                    <Text size="sm" ff="monospace">
                      {eligibility.sourceId}
                    </Text>
                    <Text size="sm" fw={600}>
                      奖励基数 {eligibility.rewardBase} 卡时
                    </Text>
                    <Text size="xs" c="dimmed">
                      生成时间 {formatContractDateTime(eligibility.createdAt)} · 规则版本 v{eligibility.ruleVersion}
                    </Text>
                    <Button color="teal" onClick={() => setSelected({ identity, eligibility })}>
                      立即抽奖
                    </Button>
                  </Stack>
                </Card>
              )
            })}
          </SimpleGrid>
        )}
      </Stack>

      <Stack gap="sm">
        <Title order={4}>已领取记录</Title>
        {historyQuery.isLoading ? (
          <Text c="dimmed">正在加载抽奖记录…</Text>
        ) : historyQuery.error ? (
          <LotteryLoadError
            title="抽奖记录加载失败"
            error={historyQuery.error}
            onRetry={() => void historyQuery.refetch()}
          />
        ) : history.length === 0 ? (
          <Text c="dimmed">暂无已领取记录。</Text>
        ) : (
          <LotteryHistoryTable history={history} />
        )}
      </Stack>

      <SettlementLotteryModal
        opened={selectedEligibility !== null}
        eligibility={selectedEligibility}
        onClose={() => setSelected(null)}
      />
    </Stack>
  )
}

function LotteryHistoryTable({ history }: { history: LotteryHistory[] }) {
  return (
    <Table.ScrollContainer minWidth={1_000}>
      <Table striped highlightOnHover withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>来源</Table.Th>
            <Table.Th>来源 ID</Table.Th>
            <Table.Th>抽奖结果 ID</Table.Th>
            <Table.Th>奖励基数</Table.Th>
            <Table.Th>比例</Table.Th>
            <Table.Th>奖励卡时</Table.Th>
            <Table.Th>奖励流水 ID</Table.Th>
            <Table.Th>领取时间</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {history.map((entry) => (
            <Table.Tr key={entry.drawId}>
              <Table.Td>{lotterySourceLabel(entry.sourceType)}</Table.Td>
              <Table.Td>{entry.sourceId}</Table.Td>
              <Table.Td>{entry.drawId}</Table.Td>
              <Table.Td>{entry.rewardBase}</Table.Td>
              <Table.Td>{lotteryRateLabel(entry.rateBasisPoints)}</Table.Td>
              <Table.Td>{entry.rewardAmount}</Table.Td>
              <Table.Td>{entry.rewardLedgerId ?? '-'}</Table.Td>
              <Table.Td>{formatContractDateTime(entry.drawnAt)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

function LotteryLoadError({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
  return (
    <Alert color="red" title={title}>
      <Stack gap="xs">
        <Text size="sm">{error instanceof Error ? error.message : '服务暂不可用，请稍后重试。'}</Text>
        <Button variant="light" color="red" size="xs" onClick={onRetry}>
          重试
        </Button>
      </Stack>
    </Alert>
  )
}

function formatContractDateTime(value: string) {
  return value.replace('T', ' ')
}
