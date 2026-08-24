import { describe, expect, it } from 'vitest'
import {
  escrowSummary,
  isOrderConversationReadonly,
  marketplaceStatus,
  mergeOrderMessages,
  nextOfflineLabel,
  ORDER_MESSAGE_NOTIFICATION,
  reviewCategoryLabel,
  shouldNotifyOrderUnread,
} from './projections'
import type { ComputeOrderMessage } from './types'

describe('compute marketplace projections', () => {
  it('keeps original, held, settled and refunded amounts independently visible', () => {
    expect(
      escrowSummary({
        originalFrozenCardHours: 24,
        currentlyHeldCardHours: 0,
        settledCardHours: 24,
        refundedCardHours: 0,
      })
    ).toEqual([
      ['订单金额', '24.000 卡时'],
      ['担保冻结', '0.000 卡时'],
      ['已结算', '24.000 卡时'],
      ['已退回', '0.000 卡时'],
    ])
  })

  it.each([
    ['active', [24, 24, 0, 0]],
    ['disputed', [24, 24, 0, 0]],
    ['completed', [24, 0, 24, 0]],
    ['cancelled/refunded', [24, 0, 0, 24]],
  ])('projects %s escrow without hiding money movement', (_state, amounts) => {
    const [original, held, settled, refunded] = amounts
    expect(
      escrowSummary({
        originalFrozenCardHours: original,
        currentlyHeldCardHours: held,
        settledCardHours: settled,
        refundedCardHours: refunded,
      }).map(([, value]) => value)
    ).toEqual(amounts.map((amount) => `${amount.toFixed(3)} 卡时`))
  })

  it('uses a generic notification that cannot leak order chat content', () => {
    expect(ORDER_MESSAGE_NOTIFICATION).toEqual({
      title: 'KOD 租赁订单有新消息',
      body: '请打开租赁订单查看详情。',
    })
    expect(JSON.stringify(ORDER_MESSAGE_NOTIFICATION)).not.toContain('SSH')
  })

  it('notifies only after a known unread baseline increases', () => {
    expect(shouldNotifyOrderUnread(null, 3)).toBe(false)
    expect(shouldNotifyOrderUnread(3, 3)).toBe(false)
    expect(shouldNotifyOrderUnread(3, 1)).toBe(false)
    expect(shouldNotifyOrderUnread(1, 2)).toBe(true)
  })

  it.each([
    ['PENDING_SCHEDULE', false],
    ['PENDING_DELIVERY', false],
    ['DELIVERED', false],
    ['DISPUTED', false],
    ['COMPLETED', true],
    ['REFUNDED', true],
    ['CANCELLED', true],
  ])('projects %s order conversation read-only state', (status, readonly) => {
    expect(isOrderConversationReadonly(status)).toBe(readonly)
  })

  it.each([
    ['PENDING', '待审核', 'yellow'],
    ['PUBLISHED', '已上架', 'teal'],
    ['REJECTED', '审核未通过', 'red'],
    ['PENDING_SCHEDULE', '待确认排期', 'orange'],
    ['DELIVERED', '已交付待确认', 'cyan'],
    ['COMPLETED', '已完成', 'green'],
    ['DISPUTED', '争议处理中', 'red'],
  ])('maps %s to an explicit Chinese visual state', (status, label, color) => {
    expect(marketplaceStatus(status)).toEqual({ label, color })
  })

  it('explains delayed delisting instead of promising immediate shutdown', () => {
    expect(nextOfflineLabel('2026-08-29T10:00:00')).toContain('预计最早下架')
    expect(nextOfflineLabel(null)).toBe('停止接收新订单，等待既有订单与争议清空')
  })

  it('merges incremental chat pages in order without duplicating retried messages', () => {
    const message = (id: number): ComputeOrderMessage => ({
      id,
      reservationId: 7,
      senderUserId: '1',
      messageType: 'TEXT',
      content: `message-${id}`,
      createTime: `2026-08-21T10:00:0${id}`,
    })

    expect(mergeOrderMessages([message(1), message(2)], [message(2), message(4), message(3)])).toEqual([
      message(1),
      message(2),
      message(3),
      message(4),
    ])
  })

  it.each([
    ['IDENTITY', '实名认证'],
    ['SUPPLIER', '供应方'],
    ['GPU_NODE', 'GPU 资质'],
    ['PRODUCT', '商品'],
    ['TRANSFER', '大额转让'],
  ])('labels all five admin review categories: %s', (category, label) => {
    expect(reviewCategoryLabel(category)).toBe(label)
  })
})
