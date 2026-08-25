import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useComputeQueryKey, useWalletIdentity } from '@/hooks/useWallet'
import {
  listAdminPlatformSkus,
  type PlatformSkuAdmin,
  type PlatformSkuAdminInput,
  PlatformSkuAdminInputSchema,
  upsertAdminPlatformSku,
} from '@/packages/computeCenter'

const LEGACY_PUBLIC_PLATFORM_SKUS_QUERY_KEY = ['compute', 'platform-hosting', 'skus'] as const

const FIELD_LABELS = {
  skuCode: 'SKU 编码',
  name: 'SKU 名称',
  description: '服务器说明',
  region: '地区',
  gpuModel: 'GPU 型号',
  gpuMemoryGb: '单卡显存',
  gpuCount: 'GPU 数量',
  cpuDescription: 'CPU 配置',
  ramGb: '内存',
  storageGb: '存储',
  networkDescription: '网络',
  monthlyRent: '月租卡时',
  platformSalePrice: '平台统一销售价',
  packageDurationHours: '套餐时长',
  deliveryDeadlineHours: '交付时限',
  totalInventory: '总库存',
  status: '启用状态',
} satisfies Record<keyof PlatformSkuAdminInput, string>

type FormErrors = Partial<Record<keyof PlatformSkuAdminInput, string>>

export function PlatformInventoryAdminPanel({ isAdmin }: { isAdmin: boolean }) {
  const identity = useWalletIdentity()
  const queryIdentity = identity ?? 'signed-out'
  const computeQueryKey = useComputeQueryKey()
  const queryClient = useQueryClient()
  const currentIdentityRef = useRef(queryIdentity)
  currentIdentityRef.current = queryIdentity
  const previousIdentityRef = useRef(queryIdentity)
  const [editingSkuCode, setEditingSkuCode] = useState<string | null>(null)
  const [form, setForm] = useState<PlatformSkuAdminInput>(emptyForm)
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [feedback, setFeedback] = useState<{ color: 'green' | 'red'; text: string } | null>(null)
  const adminQueryKey = computeQueryKey('admin', 'platform-hosting', 'skus')
  const publicQueryKey = computeQueryKey('platform-hosting', 'skus')

  const inventoryQuery = useQuery({
    queryKey: adminQueryKey,
    queryFn: listAdminPlatformSkus,
    enabled: isAdmin && identity !== null,
    retry: false,
  })

  const saveMutation = useMutation({
    mutationFn: ({ input }: { input: PlatformSkuAdminInput; identity: string }) => upsertAdminPlatformSku(input),
    onSuccess: async (saved, variables) => {
      if (currentIdentityRef.current !== variables.identity) return
      queryClient.setQueryData<PlatformSkuAdmin[]>(adminQueryKey, (current = []) => upsertSku(current, saved))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminQueryKey }),
        queryClient.invalidateQueries({ queryKey: publicQueryKey }),
        queryClient.invalidateQueries({ queryKey: LEGACY_PUBLIC_PLATFORM_SKUS_QUERY_KEY }),
      ])
      if (currentIdentityRef.current !== variables.identity) return
      setEditingSkuCode(null)
      setForm(emptyForm())
      setFormErrors({})
      setFeedback({ color: 'green', text: `SKU ${saved.skuCode} 已保存；审计记录由服务端生成。` })
    },
    onError: (error, variables) => {
      if (currentIdentityRef.current !== variables.identity) return
      setFeedback({ color: 'red', text: errorMessage(error) })
    },
  })

  useEffect(() => {
    if (previousIdentityRef.current === queryIdentity) return
    previousIdentityRef.current = queryIdentity
    setEditingSkuCode(null)
    setForm(emptyForm())
    setFormErrors({})
    setFeedback(null)
    saveMutation.reset()
  }, [queryIdentity, saveMutation.reset])

  if (!isAdmin || identity === null) return null

  const skus = inventoryQuery.data || []

  const submit = () => {
    setFeedback(null)
    const normalized = normalizeForm(form)
    const parsed = PlatformSkuAdminInputSchema.safeParse(normalized)
    if (!parsed.success) {
      setFormErrors(validationErrors(parsed.error.issues, normalized))
      return
    }
    setFormErrors({})
    saveMutation.mutate({ input: parsed.data, identity: queryIdentity })
  }

  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Title order={4}>平台服务器库存</Title>
        <Text size="sm" c="dimmed" mt={4}>
          在这里录入 KAI 公司的月租算力服务器。平台统一管理月租、销售价、库存和启用状态。
        </Text>
      </Paper>

      {inventoryQuery.isLoading && <Text c="dimmed">正在加载平台服务器库存…</Text>}
      {inventoryQuery.isError && (
        <Alert color="red" title="平台服务器库存加载失败">
          <Stack gap="xs">
            <Text size="sm">{errorMessage(inventoryQuery.error)}</Text>
            <Button size="xs" variant="light" onClick={() => void inventoryQuery.refetch()}>
              重新加载
            </Button>
          </Stack>
        </Alert>
      )}
      {feedback && <Alert color={feedback.color}>{feedback.text}</Alert>}

      {!inventoryQuery.isLoading && !inventoryQuery.isError && skus.length === 0 && (
        <Text c="dimmed">尚未录入 KAI 公司服务器。</Text>
      )}

      {skus.length > 0 && (
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          {skus.map((sku) => (
            <InventoryCard key={sku.id} sku={sku} onEdit={() => startEditing(sku, setEditingSkuCode, setForm)} />
          ))}
        </SimpleGrid>
      )}

      <Paper component="form" withBorder p="md" radius="md" onSubmit={(event) => event.preventDefault()}>
        <Group justify="space-between" align="flex-start" mb="md">
          <div>
            <Title order={5}>{editingSkuCode ? `编辑 ${editingSkuCode}` : '新增服务器 SKU'}</Title>
            <Text size="xs" c="dimmed" mt={2}>
              保存相同 SKU 编码会幂等更新，不会重复创建库存。
            </Text>
          </div>
          {editingSkuCode && (
            <Button
              size="xs"
              variant="default"
              onClick={() => {
                setEditingSkuCode(null)
                setForm(emptyForm())
                setFormErrors({})
                setFeedback(null)
              }}
            >
              取消编辑
            </Button>
          )}
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
          <TextInput
            label="SKU 编码"
            value={form.skuCode}
            disabled={editingSkuCode !== null}
            error={formErrors.skuCode}
            onChange={(event) => setField(setForm, 'skuCode', event.currentTarget.value)}
          />
          <TextInput
            label="SKU 名称"
            value={form.name}
            error={formErrors.name}
            onChange={(event) => setField(setForm, 'name', event.currentTarget.value)}
          />
          <TextInput
            label="地区"
            value={form.region}
            error={formErrors.region}
            onChange={(event) => setField(setForm, 'region', event.currentTarget.value)}
          />
          <TextInput
            label="GPU 型号"
            value={form.gpuModel}
            error={formErrors.gpuModel}
            onChange={(event) => setField(setForm, 'gpuModel', event.currentTarget.value)}
          />
          <NumberInput
            label="单卡显存（GB）"
            min={1}
            clampBehavior="none"
            allowDecimal={false}
            value={form.gpuMemoryGb}
            error={formErrors.gpuMemoryGb}
            onChange={(value) => setField(setForm, 'gpuMemoryGb', numericValue(value))}
          />
          <NumberInput
            label="GPU 数量"
            min={1}
            clampBehavior="none"
            allowDecimal={false}
            value={form.gpuCount}
            error={formErrors.gpuCount}
            onChange={(value) => setField(setForm, 'gpuCount', numericValue(value))}
          />
          <TextInput
            label="CPU 配置（可选）"
            value={form.cpuDescription}
            error={formErrors.cpuDescription}
            onChange={(event) => setField(setForm, 'cpuDescription', event.currentTarget.value)}
          />
          <NumberInput
            label="内存（GB）"
            min={0}
            clampBehavior="none"
            allowDecimal={false}
            value={form.ramGb}
            error={formErrors.ramGb}
            onChange={(value) => setField(setForm, 'ramGb', numericValue(value))}
          />
          <NumberInput
            label="存储（GB）"
            min={0}
            clampBehavior="none"
            allowDecimal={false}
            value={form.storageGb}
            error={formErrors.storageGb}
            onChange={(value) => setField(setForm, 'storageGb', numericValue(value))}
          />
          <TextInput
            label="网络（可选）"
            value={form.networkDescription}
            error={formErrors.networkDescription}
            onChange={(event) => setField(setForm, 'networkDescription', event.currentTarget.value)}
          />
          <TextInput
            label="月租卡时"
            inputMode="decimal"
            value={form.monthlyRent}
            error={formErrors.monthlyRent}
            onChange={(event) => setField(setForm, 'monthlyRent', event.currentTarget.value)}
          />
          <TextInput
            label="平台统一销售价"
            inputMode="decimal"
            value={form.platformSalePrice}
            error={formErrors.platformSalePrice}
            onChange={(event) => setField(setForm, 'platformSalePrice', event.currentTarget.value)}
          />
          <NumberInput
            label="套餐时长（小时）"
            min={1}
            max={8760}
            clampBehavior="none"
            allowDecimal={false}
            value={form.packageDurationHours}
            error={formErrors.packageDurationHours}
            onChange={(value) => setField(setForm, 'packageDurationHours', numericValue(value))}
          />
          <NumberInput
            label="交付时限（小时）"
            min={1}
            max={720}
            clampBehavior="none"
            allowDecimal={false}
            value={form.deliveryDeadlineHours}
            error={formErrors.deliveryDeadlineHours}
            onChange={(value) => setField(setForm, 'deliveryDeadlineHours', numericValue(value))}
          />
          <NumberInput
            label="总库存"
            min={0}
            clampBehavior="none"
            allowDecimal={false}
            value={form.totalInventory}
            error={formErrors.totalInventory}
            onChange={(value) => setField(setForm, 'totalInventory', numericValue(value))}
          />
          <Select
            label="启用状态"
            value={form.status}
            allowDeselect={false}
            data={[
              { value: 'ACTIVE', label: '启用' },
              { value: 'DISABLED', label: '停用' },
            ]}
            error={formErrors.status}
            onChange={(value) => setField(setForm, 'status', value === 'DISABLED' ? 'DISABLED' : 'ACTIVE')}
          />
        </SimpleGrid>
        <Textarea
          mt="sm"
          label="服务器说明"
          minRows={2}
          value={form.description}
          error={formErrors.description}
          onChange={(event) => setField(setForm, 'description', event.currentTarget.value)}
        />
        <Group justify="flex-end" mt="md">
          <Button loading={saveMutation.isPending} onClick={submit}>
            保存 SKU
          </Button>
        </Group>
      </Paper>
    </Stack>
  )
}

function InventoryCard({ sku, onEdit }: { sku: PlatformSkuAdmin; onEdit: () => void }) {
  const allocatedInventory = sku.totalInventory - sku.availableInventory
  const hardware = [
    sku.cpuDescription,
    `内存 ${sku.ramGb}GB`,
    `存储 ${sku.storageGb}GB`,
    sku.networkDescription,
  ].filter(Boolean)
  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text fw={700}>{sku.name}</Text>
            <Group gap="xs" mt={4}>
              <Badge variant="light">{sku.skuCode}</Badge>
              <Badge color={sku.status === 'ACTIVE' ? 'teal' : 'gray'}>
                {sku.status === 'ACTIVE' ? '启用中' : '已停用'}
              </Badge>
            </Group>
          </div>
          <Button size="xs" variant="default" aria-label={`编辑 ${sku.skuCode}`} onClick={onEdit}>
            编辑
          </Button>
        </Group>
        <Text size="sm" c="dimmed">
          {sku.region} · {sku.description || '暂无说明'}
        </Text>
        <Text size="sm">
          {sku.gpuModel} × {sku.gpuCount} · 单卡显存 {sku.gpuMemoryGb}GB
        </Text>
        <Text size="sm">{hardware.join(' · ')}</Text>
        <Text fw={700}>月租 {sku.monthlyRent} 卡时</Text>
        <Text size="sm">
          平台统一销售价 {sku.platformSalePrice} 卡时 / {sku.packageDurationHours} 小时
        </Text>
        <Group gap="xs">
          <Badge color="gray" variant="light">
            总量 {sku.totalInventory}
          </Badge>
          <Badge color="teal" variant="light">
            已分配 {allocatedInventory}
          </Badge>
          <Badge color={sku.availableInventory > 0 ? 'green' : 'gray'} variant="light">
            可用 {sku.availableInventory}
          </Badge>
        </Group>
      </Stack>
    </Card>
  )
}

function startEditing(
  sku: PlatformSkuAdmin,
  setEditingSkuCode: (value: string) => void,
  setForm: (value: PlatformSkuAdminInput) => void
) {
  setEditingSkuCode(sku.skuCode)
  setForm({
    skuCode: sku.skuCode,
    name: sku.name,
    description: sku.description,
    region: sku.region,
    gpuModel: sku.gpuModel,
    gpuMemoryGb: sku.gpuMemoryGb,
    gpuCount: sku.gpuCount,
    cpuDescription: sku.cpuDescription,
    ramGb: sku.ramGb,
    storageGb: sku.storageGb,
    networkDescription: sku.networkDescription,
    monthlyRent: sku.monthlyRent,
    platformSalePrice: sku.platformSalePrice,
    packageDurationHours: sku.packageDurationHours,
    deliveryDeadlineHours: sku.deliveryDeadlineHours,
    totalInventory: sku.totalInventory,
    status: sku.status,
  })
}

function emptyForm(): PlatformSkuAdminInput {
  return {
    skuCode: '',
    name: '',
    description: '',
    region: '',
    gpuModel: '',
    gpuMemoryGb: 0,
    gpuCount: 1,
    cpuDescription: '',
    ramGb: 0,
    storageGb: 0,
    networkDescription: '',
    monthlyRent: '',
    platformSalePrice: '',
    packageDurationHours: 24,
    deliveryDeadlineHours: 12,
    totalInventory: 0,
    status: 'ACTIVE',
  }
}

function normalizeForm(form: PlatformSkuAdminInput): PlatformSkuAdminInput {
  return {
    ...form,
    skuCode: form.skuCode.trim(),
    name: form.name.trim(),
    description: form.description.trim(),
    region: form.region.trim(),
    gpuModel: form.gpuModel.trim(),
    cpuDescription: form.cpuDescription.trim(),
    networkDescription: form.networkDescription.trim(),
    monthlyRent: form.monthlyRent.trim(),
    platformSalePrice: form.platformSalePrice.trim(),
  }
}

function validationErrors(issues: Array<{ path: PropertyKey[] }>, input: PlatformSkuAdminInput): FormErrors {
  const errors: FormErrors = {}
  for (const issue of issues) {
    const field = issue.path[0]
    if (typeof field !== 'string' || !(field in FIELD_LABELS) || errors[field as keyof PlatformSkuAdminInput]) {
      continue
    }
    const typedField = field as keyof PlatformSkuAdminInput
    errors[typedField] = validationMessage(typedField, input[typedField])
  }
  return errors
}

function validationMessage(
  field: keyof PlatformSkuAdminInput,
  value: PlatformSkuAdminInput[keyof PlatformSkuAdminInput]
) {
  const label = FIELD_LABELS[field]
  const textLimits: Partial<Record<keyof PlatformSkuAdminInput, number>> = {
    skuCode: 64,
    name: 128,
    description: 1000,
    region: 128,
    gpuModel: 128,
    cpuDescription: 256,
    networkDescription: 256,
  }
  if (['skuCode', 'name', 'region', 'gpuModel'].includes(field) && String(value).trim().length === 0) {
    return `${label}不能为空`
  }
  const textLimit = textLimits[field]
  if (textLimit !== undefined && String(value).length > textLimit) {
    return `${label}不能超过 ${textLimit} 个字符`
  }
  const numeric = typeof value === 'number' ? value : Number.NaN
  if (field === 'packageDurationHours' && numeric > 8760) {
    return '套餐时长不能超过 8760 小时'
  }
  if (field === 'deliveryDeadlineHours' && numeric > 720) {
    return '交付时限不能超过 720 小时'
  }
  if (
    ['gpuMemoryGb', 'gpuCount', 'packageDurationHours', 'deliveryDeadlineHours'].includes(field) &&
    (!Number.isSafeInteger(numeric) || numeric <= 0)
  ) {
    return `${label}必须大于 0`
  }
  if (['ramGb', 'storageGb', 'totalInventory'].includes(field) && (!Number.isSafeInteger(numeric) || numeric < 0)) {
    return `${label}不能小于 0`
  }
  if (field === 'monthlyRent' || field === 'platformSalePrice') {
    if (String(value).trim() === '' || /^0+(?:\.0+)?$/.test(String(value).trim())) {
      return `${label}必须大于 0`
    }
    return `${label}必须是大于 0 的十进制数`
  }
  return `${label}格式不正确`
}

function numericValue(value: string | number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function setField<K extends keyof PlatformSkuAdminInput>(
  setForm: React.Dispatch<React.SetStateAction<PlatformSkuAdminInput>>,
  field: K,
  value: PlatformSkuAdminInput[K]
) {
  setForm((current) => ({ ...current, [field]: value }))
}

function upsertSku(current: PlatformSkuAdmin[], saved: PlatformSkuAdmin) {
  const existingIndex = current.findIndex((item) => item.id === saved.id || item.skuCode === saved.skuCode)
  if (existingIndex < 0) return [...current, saved]
  return current.map((item, index) => (index === existingIndex ? saved : item))
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败'
}
