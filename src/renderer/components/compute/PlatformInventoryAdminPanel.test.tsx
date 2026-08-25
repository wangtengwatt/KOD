// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformSkuAdmin, PlatformSkuAdminInput } from '@/packages/computeCenter'
import { authInfoStore } from '@/stores/authInfoStore'

const mocks = vi.hoisted(() => ({
  listAdminPlatformSkus: vi.fn(),
  upsertAdminPlatformSku: vi.fn(),
}))

vi.mock('@/packages/computeCenter', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/packages/computeCenter')>()
  return {
    ...original,
    listAdminPlatformSkus: mocks.listAdminPlatformSkus,
    upsertAdminPlatformSku: mocks.upsertAdminPlatformSku,
  }
})

import { PlatformInventoryAdminPanel } from './PlatformInventoryAdminPanel'

const sku = {
  id: '9007199254740993123',
  skuCode: 'KAI-H100-SH-8',
  name: 'KAI 上海 H100 八卡服务器',
  description: 'KAI 公司统一运维的月租算力服务器',
  region: '上海',
  gpuModel: 'H100',
  gpuMemoryGb: 80,
  gpuCount: 8,
  cpuDescription: '128 vCPU',
  ramGb: 1024,
  storageGb: 8192,
  networkDescription: '100 Gbps',
  monthlyRent: '1200.000',
  platformSalePrice: '24.000',
  packageDurationHours: 24,
  deliveryDeadlineHours: 12,
  totalInventory: 5,
  availableInventory: 3,
  allocatedInventory: 1,
  status: 'ACTIVE',
} satisfies PlatformSkuAdmin

function renderPanel(isAdmin = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MantineProvider>
          <PlatformInventoryAdminPanel isAdmin={isAdmin} />
        </MantineProvider>
      </QueryClientProvider>
    ),
  }
}

function setIdentity(accountId: string, email = `admin-${accountId}@kod.test`) {
  authInfoStore.setState({
    accountId,
    loginEmail: email,
    accessToken: `access-${accountId}`,
    refreshToken: `refresh-${accountId}`,
  })
}

function fillValidForm() {
  const values: Record<string, string> = {
    'SKU 编码': 'KAI-L40S-HZ-4',
    'SKU 名称': 'KAI 杭州 L40S 四卡服务器',
    服务器说明: '平台统一运维并自动上架',
    地区: '杭州',
    'GPU 型号': 'L40S',
    '单卡显存（GB）': '48',
    'GPU 数量': '4',
    'CPU 配置（可选）': '',
    '内存（GB）': '0',
    '存储（GB）': '0',
    '网络（可选）': '',
    月租卡时: '600.000',
    平台统一销售价: '12.500',
    '套餐时长（小时）': '24',
    '交付时限（小时）': '12',
    总库存: '2',
  }
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  setIdentity('100')
  mocks.listAdminPlatformSkus.mockResolvedValue([sku])
  mocks.upsertAdminPlatformSku.mockImplementation(async (input: PlatformSkuAdminInput) => ({
    ...input,
    id: sku.id,
    availableInventory: input.totalInventory,
    allocatedInventory: 0,
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }
  )
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
})

afterEach(() => {
  cleanup()
  authInfoStore.getState().clearTokens()
  vi.unstubAllGlobals()
})

describe('PlatformInventoryAdminPanel', () => {
  it('stays hidden and does not load administrator inventory for a non-administrator', () => {
    renderPanel(false)

    expect(screen.queryByText('平台服务器库存')).toBeNull()
    expect(mocks.listAdminPlatformSkus).not.toHaveBeenCalled()
  })

  it('renders loading, server error, and empty inventory states', async () => {
    let rejectLoad: ((error: Error) => void) | undefined
    mocks.listAdminPlatformSkus.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectLoad = reject
        })
    )
    const first = renderPanel()
    expect(screen.getByText('正在加载平台服务器库存…')).toBeTruthy()
    rejectLoad?.(new Error('库存服务暂不可用'))
    expect(await screen.findByText('平台服务器库存加载失败')).toBeTruthy()
    expect(screen.getByText('库存服务暂不可用')).toBeTruthy()
    first.unmount()

    mocks.listAdminPlatformSkus.mockResolvedValueOnce([])
    renderPanel()
    expect(await screen.findByText('尚未录入 KAI 公司服务器。')).toBeTruthy()
  })

  it('shows exact server specifications, prices, allocation, availability, and active state', async () => {
    renderPanel()

    const card =
      (await screen.findByText(sku.name)).closest('[data-with-border]') || screen.getByText(sku.name).parentElement
    expect(card).toBeTruthy()
    const scope = within(card as HTMLElement)
    expect(scope.getByText('KAI-H100-SH-8')).toBeTruthy()
    expect(scope.getByText('H100 × 8 · 单卡显存 80GB')).toBeTruthy()
    expect(scope.getByText('128 vCPU · 内存 1024GB · 存储 8192GB · 100 Gbps')).toBeTruthy()
    expect(scope.getByText('月租 1200.000 卡时')).toBeTruthy()
    expect(scope.getByText('平台统一销售价 24.000 卡时 / 24 小时')).toBeTruthy()
    expect(scope.getByText('交付时限 12 小时')).toBeTruthy()
    expect(scope.getByText('总量 5')).toBeTruthy()
    expect(scope.getByText('已分配 1')).toBeTruthy()
    expect(scope.getByText('可用 3')).toBeTruthy()
    expect(scope.getByText('启用中')).toBeTruthy()
  })

  it('rejects invalid fields locally while allowing zero memory/storage and blank optional descriptions', async () => {
    mocks.listAdminPlatformSkus.mockResolvedValue([])
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: '保存 SKU' }))
    expect(await screen.findByText('SKU 编码不能为空')).toBeTruthy()
    expect(screen.getByText('单卡显存必须大于 0')).toBeTruthy()
    expect(screen.getByText('月租卡时必须大于 0')).toBeTruthy()
    expect(mocks.upsertAdminPlatformSku).not.toHaveBeenCalled()

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: '保存 SKU' }))

    await waitFor(() =>
      expect(mocks.upsertAdminPlatformSku).toHaveBeenCalledWith(
        expect.objectContaining({
          skuCode: 'KAI-L40S-HZ-4',
          cpuDescription: '',
          ramGb: 0,
          storageGb: 0,
          networkDescription: '',
          monthlyRent: '600.000',
          platformSalePrice: '12.500',
        })
      )
    )
  })

  it('reports exact upper and lower validation boundaries before sending a request', async () => {
    mocks.listAdminPlatformSkus.mockResolvedValue([])
    renderPanel()
    fillValidForm()
    fireEvent.change(screen.getByLabelText('SKU 编码'), { target: { value: 'S'.repeat(65) } })
    fireEvent.change(screen.getByLabelText('套餐时长（小时）'), { target: { value: '8761' } })
    fireEvent.change(screen.getByLabelText('交付时限（小时）'), { target: { value: '721' } })
    fireEvent.change(screen.getByLabelText('总库存'), { target: { value: '-1' } })
    fireEvent.click(screen.getByRole('button', { name: '保存 SKU' }))

    expect(await screen.findByText('SKU 编码不能超过 64 个字符')).toBeTruthy()
    expect(screen.getByText('套餐时长不能超过 8760 小时')).toBeTruthy()
    expect(screen.getByText('交付时限不能超过 720 小时')).toBeTruthy()
    expect(screen.getByText('总库存不能小于 0')).toBeTruthy()
    expect(mocks.upsertAdminPlatformSku).not.toHaveBeenCalled()
  })

  it('rejects an invalid SKU code and Java-int overflow locally without requesting', async () => {
    mocks.listAdminPlatformSkus.mockResolvedValue([])
    renderPanel()
    fillValidForm()
    fireEvent.change(screen.getByLabelText('SKU 编码'), { target: { value: ' kai/h100 ' } })
    fireEvent.change(screen.getByLabelText('单卡显存（GB）'), { target: { value: '2147483648' } })
    fireEvent.click(screen.getByRole('button', { name: '保存 SKU' }))

    expect(await screen.findByText('SKU 编码只能包含字母、数字、点、连字符和下划线')).toBeTruthy()
    expect(screen.getByText('单卡显存不能超过 2147483647')).toBeTruthy()
    expect(mocks.upsertAdminPlatformSku).not.toHaveBeenCalled()
  })

  it('updates one SKU idempotently and visibly confirms the server audit result', async () => {
    let serverSku: PlatformSkuAdmin = sku
    mocks.listAdminPlatformSkus.mockImplementation(async () => [serverSku])
    mocks.upsertAdminPlatformSku.mockImplementation((input: PlatformSkuAdminInput) => {
      serverSku = { ...serverSku, ...input, availableInventory: 3 }
      return Promise.resolve(serverSku)
    })
    const { queryClient } = renderPanel()
    const invalidation = vi.spyOn(queryClient, 'invalidateQueries')

    fireEvent.click(await screen.findByRole('button', { name: `编辑 ${sku.skuCode}` }))
    fireEvent.change(screen.getByLabelText('SKU 名称'), { target: { value: 'KAI 上海 H100 统一库存' } })
    fireEvent.click(screen.getByRole('button', { name: '保存 SKU' }))

    expect(await screen.findByText('KAI 上海 H100 统一库存')).toBeTruthy()
    expect(screen.getByText('SKU KAI-H100-SH-8 已保存，服务端已核验最新配置。')).toBeTruthy()
    expect(screen.getAllByText('KAI-H100-SH-8')).toHaveLength(1)
    expect(invalidation).toHaveBeenCalledWith({
      queryKey: ['compute', 'account:100', 'admin', 'platform-hosting', 'skus'],
    })
    expect(invalidation).toHaveBeenCalledWith({
      queryKey: ['compute', 'account:100', 'platform-hosting', 'skus'],
    })
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ['compute', 'platform-hosting', 'skus'] })

    fireEvent.click(screen.getByRole('button', { name: `编辑 ${sku.skuCode}` }))
    fireEvent.click(screen.getByRole('button', { name: '保存 SKU' }))
    await waitFor(() => expect(mocks.upsertAdminPlatformSku).toHaveBeenCalledTimes(2))
    expect(screen.getAllByText('KAI-H100-SH-8')).toHaveLength(1)
  })

  it('shows server validation verbatim and never reports optimistic success', async () => {
    mocks.upsertAdminPlatformSku.mockRejectedValue(new Error('总库存不能低于已分配数量 2'))
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: `编辑 ${sku.skuCode}` }))
    fireEvent.change(screen.getByLabelText('总库存'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: '保存 SKU' }))

    expect(await screen.findByText('总库存不能低于已分配数量 2')).toBeTruthy()
    expect(screen.queryByText(/已保存，服务端已核验/)).toBeNull()
  })

  it('discards an old account list response after switching identities', async () => {
    let resolveAccountA: ((rows: PlatformSkuAdmin[]) => void) | undefined
    mocks.listAdminPlatformSkus.mockImplementation(() => {
      if (authInfoStore.getState().accountId === '100') {
        return new Promise<PlatformSkuAdmin[]>((resolve) => {
          resolveAccountA = resolve
        })
      }
      return Promise.resolve([{ ...sku, id: '9007199254740993999', skuCode: 'KAI-B', name: '账户 B 库存' }])
    })
    renderPanel()
    expect(screen.getByText('正在加载平台服务器库存…')).toBeTruthy()

    act(() => setIdentity('200'))
    expect(await screen.findByText('账户 B 库存')).toBeTruthy()
    await act(async () => {
      resolveAccountA?.([{ ...sku, name: '账户 A 过期库存' }])
      await Promise.resolve()
    })

    expect(screen.queryByText('账户 A 过期库存')).toBeNull()
    expect(screen.getByText('账户 B 库存')).toBeTruthy()
  })

  it('ignores an old account save response and clears its form feedback on identity change', async () => {
    let resolveSave: ((row: PlatformSkuAdmin) => void) | undefined
    mocks.upsertAdminPlatformSku.mockImplementationOnce(
      () =>
        new Promise<PlatformSkuAdmin>((resolve) => {
          resolveSave = resolve
        })
    )
    mocks.listAdminPlatformSkus.mockImplementation(async () =>
      authInfoStore.getState().accountId === '100'
        ? [sku]
        : [{ ...sku, id: '9007199254740993999', skuCode: 'KAI-B', name: '账户 B 库存' }]
    )
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: `编辑 ${sku.skuCode}` }))
    fireEvent.change(screen.getByLabelText('SKU 名称'), { target: { value: '账户 A 保存结果' } })
    fireEvent.click(screen.getByRole('button', { name: '保存 SKU' }))
    await waitFor(() => expect(mocks.upsertAdminPlatformSku).toHaveBeenCalledTimes(1))

    act(() => setIdentity('200'))
    expect(await screen.findByText('账户 B 库存')).toBeTruthy()
    await act(async () => {
      resolveSave?.({ ...sku, name: '账户 A 保存结果' })
      await Promise.resolve()
    })

    expect(screen.queryByText('账户 A 保存结果')).toBeNull()
    expect(screen.queryByText(/已保存，服务端已核验/)).toBeNull()
    expect(screen.getByText('账户 B 库存')).toBeTruthy()
  })
})
