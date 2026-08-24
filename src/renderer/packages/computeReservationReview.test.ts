import { describe, expect, it } from 'vitest'
import type { ComputeReservation } from './computeCenter'
import {
  COMPUTE_RESERVATION_MANUAL_REVIEW_REASONS,
  type ComputeReservationForReview,
  classifyComputeReservationReview,
  normalizeComputeReservationManualReviewReasons,
} from './computeReservationReview'

function createReservation(overrides: Partial<ComputeReservationForReview> = {}): ComputeReservationForReview {
  const reservation: ComputeReservation = {
    id: 1,
    orderId: 2,
    productId: 3,
    buyerUserId: '4',
    gpuCount: 1,
    startTime: '2026-08-20T00:00:00.000Z',
    endTime: '2026-08-21T00:00:00.000Z',
    unitRateSnapshot: 2,
    frozenCardHours: 24,
    settledCardHours: 0,
    status: 'PENDING_DELIVERY',
    productName: 'H100 GPU 资源',
    gpuModel: 'H100',
    createTime: '2026-08-20T00:00:00.000Z',
  }

  return { ...reservation, ...overrides }
}

describe('compute reservation manual review', () => {
  it('正常订单不需要人工审核', () => {
    expect(classifyComputeReservationReview(createReservation())).toEqual({
      needsManualReview: false,
      isException: false,
      isHighValue: false,
      reasons: [],
    })
  })

  it.each([
    ['EXCEPTION_PENDING', true, COMPUTE_RESERVATION_MANUAL_REVIEW_REASONS.exceptionPending],
    ['DISPUTED', true, COMPUTE_RESERVATION_MANUAL_REVIEW_REASONS.disputed],
    ['PENDING_REVIEW', false, COMPUTE_RESERVATION_MANUAL_REVIEW_REASONS.pendingReview],
  ])('状态 %s 会进入人工审核', (status, isException, reason) => {
    const result = classifyComputeReservationReview(createReservation({ status }))

    expect(result.needsManualReview).toBe(true)
    expect(result.isException).toBe(isException)
    expect(result.reasons).toEqual([reason])
  })

  it('服务端人工审核字段会触发审核，并规范化原因列表', () => {
    const result = classifyComputeReservationReview(
      createReservation({
        manualReviewRequired: true,
        manualReviewReasons: ['  核验设备序列号  ', '核验设备序列号', '', '  缺少归还照片\n'],
        manualReviewRequestedAt: '2026-08-20T01:00:00.000Z',
      })
    )

    expect(result).toEqual({
      needsManualReview: true,
      isException: false,
      isHighValue: false,
      reasons: [
        '核验设备序列号',
        '缺少归还照片',
        COMPUTE_RESERVATION_MANUAL_REVIEW_REASONS.required,
        COMPUTE_RESERVATION_MANUAL_REVIEW_REASONS.requested,
      ],
    })
  })

  it('单独存在服务端审核原因或申请时间时也需要人工审核', () => {
    expect(
      classifyComputeReservationReview(createReservation({ manualReviewReasons: ['商品编号不匹配'] })).needsManualReview
    ).toBe(true)
    expect(
      classifyComputeReservationReview(createReservation({ manualReviewRequestedAt: '2026-08-20T01:00:00.000Z' }))
        .reasons
    ).toEqual([COMPUTE_RESERVATION_MANUAL_REVIEW_REASONS.requested])
  })

  it('冻结卡时达到有效的大额阈值时需要人工审核', () => {
    const atThreshold = classifyComputeReservationReview(createReservation({ frozenCardHours: 100 }), {
      reservationManualReviewThreshold: 100,
    })

    expect(atThreshold.isHighValue).toBe(true)
    expect(atThreshold.needsManualReview).toBe(true)
    expect(atThreshold.reasons).toEqual([COMPUTE_RESERVATION_MANUAL_REVIEW_REASONS.highValue])
  })

  it.each([0, -1, Number.POSITIVE_INFINITY, Number.NaN])('忽略无效的大额阈值 %s', (threshold) => {
    const result = classifyComputeReservationReview(createReservation({ frozenCardHours: 100 }), {
      reservationManualReviewThreshold: threshold,
    })

    expect(result.isHighValue).toBe(false)
    expect(result.needsManualReview).toBe(false)
  })

  it('只保留非空且不重复的服务端审核原因', () => {
    expect(normalizeComputeReservationManualReviewReasons([' 原因 A ', '原因 A', 42, null, '原因 B\t'])).toEqual([
      '原因 A',
      '原因 B',
    ])
  })
})
