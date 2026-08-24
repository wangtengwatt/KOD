import type { ComputeProduct, ProductType } from './computeCenter'

export type ComputeProductSortMode = 'heat' | 'performance' | 'value' | 'likes' | 'comments'

export type ComputeProductLikeCounts = Record<string, number>

export const COMPUTE_PRODUCT_LIKE_COUNTS_KEY = 'compute-center:product-like-counts:v1'

export const COMPUTE_PRODUCT_SORT_OPTIONS: Array<{ value: ComputeProductSortMode; label: string }> = [
  { value: 'heat', label: '按热度' },
  { value: 'performance', label: '按性能' },
  { value: 'value', label: '性价比' },
  { value: 'likes', label: '点赞数' },
  { value: 'comments', label: '评论数' },
]

function nonNegativeNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function nonNegativeInteger(value: unknown) {
  return Math.floor(nonNegativeNumber(value))
}

export function normalizeComputeProductLikeCounts(value: unknown): ComputeProductLikeCounts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const counts: ComputeProductLikeCounts = {}
  for (const [productId, count] of Object.entries(value)) {
    if (!/^\d+$/.test(productId)) continue
    const normalizedCount = nonNegativeInteger(count)
    if (normalizedCount > 0) counts[productId] = normalizedCount
  }
  return counts
}

export function incrementComputeProductLikeCount(
  counts: ComputeProductLikeCounts,
  productId: number
): ComputeProductLikeCounts {
  const key = String(productId)
  return {
    ...counts,
    [key]: nonNegativeInteger(counts[key]) + 1,
  }
}

export function getComputeProductLikeCount(product: ComputeProduct, localCounts: ComputeProductLikeCounts) {
  return nonNegativeInteger(product.likeCount) + nonNegativeInteger(localCounts[String(product.id)])
}

export function getComputeProductCommentCount(product: ComputeProduct) {
  return nonNegativeInteger(product.commentCount)
}

export function getComputeProductPerformanceScore(product: ComputeProduct) {
  const explicitScore = nonNegativeNumber(product.performanceScore)
  if (explicitScore > 0) return explicitScore

  if (product.productType === 'GPU') {
    return nonNegativeNumber(product.gpuMemoryGb) * nonNegativeNumber(product.gpuCount)
  }

  return nonNegativeNumber(product.packagePromptTokens) + nonNegativeNumber(product.packageCompletionTokens)
}

export function getComputeProductValueScore(product: ComputeProduct) {
  const price = nonNegativeNumber(product.packagePriceCardHours)
  if (price <= 0) return Number.NEGATIVE_INFINITY
  const packageSize = product.productType === 'GPU' ? Math.max(nonNegativeNumber(product.packageDurationHours), 1) : 1
  return (getComputeProductPerformanceScore(product) * packageSize) / price
}

function getComputeProductHeatScore(product: ComputeProduct, localCounts: ComputeProductLikeCounts) {
  const explicitScore = nonNegativeNumber(product.heatScore)
  if (explicitScore > 0) return explicitScore
  return getComputeProductLikeCount(product, localCounts) * 2 + getComputeProductCommentCount(product) * 3
}

function getSortScore(
  product: ComputeProduct,
  sortMode: ComputeProductSortMode,
  localCounts: ComputeProductLikeCounts
) {
  switch (sortMode) {
    case 'performance':
      return getComputeProductPerformanceScore(product)
    case 'value':
      return getComputeProductValueScore(product)
    case 'likes':
      return getComputeProductLikeCount(product, localCounts)
    case 'comments':
      return getComputeProductCommentCount(product)
    case 'heat':
      return getComputeProductHeatScore(product, localCounts)
  }
}

function compareScoresDescending(left: number, right: number) {
  if (left === right) return 0
  if (left === Number.NEGATIVE_INFINITY) return 1
  if (right === Number.NEGATIVE_INFINITY) return -1
  return right - left
}

export function filterAndSortComputeProducts({
  products,
  productType,
  keyword,
  sortMode,
  likeCounts,
}: {
  products: ComputeProduct[]
  productType: ProductType
  keyword: string
  sortMode: ComputeProductSortMode
  likeCounts: ComputeProductLikeCounts
}) {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase('zh-CN')
  const filtered = products.filter((product) => {
    if (product.productType !== productType) return false
    if (!normalizedKeyword) return true
    return [
      product.name,
      product.description,
      product.region,
      product.modelId,
      product.gpuModel,
      product.supplierName,
    ].some((value) => value?.toLocaleLowerCase('zh-CN').includes(normalizedKeyword))
  })

  return filtered
    .map((product, index) => ({ product, index }))
    .sort((left, right) => {
      const scoreComparison = compareScoresDescending(
        getSortScore(left.product, sortMode, likeCounts),
        getSortScore(right.product, sortMode, likeCounts)
      )
      return scoreComparison || left.index - right.index
    })
    .map(({ product }) => product)
}
