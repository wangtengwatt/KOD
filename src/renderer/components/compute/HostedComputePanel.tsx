import { Alert, Badge, Button, Group, Paper, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useComputeQueryKey } from '@/hooks/useWallet'
import { cancelHostedNodeDelist, listHostedNodes, requestHostedNodeDelist } from '@/packages/computeMarketplace/api'
import { marketplaceStatus, nextOfflineLabel } from '@/packages/computeMarketplace/projections'

type RunAction = (key: string, action: () => Promise<unknown>, success: string) => Promise<boolean>

export function HostedComputePanel({ busy, run }: { busy: string | null; run: RunAction }) {
  const computeQueryKey = useComputeQueryKey()
  const hostingQuery = useQuery({ queryKey: computeQueryKey('supplier-hosting'), queryFn: listHostedNodes })
  const [reasons, setReasons] = useState<Record<number, string>>({})
  const nodes = (hostingQuery.data || []).filter((node) => !node.platformManaged)
  return (
    <Stack gap="sm">
      <Alert color="blue" title="算力租赁如何工作">
        节点审核通过后可长期挂售；每个订单完成只释放该时段容量，商品继续上架。申请下架后立即停止接收新订单， 但至少等待
        7 天，并在全部预约和争议清空后才自动离线。平台不会登录或控制你的服务器。
      </Alert>
      {nodes.length === 0 ? (
        <Text c="dimmed">尚无租赁节点，请先在“资源资质”提交并通过审核。</Text>
      ) : (
        nodes.map((node) => {
          const delist = node.delistRequest
          const status = marketplaceStatus(node.status)
          return (
            <Paper key={node.id} withBorder p="md" radius="md">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Group gap="xs">
                    <Text fw={700}>{node.nodeName}</Text>
                    <Badge color={status.color}>{status.label}</Badge>
                    <Badge color={node.canAcceptOrders ? 'green' : 'orange'}>
                      {node.canAcceptOrders ? '接收新订单' : '停止接单'}
                    </Badge>
                  </Group>
                  <Text fw={600}>
                    {node.gpuModel} × {node.gpuCount}
                  </Text>
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Text size="sm">下一预约：{formatDate(node.nextBookingAt)}</Text>
                  <Text size="sm">最后占用结束：{formatDate(node.lastBookingEnd)}</Text>
                </SimpleGrid>
                {delist ? (
                  <Alert color="orange" title="下架处理中">
                    <Stack gap="xs">
                      <Text size="sm">{nextOfflineLabel(delist.estimatedOfflineAt)}</Text>
                      <Text size="xs">
                        申请原因：{delist.reason || '未填写'}；申请时间：{formatDate(delist.requestedAt)}
                      </Text>
                      <Button
                        size="xs"
                        variant="light"
                        loading={busy === `hosting-delist-cancel-${node.id}`}
                        onClick={() =>
                          run(
                            `hosting-delist-cancel-${node.id}`,
                            () => cancelHostedNodeDelist(node.id),
                            '下架申请已撤销，节点恢复接单'
                          )
                        }
                      >
                        撤销下架申请
                      </Button>
                    </Stack>
                  </Alert>
                ) : (
                  <Group align="flex-end" grow>
                    <TextInput
                      label="下架原因"
                      placeholder="例如设备维护或资源调整"
                      value={reasons[node.id] || ''}
                      onChange={(event) => setReasons({ ...reasons, [node.id]: event.target.value })}
                    />
                    <Button
                      color="orange"
                      variant="light"
                      loading={busy === `hosting-delist-${node.id}`}
                      disabled={!reasons[node.id]?.trim() || node.status === 'OFFLINE'}
                      onClick={() =>
                        run(
                          `hosting-delist-${node.id}`,
                          () => requestHostedNodeDelist(node.id, reasons[node.id] || ''),
                          '已停止接收新订单，并进入至少 7 天的下架等待期'
                        )
                      }
                    >
                      申请下架
                    </Button>
                  </Group>
                )}
              </Stack>
            </Paper>
          )
        })
      )}
    </Stack>
  )
}

function formatDate(value?: string | null) {
  if (!value) return '暂无'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
