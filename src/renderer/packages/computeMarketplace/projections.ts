export type MarketplaceStatusVisual = {
  label: string
  color: string
}

import type { ComputeOrderMessage } from './types'

export const ORDER_MESSAGE_NOTIFICATION = Object.freeze({
  title: 'KOD 租赁订单有新消息',
  body: '请打开租赁订单查看详情。',
})

const closedOrderStatuses = new Set(['COMPLETED', 'REFUNDED', 'CANCELLED'])

export function shouldNotifyOrderUnread(previous: number | null, current: number): boolean {
  return previous !== null && current > previous
}

export function isOrderConversationReadonly(status: string): boolean {
  return closedOrderStatuses.has(status)
}

const statusVisuals: Record<string, MarketplaceStatusVisual> = {
  DRAFT: { label: '草稿', color: 'gray' },
  PENDING: { label: '待审核', color: 'yellow' },
  PUBLISHED: { label: '已上架', color: 'teal' },
  PAUSED: { label: '已暂停', color: 'gray' },
  REJECTED: { label: '审核未通过', color: 'red' },
  RUNNING: { label: '运行中', color: 'green' },
  OFFLINE: { label: '已下架', color: 'gray' },
  PENDING_SCHEDULE: { label: '待确认排期', color: 'orange' },
  PENDING_DELIVERY: { label: '待交付', color: 'yellow' },
  DELIVERED: { label: '已交付待确认', color: 'cyan' },
  COMPLETED: { label: '已完成', color: 'green' },
  DISPUTED: { label: '争议处理中', color: 'red' },
  CANCELLED: { label: '已取消', color: 'gray' },
  REFUNDED: { label: '已退款', color: 'blue' },
  ACCEPTED: { label: '已接受', color: 'green' },
  COUNTERED: { label: '已被替代', color: 'gray' },
}

export function marketplaceStatus(status: string): MarketplaceStatusVisual {
  return statusVisuals[status] || { label: status || '未知状态', color: 'gray' }
}

export function escrowSummary(escrow?: {
  originalFrozenCardHours?: number
  currentlyHeldCardHours?: number
  settledCardHours?: number
  refundedCardHours?: number
}): Array<[string, string]> {
  const value = (amount?: number) => `${Number(amount || 0).toFixed(3)} 卡时`
  return [
    ['订单金额', value(escrow?.originalFrozenCardHours)],
    ['担保冻结', value(escrow?.currentlyHeldCardHours)],
    ['已结算', value(escrow?.settledCardHours)],
    ['已退回', value(escrow?.refundedCardHours)],
  ]
}

export function nextOfflineLabel(estimatedOfflineAt?: string | null): string {
  if (!estimatedOfflineAt) return '停止接收新订单，等待既有订单与争议清空'
  return `预计最早下架：${new Date(estimatedOfflineAt).toLocaleString('zh-CN', { hour12: false })}`
}

export function mergeOrderMessages(
  current: ComputeOrderMessage[],
  incoming: ComputeOrderMessage[]
): ComputeOrderMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort((left, right) => left.id - right.id)
}

export function reviewCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    IDENTITY: '实名认证',
    SUPPLIER: '供应方',
    GPU_NODE: 'GPU 资质',
    PRODUCT: '商品',
    TRANSFER: '大额转让',
  }
  return labels[category] || category
}
