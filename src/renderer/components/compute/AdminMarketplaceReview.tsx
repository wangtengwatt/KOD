import { Alert, Badge, Box, Button, Group, Paper, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { type ComputeProduct, getAdminNodeProof, getComputeProductImageUrl } from '@/packages/computeCenter'
import { getAdminProductReviewDetail, listAdminReviewHistory } from '@/packages/computeMarketplace/api'
import { marketplaceStatus, reviewCategoryLabel } from '@/packages/computeMarketplace/projections'

export function AdminProductReviewCard({
  product,
  loading,
  onReview,
}: {
  product: ComputeProduct
  loading: boolean
  onReview: (approved: boolean, reason: string) => Promise<unknown>
}) {
  const detailQuery = useQuery({
    queryKey: ['compute', 'admin-product-review-detail', product.id],
    queryFn: () => getAdminProductReviewDetail(product.id),
  })
  const detail = detailQuery.data
  const proofQuery = useQuery({
    queryKey: ['compute', 'admin-node-proof', detail?.nodeId],
    queryFn: () => getAdminNodeProof(Number(detail?.nodeId)),
    enabled: Boolean(detail?.nodeProofAvailable && detail?.nodeId),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const proofUrl = useBlobUrl(proofQuery.data)
  const [reason, setReason] = useState('')
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Group gap="xs">
            <Text fw={700}>{product.name}</Text>
            <Badge color={marketplaceStatus(product.status).color}>{marketplaceStatus(product.status).label}</Badge>
            <Badge variant="light">第 {detail?.revision.revisionNo || 1} 版</Badge>
          </Group>
          <Text size="sm">提交人：{String(detail?.product.supplierEmail || product.supplierName || '公司管理员')}</Text>
        </Group>
        <Text size="sm" c="dimmed">
          {product.productType === 'GPU'
            ? `${product.gpuModel} ${product.gpuMemoryGb}GB × ${product.gpuCount}；${product.packageDurationHours || 0} 小时；${Number(product.packagePriceCardHours || 0).toFixed(3)} 卡时`
            : `模型：${product.modelId || '-'}`}
        </Text>
        <Alert color="blue">
          审核必须核对商品全部图片、关联 GPU
          资质和商品参数。审核结果会长期记录审核人、时间、状态与原因；供应方本人不能审核自己的商品。
        </Alert>
        {detailQuery.isLoading && <Text c="dimmed">正在加载完整审核材料…</Text>}
        {detailQuery.error && <Alert color="red">完整审核材料加载失败，请勿在材料缺失时通过。</Alert>}
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {(detail?.images || []).map((image, index) => (
            <Box key={image.id}>
              <Text size="xs" mb={4}>
                商品图片 {index + 1}
              </Text>
              <Box
                component="img"
                src={getComputeProductImageUrl(product.id, image.id)}
                alt={`商品审核图片 ${index + 1}`}
                w="100%"
                h={180}
                style={{
                  objectFit: 'contain',
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 8,
                }}
              />
            </Box>
          ))}
          {proofUrl && (
            <Box>
              <Text size="xs" mb={4}>
                关联 GPU 资源资质
              </Text>
              <Box
                component="img"
                src={proofUrl}
                alt="关联 GPU 资源资质"
                w="100%"
                h={180}
                style={{
                  objectFit: 'contain',
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 8,
                }}
              />
            </Box>
          )}
        </SimpleGrid>
        {!detailQuery.isLoading && (detail?.images.length || 0) === 0 && (
          <Alert color="yellow">供应方没有上传商品图片。请结合商品类型判断是否拒绝并要求补充。</Alert>
        )}
        {detail?.nodeProofAvailable && !proofUrl && <Text size="xs">GPU 资质图片加载中…</Text>}
        <TextInput
          label="审核说明"
          placeholder="拒绝时必须填写具体、可执行的修改原因"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <Group justify="flex-end">
          <Button
            variant="light"
            color="red"
            loading={loading}
            disabled={!reason.trim()}
            onClick={() => onReview(false, reason)}
          >
            拒绝并记录原因
          </Button>
          <Button loading={loading} disabled={!detail || detailQuery.isError} onClick={() => onReview(true, '')}>
            材料核对无误，通过
          </Button>
        </Group>
      </Stack>
    </Paper>
  )
}

export function AdminReviewHistory() {
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const historyQuery = useQuery({
    queryKey: ['compute', 'admin-review-history', category, status],
    queryFn: () => listAdminReviewHistory(category, status),
  })
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={700}>审核记录</Text>
          <Group gap="xs">
            <Button size="compact-xs" variant={category ? 'light' : 'filled'} onClick={() => setCategory('')}>
              全部类型
            </Button>
            <Button
              size="compact-xs"
              variant={status === 'APPROVED' ? 'filled' : 'light'}
              onClick={() => setStatus('APPROVED')}
            >
              已通过
            </Button>
            <Button
              size="compact-xs"
              color="red"
              variant={status === 'REJECTED' ? 'filled' : 'light'}
              onClick={() => setStatus('REJECTED')}
            >
              已拒绝
            </Button>
            {status && (
              <Button size="compact-xs" variant="subtle" onClick={() => setStatus('')}>
                清除状态筛选
              </Button>
            )}
          </Group>
        </Group>
        <Group gap="xs">
          {['IDENTITY', 'SUPPLIER', 'GPU_NODE', 'PRODUCT', 'TRANSFER'].map((value) => (
            <Button
              key={value}
              size="compact-xs"
              variant={category === value ? 'filled' : 'light'}
              onClick={() => setCategory(category === value ? '' : value)}
            >
              {reviewCategoryLabel(value)}
            </Button>
          ))}
        </Group>
        <Table.ScrollContainer minWidth={760}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>类型</Table.Th>
                <Table.Th>对象</Table.Th>
                <Table.Th>结果</Table.Th>
                <Table.Th>审核人</Table.Th>
                <Table.Th>原因/说明</Table.Th>
                <Table.Th>时间</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(historyQuery.data || []).map((entry) => (
                <Table.Tr key={entry.id}>
                  <Table.Td>{reviewCategoryLabel(entry.category)}</Table.Td>
                  <Table.Td>#{entry.targetId}</Table.Td>
                  <Table.Td>
                    <Badge color={entry.status === 'APPROVED' ? 'green' : 'red'}>
                      {entry.status === 'APPROVED' ? '已通过' : '已拒绝'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{entry.reviewerEmail || `用户 #${entry.reviewerUserId}`}</Table.Td>
                  <Table.Td>{entry.reason || '-'}</Table.Td>
                  <Table.Td>{formatDate(entry.createTime)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {!historyQuery.isLoading && (historyQuery.data || []).length === 0 && <Text c="dimmed">暂无审核记录</Text>}
      </Stack>
    </Paper>
  )
}

function useBlobUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
