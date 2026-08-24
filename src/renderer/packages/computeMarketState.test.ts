import { describe, expect, it } from 'vitest'
import type { ComputeProduct } from './computeCenter'
import {
  type ComputeProductLikeCounts,
  filterAndSortComputeProducts,
  getComputeProductLikeCount,
  incrementComputeProductLikeCount,
  normalizeComputeProductLikeCounts,
} from './computeMarketState'

function createProduct(overrides: Partial<ComputeProduct> = {}): ComputeProduct {
  return {
    id: 1,
    productType: 'GPU',
    name: 'H100 GPU 资源',
    description: '高性能 GPU 套餐',
    region: '上海',
    status: 'PUBLISHED',
    gpuModel: 'H100',
    gpuMemoryGb: 80,
    gpuCount: 1,
    packageDurationHours: 24,
    packagePriceCardHours: 24,
    supplierName: 'KOD',
    createTime: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('compute market state', () => {
  it('先搜索再对匹配商品按点赞数排序', () => {
    const products = [
      createProduct({ id: 1, name: 'H100 上海' }),
      createProduct({ id: 2, name: 'H100 北京' }),
      createProduct({ id: 3, name: 'A100 上海', gpuModel: 'A100' }),
      createProduct({ id: 4, productType: 'API', name: 'H100 API' }),
    ]

    const result = filterAndSortComputeProducts({
      products,
      productType: 'GPU',
      keyword: 'H100',
      sortMode: 'likes',
      likeCounts: { '1': 2, '2': 5, '3': 100, '4': 200 },
    })

    expect(result.map((product) => product.id)).toEqual([2, 1])
    expect(products.map((product) => product.id)).toEqual([1, 2, 3, 4])
  })

  it('无搜索词时对当前类型的全部商品按性价比排序', () => {
    const products = [
      createProduct({ id: 1, gpuMemoryGb: 80, gpuCount: 1, packagePriceCardHours: 40 }),
      createProduct({ id: 2, gpuMemoryGb: 80, gpuCount: 2, packagePriceCardHours: 40 }),
      createProduct({ id: 3, gpuMemoryGb: 96, gpuCount: 1, packagePriceCardHours: 20 }),
    ]

    const result = filterAndSortComputeProducts({
      products,
      productType: 'GPU',
      keyword: '',
      sortMode: 'value',
      likeCounts: {},
    })

    expect(result.map((product) => product.id)).toEqual([3, 2, 1])
  })

  it('支持性能、评论数和热度排序', () => {
    const products = [
      createProduct({ id: 1, performanceScore: 20, commentCount: 9, heatScore: 2 }),
      createProduct({ id: 2, performanceScore: 50, commentCount: 3, heatScore: 8 }),
    ]

    expect(
      filterAndSortComputeProducts({
        products,
        productType: 'GPU',
        keyword: '',
        sortMode: 'performance',
        likeCounts: {},
      }).map((product) => product.id)
    ).toEqual([2, 1])
    expect(
      filterAndSortComputeProducts({
        products,
        productType: 'GPU',
        keyword: '',
        sortMode: 'comments',
        likeCounts: {},
      }).map((product) => product.id)
    ).toEqual([1, 2])
    expect(
      filterAndSortComputeProducts({ products, productType: 'GPU', keyword: '', sortMode: 'heat', likeCounts: {} }).map(
        (product) => product.id
      )
    ).toEqual([2, 1])
  })

  it('同一商品可以连续点赞任意次数且不影响其他商品', () => {
    let counts: ComputeProductLikeCounts = { '2': 7 }
    for (let index = 0; index < 100; index += 1) counts = incrementComputeProductLikeCount(counts, 1)

    expect(counts).toEqual({ '1': 100, '2': 7 })
    expect(getComputeProductLikeCount(createProduct({ id: 1, likeCount: 5 }), counts)).toBe(105)
  })

  it('损坏的存储数据会安全回退并丢弃非法计数', () => {
    expect(normalizeComputeProductLikeCounts(null)).toEqual({})
    expect(normalizeComputeProductLikeCounts([])).toEqual({})
    expect(
      normalizeComputeProductLikeCounts({
        '1': 3,
        '2': -2,
        '3': '4.9',
        invalid: 10,
        '4': null,
      })
    ).toEqual({ '1': 3, '3': 4 })
  })
})
