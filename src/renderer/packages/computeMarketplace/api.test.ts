import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('../computeCenter', () => ({ computeMarketplaceRequest: mocks.request }))
vi.mock('@/packages/remote', () => ({ getKodApiOrigin: () => 'https://kod.test' }))
vi.mock('@/stores/authInfoStore', () => ({
  authInfoStore: { getState: () => ({ accessToken: 'test-access-token' }) },
}))

import {
  acceptOrderSchedule,
  cancelHostedNodeDelist,
  getAdminProductReviewDetail,
  listAdminReviewHistory,
  listHostedNodes,
  listOrderMessages,
  markOrderMessagesRead,
  proposeOrderSchedule,
  requestHostedNodeDelist,
  sendOrderText,
} from './api'

describe('compute marketplace API contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('polls order messages with a cursor and marks an explicit cursor as read', () => {
    listOrderMessages(17, 88)
    markOrderMessagesRead(17, 91)

    expect(mocks.request).toHaveBeenNthCalledWith(1, '/api/compute/reservations/17/messages?afterId=88&limit=100')
    expect(mocks.request).toHaveBeenNthCalledWith(2, '/api/compute/reservations/17/messages/read', {
      method: 'POST',
      body: { throughMessageId: 91 },
    })
  })

  it('keeps message and schedule retries idempotent by transmitting request keys', () => {
    sendOrderText(17, '你好', 'message-key')
    proposeOrderSchedule(17, '2026-08-25T10:00', '2026-08-25T12:00', 'schedule-key')
    acceptOrderSchedule(17, 44)

    expect(mocks.request).toHaveBeenNthCalledWith(1, '/api/compute/reservations/17/messages/text', {
      method: 'POST',
      body: { requestKey: 'message-key', content: '你好' },
    })
    expect(mocks.request).toHaveBeenNthCalledWith(2, '/api/compute/reservations/17/schedule/proposals', {
      method: 'POST',
      body: {
        requestKey: 'schedule-key',
        startTime: '2026-08-25T10:00',
        endTime: '2026-08-25T12:00',
      },
    })
    expect(mocks.request).toHaveBeenNthCalledWith(3, '/api/compute/reservations/17/schedule/proposals/44/accept', {
      method: 'POST',
    })
  })

  it('uses dedicated admin review detail/history endpoints', () => {
    getAdminProductReviewDetail(9)
    listAdminReviewHistory('PRODUCT', 'APPROVED')

    expect(mocks.request).toHaveBeenNthCalledWith(1, '/api/compute/admin/products/9/review-detail')
    expect(mocks.request).toHaveBeenNthCalledWith(2, '/api/compute/admin/reviews?category=PRODUCT&status=APPROVED')
  })

  it('stops hosted-node intake and supports cancelling the delist request', () => {
    listHostedNodes()
    requestHostedNodeDelist(12, '计划维护')
    cancelHostedNodeDelist(12)

    expect(mocks.request).toHaveBeenNthCalledWith(1, '/api/compute/supplier/hosting')
    expect(mocks.request).toHaveBeenNthCalledWith(2, '/api/compute/supplier/nodes/12/delist', {
      method: 'POST',
      body: { reason: '计划维护' },
    })
    expect(mocks.request).toHaveBeenNthCalledWith(3, '/api/compute/supplier/nodes/12/delist/cancel', {
      method: 'POST',
    })
  })
})
