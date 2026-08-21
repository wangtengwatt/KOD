import { prepareComputeImageUpload } from '@/packages/computeImageUpload'
import { getKodApiOrigin } from '@/packages/remote'
import { authInfoStore } from '@/stores/authInfoStore'
import { computeMarketplaceRequest } from '../computeCenter'
import type {
  ComputeHostingNode,
  ComputeOrderMessage,
  ComputeProductReviewDetail,
  ComputeReviewHistoryEntry,
  ComputeScheduleProposal,
  ComputeScheduleState,
} from './types'

export function listOrderMessages(reservationId: number, afterId = 0) {
  return computeMarketplaceRequest<ComputeOrderMessage[]>(
    `/api/compute/reservations/${reservationId}/messages?afterId=${afterId}&limit=100`
  )
}

export function sendOrderText(reservationId: number, content: string, requestKey: string = crypto.randomUUID()) {
  return computeMarketplaceRequest<ComputeOrderMessage>(`/api/compute/reservations/${reservationId}/messages/text`, {
    method: 'POST',
    body: { requestKey, content },
  })
}

export async function sendOrderImage(reservationId: number, image: File, requestKey: string = crypto.randomUUID()) {
  const body = new FormData()
  body.append('requestKey', requestKey)
  body.append('image', await prepareComputeImageUpload(image))
  return computeMarketplaceRequest<ComputeOrderMessage>(`/api/compute/reservations/${reservationId}/messages/image`, {
    method: 'POST',
    body,
  })
}

export function markOrderMessagesRead(reservationId: number, throughMessageId: number) {
  return computeMarketplaceRequest<{ read: boolean }>(`/api/compute/reservations/${reservationId}/messages/read`, {
    method: 'POST',
    body: { throughMessageId },
  })
}

export async function getOrderMessageImage(reservationId: number, messageId: number) {
  const token = authInfoStore.getState().accessToken
  if (!token) throw new Error('请先登录 KOD 账号')
  const response = await fetch(
    `${getKodApiOrigin()}/api/compute/reservations/${reservationId}/messages/${messageId}/image`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  )
  if (!response.ok) throw new Error(response.status === 410 ? '图片已超过 180 天保留期' : '订单图片读取失败')
  return response.blob()
}

export function getOrderSchedule(reservationId: number) {
  return computeMarketplaceRequest<ComputeScheduleState>(`/api/compute/reservations/${reservationId}/schedule`)
}

export function proposeOrderSchedule(
  reservationId: number,
  startTime: string,
  endTime: string,
  requestKey: string = crypto.randomUUID()
) {
  return computeMarketplaceRequest<ComputeScheduleProposal>(
    `/api/compute/reservations/${reservationId}/schedule/proposals`,
    { method: 'POST', body: { requestKey, startTime, endTime } }
  )
}

export function acceptOrderSchedule(reservationId: number, proposalId: number) {
  return computeMarketplaceRequest<ComputeScheduleState>(
    `/api/compute/reservations/${reservationId}/schedule/proposals/${proposalId}/accept`,
    { method: 'POST' }
  )
}

export function listHostedNodes() {
  return computeMarketplaceRequest<ComputeHostingNode[]>('/api/compute/supplier/hosting')
}

export function requestHostedNodeDelist(nodeId: number, reason: string) {
  return computeMarketplaceRequest<NonNullable<ComputeHostingNode['delistRequest']>>(
    `/api/compute/supplier/nodes/${nodeId}/delist`,
    { method: 'POST', body: { reason } }
  )
}

export function cancelHostedNodeDelist(nodeId: number) {
  return computeMarketplaceRequest<{ cancelled: boolean; nodeId: number }>(
    `/api/compute/supplier/nodes/${nodeId}/delist/cancel`,
    { method: 'POST' }
  )
}

export function getAdminProductReviewDetail(productId: number) {
  return computeMarketplaceRequest<ComputeProductReviewDetail>(`/api/compute/admin/products/${productId}/review-detail`)
}

export function listAdminReviewHistory(category = '', status = '') {
  const query = new URLSearchParams({ category, status })
  return computeMarketplaceRequest<ComputeReviewHistoryEntry[]>(`/api/compute/admin/reviews?${query}`)
}
