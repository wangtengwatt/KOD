import type { ComputeProduct } from '@/packages/computeCenter'

export interface ComputeEscrowProjection {
  originalFrozenCardHours: number
  currentlyHeldCardHours: number
  settledCardHours: number
  refundedCardHours: number
}

export interface ComputeFundsEvent {
  id: number
  eventType: string
  cardHours?: number | null
  detailJson?: string | null
  actorUserId?: number | null
  createTime: string
}

export interface ComputeOrderMessage {
  id: number
  reservationId: number
  senderUserId?: number | null
  senderEmail?: string | null
  messageType: 'TEXT' | 'IMAGE' | 'SYSTEM'
  content: string
  fileId?: string | null
  mimeType?: string | null
  imagePurgedAt?: string | null
  createTime: string
}

export interface ComputeScheduleProposal {
  id: number
  proposerUserId: number
  proposedStart: string
  proposedEnd: string
  status: 'PENDING' | 'COUNTERED' | 'ACCEPTED'
  respondedBy?: number | null
  respondedAt?: string | null
  createTime: string
}

export interface ComputeScheduleState {
  proposals: ComputeScheduleProposal[]
  booking?: {
    id: number
    nodeId: number
    gpuCount: number
    startTime: string
    endTime: string
    status: string
  } | null
}

export interface ComputeHostingNode {
  id: number
  nodeName: string
  gpuModel: string
  gpuCount: number
  status: string
  intakeStatus: 'ACCEPTING' | 'STOPPED'
  nextBookingAt?: string | null
  lastBookingEnd?: string | null
  canAcceptOrders: boolean
  platformManaged: number | boolean
  delistRequest?: {
    id: number
    status: string
    reason: string
    requestedAt: string
    minimumEffectiveAt: string
    lastBlockingOrderEnd?: string | null
    estimatedOfflineAt: string
  } | null
}

export interface ComputeProductReviewDetail {
  product: ComputeProduct & Record<string, unknown>
  images: Array<{ id: number; sortOrder: number; mimeType: string; createTime: string }>
  revision: {
    id: number
    revisionNo: number
    status: string
    submittedBy: number
    submittedAt: string
    reviewedBy?: number | null
    reviewReason?: string
    reviewedAt?: string | null
  }
  nodeProofAvailable: boolean
  nodeId?: number | null
}

export interface ComputeReviewHistoryEntry {
  id: number
  category: string
  targetType: string
  targetId: string
  reviewerUserId: number
  reviewerEmail?: string | null
  status: 'APPROVED' | 'REJECTED'
  reason?: string
  createTime: string
}
