// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminNodeProof: vi.fn(),
  getAdminProductReviewDetail: vi.fn(),
  listAdminReviewHistory: vi.fn(),
}))

vi.mock('@/packages/computeCenter', () => ({
  getAdminNodeProof: mocks.getAdminNodeProof,
  getComputeProductImageUrl: (productId: number, imageId: number) =>
    `https://kod.test/api/compute/products/${productId}/images/${imageId}`,
}))
vi.mock('@/packages/computeMarketplace/api', () => ({
  getAdminProductReviewDetail: mocks.getAdminProductReviewDetail,
  listAdminReviewHistory: mocks.listAdminReviewHistory,
}))

import { AdminProductReviewCard, AdminReviewHistory } from './AdminMarketplaceReview'

const product = {
  id: 19,
  productType: 'GPU' as const,
  tradeMode: 'MARKETPLACE_FIXED' as const,
  name: 'H100 托管套餐',
  description: '测试商品',
  region: '上海',
  status: 'PENDING' as const,
  gpuModel: 'H100',
  gpuMemoryGb: 80,
  gpuCount: 1,
  packageDurationHours: 24,
  packagePriceCardHours: 24,
  supplierName: '供应方',
  coverImageId: 31,
  createTime: '2026-08-21T10:00:00',
}

function renderWithProviders(children: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>{children}</MantineProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
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
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }
  )
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:proof'),
    revokeObjectURL: vi.fn(),
  })
  mocks.getAdminProductReviewDetail.mockResolvedValue({
    product: { ...product, supplierEmail: 'supplier@kai.com' },
    images: [
      { id: 31, sortOrder: 0, mimeType: 'image/jpeg', createTime: '2026-08-21T10:00:00' },
      { id: 32, sortOrder: 1, mimeType: 'image/png', createTime: '2026-08-21T10:00:01' },
    ],
    revision: {
      id: 4,
      revisionNo: 3,
      status: 'PENDING',
      submittedBy: '7',
      submittedAt: '2026-08-21T10:00:00',
    },
    nodeProofAvailable: true,
    nodeId: 8,
  })
  mocks.getAdminNodeProof.mockResolvedValue(new Blob(['proof'], { type: 'image/jpeg' }))
  mocks.listAdminReviewHistory.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('admin marketplace review', () => {
  it('shows every product image, linked GPU proof and immutable revision metadata before approval', async () => {
    renderWithProviders(<AdminProductReviewCard product={product} loading={false} onReview={vi.fn()} />)

    expect(await screen.findByText('第 3 版')).toBeTruthy()
    expect(screen.getByText('提交人：supplier@kai.com')).toBeTruthy()
    expect(screen.getByAltText('商品审核图片 1').getAttribute('src')).toBe(
      'https://kod.test/api/compute/products/19/images/31'
    )
    expect(screen.getByAltText('商品审核图片 2')).toBeTruthy()
    await waitFor(() => expect(screen.getByAltText('关联 GPU 资源资质').getAttribute('src')).toBe('blob:proof'))
  })

  it('renders durable audit status, reviewer, reason and all five category filters', async () => {
    mocks.listAdminReviewHistory.mockResolvedValue([
      {
        id: 1,
        category: 'PRODUCT',
        targetType: 'PRODUCT',
        targetId: '19',
        reviewerUserId: '2',
        reviewerEmail: 'reviewer@kai.com',
        status: 'REJECTED',
        reason: '图片与规格不一致',
        createTime: '2026-08-21T11:00:00',
      },
    ])
    renderWithProviders(<AdminReviewHistory />)

    expect(await screen.findByText('reviewer@kai.com')).toBeTruthy()
    expect(screen.getByText('图片与规格不一致')).toBeTruthy()
    expect(screen.getAllByText('已拒绝').length).toBeGreaterThan(0)
    for (const label of ['实名认证', '供应方', 'GPU 资质', '商品', '大额转让']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })
})
