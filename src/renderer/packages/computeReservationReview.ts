import type { ComputeReservation } from './computeCenter'

export const COMPUTE_RESERVATION_MANUAL_REVIEW_REASONS = {
  exceptionPending: '订单异常待处理',
  disputed: '订单存在争议',
  pendingReview: '订单待管理员审核',
  required: '系统要求人工审核',
  requested: '已提交人工审核申请',
  highValue: '冻结卡时达到大额审核阈值',
} as const

export interface ComputeReservationManualReviewFields {
  manualReviewRequired?: boolean | null
  manualReviewReasons?: string[] | null
  manualReviewRequestedAt?: string | null
}

export type ComputeReservationForReview = ComputeReservation & ComputeReservationManualReviewFields

export interface ComputeReservationReviewPolicy {
  reservationManualReviewThreshold?: number | null
}

export interface ComputeReservationReview {
  needsManualReview: boolean
  isException: boolean
  isHighValue: boolean
  reasons: string[]
}

const EXCEPTION_STATUSES = new Set(['EXCEPTION_PENDING', 'DISPUTED'])

function normalizeReason(reason: unknown) {
  if (typeof reason !== 'string') return null
  const normalized = reason.trim().replaceAll(/\s+/g, ' ')
  return normalized || null
}

export function normalizeComputeReservationManualReviewReasons(reasons: unknown): string[] {
  if (!Array.isArray(reasons)) return []

  const normalizedReasons: string[] = []
  const seen = new Set<string>()
  for (const reason of reasons) {
    const normalized = normalizeReason(reason)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    normalizedReasons.push(normalized)
  }
  return normalizedReasons
}

function hasReviewRequestTimestamp(value: unknown) {
  return normalizeReason(value) !== null
}

function isPositiveFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function addReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) reasons.push(reason)
}

export function classifyComputeReservationReview(
  reservation: ComputeReservationForReview,
  policy: ComputeReservationReviewPolicy = {}
): ComputeReservationReview {
  const isException = EXCEPTION_STATUSES.has(reservation.status)
  const threshold = policy.reservationManualReviewThreshold
  const isHighValue =
    isPositiveFiniteNumber(threshold) &&
    typeof reservation.frozenCardHours === 'number' &&
    Number.isFinite(reservation.frozenCardHours) &&
    reservation.frozenCardHours >= threshold
  const serverReasons = normalizeComputeReservationManualReviewReasons(reservation.manualReviewReasons)
  const hasRequestedManualReview = hasReviewRequestTimestamp(reservation.manualReviewRequestedAt)
  const reasons: string[] = []

  if (reservation.status === 'EXCEPTION_PENDING') {
    addReason(reasons, COMPUTE_RESERVATION_MANUAL_REVIEW_REASONS.exceptionPending)
  } else if (reservation.status === 'DISPUTED') {
    addReason(reasons, COMPUTE_RESERVATION_MANUAL_REVIEW_REASONS.disputed)
  } else if (reservation.status === 'PENDING_REVIEW') {
    addReason(reasons, COMPUTE_RESERVATION_MANUAL_REVIEW_REASONS.pendingReview)
  }

  for (const reason of serverReasons) addReason(reasons, reason)
  if (reservation.manualReviewRequired === true) addReason(reasons, COMPUTE_RESERVATION_MANUAL_REVIEW_REASONS.required)
  if (hasRequestedManualReview) addReason(reasons, COMPUTE_RESERVATION_MANUAL_REVIEW_REASONS.requested)
  if (isHighValue) addReason(reasons, COMPUTE_RESERVATION_MANUAL_REVIEW_REASONS.highValue)

  return {
    needsManualReview:
      isException ||
      reservation.status === 'PENDING_REVIEW' ||
      reservation.manualReviewRequired === true ||
      serverReasons.length > 0 ||
      hasRequestedManualReview ||
      isHighValue,
    isException,
    isHighValue,
    reasons,
  }
}
