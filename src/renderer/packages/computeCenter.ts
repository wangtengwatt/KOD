import { type FetchOptions, ofetch } from 'ofetch'
import { getKodApiOrigin } from '@/packages/remote'
import { authInfoStore } from '@/stores/authInfoStore'

export type ProductType = 'API' | 'GPU'
export type ProductStatus = 'DRAFT' | 'PENDING' | 'PUBLISHED' | 'PAUSED' | 'REJECTED' | 'OFFLINE'

export interface ComputeProduct {
  id: number
  supplierUserId?: number | null
  nodeId?: number | null
  supplierName?: string | null
  productType: ProductType
  name: string
  description: string
  region: string
  status: ProductStatus
  modelId?: string | null
  promptRatePerMillion?: number | null
  completionRatePerMillion?: number | null
  packagePromptTokens?: number | null
  packageCompletionTokens?: number | null
  packagePriceCardHours?: number | null
  gpuModel?: string | null
  gpuMemoryGb?: number | null
  gpuCount?: number | null
  pricePerGpuHour?: number | null
  availableFrom?: string | null
  availableTo?: string | null
  deliveryMode?: string | null
  slaDescription?: string | null
  isTest?: number | boolean
  rejectionReason?: string | null
  createTime: string
}

export interface ComputeAccount {
  userId: number
  email: string
  cnyBalance: number
  availableCardHours: number
  frozenCardHours: number
  lifetimeIncome: number
  lifetimeConsumption: number
  rentalIncome: number
  apiSalesIncome: number
  withdrawableCardHours: number
  supplierStatus: string
  identityStatus: string
  isAdmin: boolean
  roles: Array<'BUYER' | 'SUPPLIER' | 'ADMIN'>
  deviceCounts: Record<'PENDING' | 'DEPLOYING' | 'RUNNING' | 'PENDING_ACTION', number>
  cardHourCnyRate: number
  cardHourRedeemRate: number
  unitName: string
  currency: string
  unreadNotifications: number
}

export interface ComputeLedgerEntry {
  id: number
  entryType: string
  direction: 'CREDIT' | 'DEBIT'
  amount: number
  availableAfter: number
  frozenAfter: number
  referenceType: string
  referenceId: string
  description: string
  createTime: string
}

export interface ComputeOrder {
  id: number
  orderNo: string
  orderType: string
  productId?: number | null
  productName?: string | null
  cardHours: number
  cnyAmount: number
  status: string
  statusBeforeIncident?: string | null
  incidentReason?: string
  resolutionType?: string | null
  resolutionCardHours?: number | null
  createTime: string
}

export interface ComputeReservation {
  id: number
  orderId: number
  productId: number
  buyerUserId: number
  supplierUserId?: number | null
  buyerEmail?: string
  supplierEmail?: string
  gpuCount: number
  startTime: string
  endTime: string
  unitRateSnapshot: number
  frozenCardHours: number
  settledCardHours: number
  status: string
  statusBeforeIncident?: string | null
  incidentReason?: string
  resolutionType?: string | null
  resolutionCardHours?: number | null
  nodeId?: number | null
  nodeName?: string | null
  nodeStatus?: string | null
  deliveryInfo?: string
  deliveredAt?: string | null
  productName: string
  gpuModel: string
  createTime: string
}

export interface ComputeTransfer {
  id: number
  transferNo: string
  senderUserId: number
  recipientUserId: number
  senderEmail: string
  recipientEmail: string
  amount: number
  message: string
  status: string
  reviewReason?: string
  expiresAt: string
  createTime: string
}

export interface ComputeSupplier {
  id?: number
  userId?: number
  email?: string
  displayName?: string
  contact?: string
  description?: string
  status: string
  rejectionReason?: string
  createTime?: string
}

export interface ComputeNotification {
  id: number
  notificationType: string
  title: string
  content: string
  referenceType: string
  referenceId: string
  isRead: number
  createTime: string
  readTime?: string | null
}

export interface ComputeAdminOverview {
  accounts: number
  identitiesPending: number
  suppliersPending: number
  nodesPending: number
  nodesPendingAction: number
  productsPending: number
  transfersPending: number
  reservationsActive: number
  circulatingCardHours: number
  transferReviewThreshold: number
  platformFeeRate: number
}

export interface ComputeWithdrawal {
  id: number
  withdrawalNo: string
  requestId: string
  cardHours: number
  redeemRate: number
  cnyAmount: number
  status: string
  destinationType: 'KOD_CNY_WALLET'
  cardHoursBefore: number
  cardHoursAfter: number
  cnyBalanceBefore: number
  cnyBalanceAfter: number
  completedAt?: string | null
  createTime: string
}

export interface ComputeApiUsage {
  id: number
  requestId: string
  modelId: string
  promptTokens: number
  completionTokens: number
  deductedPromptTokens: number
  deductedCompletionTokens: number
  giftedPromptTokens: number
  giftedCompletionTokens: number
  status: string
  createTime: string
}

export interface ComputePackageBalance {
  modelId: string
  promptTokensTotal: number
  promptTokensRemaining: number
  completionTokensTotal: number
  completionTokensRemaining: number
  paidCardHours: number
  firstPurchasedAt: string
  lastPurchasedAt: string
}

export interface ComputeIdentity {
  id?: number
  userId?: number
  email?: string
  verificationType?: 'REAL' | 'TEST'
  identityNoMasked?: string
  realName?: string
  identityNo?: string
  status: string
  rejectionReason?: string
  createTime?: string
}

export interface ComputeGpuNode {
  id: number
  supplierUserId: number
  email?: string
  nodeName: string
  region: string
  gpuModel: string
  gpuMemoryGb: number
  gpuCount: number
  cpuDescription: string
  ramGb: number
  storageGb: number
  networkDescription: string
  status: string
  isTest: number | boolean
  reviewReason?: string
  verificationNote?: string
  verificationType?: string
  createTime: string
}

interface KodResult<T> {
  code: number
  message?: string
  data?: T | null
}

export interface CardHourTopUpQuote {
  requiredCardHours: number
  availableCardHours: number
  shortageCardHours: number
  purchaseCardHours: number
  cardHourCnyRate: number
  cnyCost: number
  cnyBalance: number
  cnyShortfall: number
  canAutoTopUp: boolean
}

export class ComputeCenterApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message)
    this.name = 'ComputeCenterApiError'
  }
}

async function request<T>(path: string, options?: FetchOptions<'json'>, authenticated = true): Promise<T> {
  const token = authInfoStore.getState().accessToken
  if (authenticated && !token) {
    throw new Error('请先登录 KOD 账号')
  }
  const json = await ofetch<KodResult<T>>(`${getKodApiOrigin()}${path}`, {
    ...options,
    headers: {
      ...(options?.headers || {}),
      ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ignoreResponseError: true,
  })
  if (json.code !== 0) {
    throw new ComputeCenterApiError(json.code, json.message || '算力中心请求失败', json.data)
  }
  if (json.data == null) {
    throw new Error(json.message || '算力中心响应缺少数据')
  }
  return json.data
}

export function getComputeConfig() {
  return request<{ cardHourCnyRate: number; cardHourRedeemRate: number; unitName: string; currency: string }>(
    '/api/compute/config',
    undefined,
    false
  )
}

export function listComputeProducts(type?: ProductType) {
  const query = type ? `?type=${type}` : ''
  return request<ComputeProduct[]>(`/api/compute/products${query}`, undefined, false)
}

export function getComputeAccount() {
  return request<ComputeAccount>('/api/compute/account')
}

export function purchaseCardHours(cardHours: number) {
  return request<ComputeAccount>('/api/compute/account/purchase', {
    method: 'POST',
    body: { cardHours },
  })
}

export function listComputeLedger() {
  return request<ComputeLedgerEntry[]>('/api/compute/ledger')
}

export function listComputeOrders() {
  return request<ComputeOrder[]>('/api/compute/orders')
}

export function withdrawComputeCardHours(cardHours: number, requestId = crypto.randomUUID()) {
  return request<ComputeWithdrawal>('/api/compute/withdrawals', {
    method: 'POST',
    body: { cardHours, requestId },
  })
}

export function listComputeWithdrawals() {
  return request<ComputeWithdrawal[]>('/api/compute/withdrawals')
}

export function activateComputeApi(productId: number, autoTopUp = false) {
  return request<{ purchased: boolean; productId: number; orderNo: string }>(
    `/api/compute/products/${productId}/purchase${autoTopUp ? '?autoTopUp=true' : ''}`,
    { method: 'POST' }
  )
}

export function listComputePackageBalances() {
  return request<ComputePackageBalance[]>('/api/compute/packages/balances')
}

export function authorizeComputePackage(modelId: string) {
  return request<{
    managed: boolean
    allowed: boolean
    modelId: string
    promptTokensRemaining?: number
    completionTokensRemaining?: number
    message: string
  }>(`/api/compute/packages/authorize?modelId=${encodeURIComponent(modelId)}`)
}

export function listComputeActivations() {
  return request<
    Array<{
      id: number
      productId: number
      productName: string
      modelId: string
      promptRatePerMillion: number
      completionRatePerMillion: number
      status: string
      createTime: string
    }>
  >('/api/compute/activations')
}

export function listComputeApiUsage() {
  return request<ComputeApiUsage[]>('/api/compute/usage/api')
}

export function createComputeReservation(
  input: {
    productId: number
    gpuCount: number
    startTime: string
    endTime: string
  },
  autoTopUp = false
) {
  return request<ComputeReservation>(`/api/compute/reservations${autoTopUp ? '?autoTopUp=true' : ''}`, {
    method: 'POST',
    body: input,
  })
}

export function listComputeReservations(role: 'buyer' | 'supplier' = 'buyer') {
  return request<ComputeReservation[]>(`/api/compute/reservations?role=${role}`)
}

export function cancelComputeReservation(reservationId: number) {
  return request<{ cancelled: boolean; reservationId: number }>(`/api/compute/reservations/${reservationId}/cancel`, {
    method: 'POST',
  })
}

export function deliverComputeReservation(reservationId: number, deliveryInfo: string) {
  return request<ComputeReservation>(`/api/compute/reservations/${reservationId}/delivery`, {
    method: 'POST',
    body: { deliveryInfo },
  })
}

export function getComputeSupplier() {
  return request<ComputeSupplier>('/api/compute/supplier/me')
}

export function getComputeIdentity() {
  return request<ComputeIdentity>('/api/compute/identity/me')
}

export function createTestComputeIdentity() {
  return request<ComputeIdentity>('/api/compute/identity/test', { method: 'POST' })
}

export function submitComputeIdentity(input: { realName: string; identityNo: string; front: File; back: File }) {
  const body = new FormData()
  body.append('realName', input.realName)
  body.append('identityNo', input.identityNo)
  body.append('front', input.front)
  body.append('back', input.back)
  return request<ComputeIdentity>('/api/compute/identity', { method: 'POST', body })
}

export function listSupplierNodes() {
  return request<ComputeGpuNode[]>('/api/compute/supplier/nodes')
}

export interface ComputeNodeInput {
  nodeName: string
  region: string
  gpuModel: string
  gpuMemoryGb: number
  gpuCount: number
  cpuDescription: string
  ramGb: number
  storageGb: number
  networkDescription: string
  sshHost: string
  sshPort: number
  sshUsername: string
  sshAuthType: 'PASSWORD' | 'PRIVATE_KEY'
  sshCredential: string
}

export function createSupplierNode(input: ComputeNodeInput) {
  return request<ComputeGpuNode>('/api/compute/supplier/nodes', { method: 'POST', body: input })
}

export function applyComputeSupplier(input: { displayName: string; contact: string; description: string }) {
  return request<ComputeSupplier>('/api/compute/supplier/apply', { method: 'POST', body: input })
}

export function listSupplierProducts() {
  return request<ComputeProduct[]>('/api/compute/supplier/products')
}

export interface ComputeProductInput {
  name: string
  description: string
  region: string
  modelId?: string
  promptRatePerMillion?: number
  completionRatePerMillion?: number
  gpuModel?: string
  gpuMemoryGb?: number
  gpuCount?: number
  pricePerGpuHour?: number
  availableFrom?: string
  availableTo?: string
  deliveryMode?: string
  slaDescription?: string
  supplierUserId?: number
  nodeId?: number
  packagePromptTokens?: number
  packageCompletionTokens?: number
  packagePriceCardHours?: number
}

export function createSupplierGpuProduct(input: ComputeProductInput) {
  return request<ComputeProduct>('/api/compute/supplier/products', { method: 'POST', body: input })
}

export function createComputeTransfer(
  input: { recipientEmail: string; cardHours: number; message: string },
  autoTopUp = false
) {
  return request<ComputeTransfer>(`/api/compute/transfers${autoTopUp ? '?autoTopUp=true' : ''}`, {
    method: 'POST',
    body: input,
  })
}

export function listComputeTransfers() {
  return request<ComputeTransfer[]>('/api/compute/transfers')
}

export function acceptComputeTransfer(transferId: number) {
  return request<ComputeTransfer>(`/api/compute/transfers/${transferId}/accept`, { method: 'POST' })
}

export function cancelComputeTransfer(transferId: number) {
  return request<{ cancelled: boolean; transferId: number }>(`/api/compute/transfers/${transferId}/cancel`, {
    method: 'POST',
  })
}

export function listComputeNotifications() {
  return request<ComputeNotification[]>('/api/compute/notifications')
}

export function markComputeNotificationRead(notificationId: number) {
  return request<{ read: boolean }>(`/api/compute/notifications/${notificationId}/read`, { method: 'POST' })
}

export function getComputeAdminOverview() {
  return request<ComputeAdminOverview>('/api/compute/admin/overview')
}

export function updateComputeAdminSettings(input: { transferReviewThreshold: number; platformFeeRate: number }) {
  return request<ComputeAdminOverview>('/api/compute/admin/settings', { method: 'POST', body: input })
}

export function listAdminSuppliers() {
  return request<ComputeSupplier[]>('/api/compute/admin/suppliers')
}

export function listAdminIdentities() {
  return request<ComputeIdentity[]>('/api/compute/admin/identities')
}

export function getAdminIdentity(identityId: number) {
  return request<ComputeIdentity>(`/api/compute/admin/identities/${identityId}`)
}

export async function getAdminIdentityDocument(identityId: number, side: 'front' | 'back') {
  const token = authInfoStore.getState().accessToken
  if (!token) throw new Error('请先登录 KOD 账号')
  const response = await fetch(`${getKodApiOrigin()}/api/compute/admin/identities/${identityId}/document/${side}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error('证件材料读取失败')
  return response.blob()
}

export function reviewAdminIdentity(identityId: number, approved: boolean, reason = '') {
  return request<ComputeIdentity>(`/api/compute/admin/identities/${identityId}/review`, {
    method: 'POST',
    body: { approved, reason },
  })
}

export function listAdminNodes() {
  return request<ComputeGpuNode[]>('/api/compute/admin/nodes')
}

export function getAdminNodeCredential(nodeId: number) {
  return request<{
    id: number
    sshHost: string
    sshPort: number
    sshUsername: string
    sshAuthType: string
    sshCredential: string
  }>(`/api/compute/admin/nodes/${nodeId}/credential`)
}

export function reviewAdminNode(nodeId: number, approved: boolean, reason = '', verificationNote = '') {
  return request<ComputeGpuNode>(`/api/compute/admin/nodes/${nodeId}/review`, {
    method: 'POST',
    body: { approved, reason, verificationNote },
  })
}

export function updateAdminNodeStatus(nodeId: number, status: string, reason = '') {
  return request<ComputeGpuNode>(`/api/compute/admin/nodes/${nodeId}/status`, {
    method: 'POST',
    body: { status, reason },
  })
}

export function reviewAdminSupplier(supplierId: number, approved: boolean, reason = '') {
  return request<ComputeSupplier>(`/api/compute/admin/suppliers/${supplierId}/review`, {
    method: 'POST',
    body: { approved, reason },
  })
}

export function listAdminProducts() {
  return request<ComputeProduct[]>('/api/compute/admin/products')
}

export function createAdminApiProduct(input: ComputeProductInput) {
  return request<ComputeProduct>('/api/compute/admin/products', { method: 'POST', body: input })
}

export function reviewAdminProduct(productId: number, approved: boolean, reason = '') {
  return request<ComputeProduct>(`/api/compute/admin/products/${productId}/review`, {
    method: 'POST',
    body: { approved, reason },
  })
}

export function listAdminTransfers() {
  return request<ComputeTransfer[]>('/api/compute/admin/transfers')
}

export function listAdminReservations() {
  return request<ComputeReservation[]>('/api/compute/admin/reservations')
}

export function settleAdminReservation(reservationId: number) {
  return request<ComputeReservation>(`/api/compute/admin/reservations/${reservationId}/settle`, {
    method: 'POST',
  })
}

export function resolveAdminReservation(
  reservationId: number,
  input: { resolution: 'FULL_REFUND' | 'ACTUAL_USAGE' | 'FULL_SETTLEMENT'; actualCardHours?: number; reason: string }
) {
  return request<ComputeReservation>(`/api/compute/admin/reservations/${reservationId}/resolve`, {
    method: 'POST',
    body: input,
  })
}

export function reviewAdminTransfer(transferId: number, approved: boolean, reason = '') {
  return request<ComputeTransfer>(`/api/compute/admin/transfers/${transferId}/review`, {
    method: 'POST',
    body: { approved, reason },
  })
}

export function grantAdminCardHours(input: {
  recipientEmail: string
  cardHours: number
  expiresAt?: string | null
  reason: string
}) {
  return request<ComputeAccount>('/api/compute/admin/grants', { method: 'POST', body: input })
}
