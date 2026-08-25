import { type FetchOptions, ofetch } from 'ofetch'
import { z } from 'zod'
import {
  COMPUTE_IMAGE_UPLOAD_MAX_BYTES,
  COMPUTE_IMAGE_UPLOAD_RETRY_BYTES,
  isComputeUploadSizeExceeded,
  prepareComputeImageUpload,
} from '@/packages/computeImageUpload'
import { getKodApiOrigin, refreshKodSession } from '@/packages/remote'
import { authInfoStore } from '@/stores/authInfoStore'
import { KOD_MARKET_API_ORIGIN } from '@/variables'
import type { ComputeEscrowProjection, ComputeFundsEvent } from './computeMarketplace/types'

export type ProductType = 'API' | 'GPU'
export type ProductStatus = 'DRAFT' | 'PENDING' | 'PUBLISHED' | 'PAUSED' | 'REJECTED' | 'OFFLINE'

export interface ComputeProduct {
  id: number
  supplierUserId?: string | null
  nodeId?: number | null
  supplierName?: string | null
  productType: ProductType
  name: string
  description: string
  region: string
  status: ProductStatus
  intakeStopped?: number | boolean
  modelId?: string | null
  promptRatePerMillion?: number | null
  completionRatePerMillion?: number | null
  packagePromptTokens?: number | null
  packageCompletionTokens?: number | null
  packagePriceCardHours?: number | null
  upstreamStationId?: number | null
  upstreamKeyId?: number | null
  gpuModel?: string | null
  gpuMemoryGb?: number | null
  gpuCount?: number | null
  pricePerGpuHour?: number | null
  tradeMode?: 'LEGACY_RESERVATION' | 'MARKETPLACE_FIXED' | null
  packageDurationHours?: number | null
  deliveryDeadlineHours?: number | null
  coverImageId?: number | null
  availableFrom?: string | null
  availableTo?: string | null
  deliveryMode?: string | null
  slaDescription?: string | null
  isTest?: number | boolean
  rejectionReason?: string | null
  likeCount?: number | null
  commentCount?: number | null
  performanceScore?: number | null
  heatScore?: number | null
  createTime: string
}

export interface ComputeAccount {
  userId: string
  email: string
  cnyBalance: number
  availableCardHours: number
  spendableCardHours: number
  redeemableCardHours: number
  rewardCardHours: number
  frozenCardHours: number
  lifetimeIncome: number
  lifetimeConsumption: number
  rentalIncome: number
  rentalIncomeCnyEquivalent: number
  commissionIncome: number
  pendingCommission: number
  totalIncomeCny: number
  invitedCount: number
  apiSalesIncome: number
  withdrawableCardHours: number
  supplierStatus: string
  identityStatus: string
  isAdmin: boolean
  roles: Array<'BUYER' | 'SUPPLIER' | 'ADMIN'>
  deviceCounts: Record<'PENDING' | 'DEPLOYING' | 'RUNNING' | 'PENDING_ACTION', number>
  gpuAssetCounts: Record<
    'PENDING' | 'REJECTED' | 'RUNNING' | 'PENDING_DELIVERY' | 'ACTIVE_RENTAL' | 'PENDING_ACTION' | 'OFFLINE',
    number
  >
  cardHourCnyRate: number
  cardHourRedeemRate: number
  unitName: string
  currency: string
  unreadNotifications: number
  unreadOrderMessages?: number
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
  coverImageId?: number | null
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
  buyerUserId: string
  supplierUserId?: string | null
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
  manualReviewRequired?: boolean | null
  manualReviewReasons?: string[] | null
  manualReviewRequestedAt?: string | null
  manualReviewPolicyVersion?: string | null
  reviewedAt?: string | null
  reviewedByEmail?: string | null
  resolutionReason?: string | null
  version?: number | null
  nodeId?: number | null
  nodeName?: string | null
  nodeStatus?: string | null
  deliveryInfo?: string
  deliveredAt?: string | null
  tradeMode?: 'LEGACY_RESERVATION' | 'MARKETPLACE_FIXED'
  workflowVersion?: number
  packageDurationHours?: number | null
  buyerPublicKey?: string
  scheduleDeadlineAt?: string | null
  scheduleConfirmedAt?: string | null
  deliveryDeadlineAt?: string | null
  autoConfirmAt?: string | null
  buyerConfirmedAt?: string | null
  disputeReason?: string
  disputeEvidence?: string
  disputedAt?: string | null
  productName: string
  gpuModel: string
  coverImageId?: number | null
  escrow?: ComputeEscrowProjection
  fundsEvents?: ComputeFundsEvent[]
  unreadMessages?: number
  createTime: string
}

export interface ComputeTransfer {
  id: number
  transferNo: string
  senderUserId: string
  recipientUserId: string
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
  userId?: string
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
  reservationManualReviewThreshold?: number | null
  reservationsPendingManualReview?: number
  platformFeeRate: number
  usdCnyRate: number
}

export type ComputeMarketPriceSource = 'VAST_AI' | 'GETDEPLOYING' | 'AUTODL' | 'AKAMAI'
export type ComputeMarketPriceStatus = 'OK' | 'STALE' | 'NO_QUOTE' | 'UNAVAILABLE' | 'UNCONFIGURED'
export type ComputeMarketPriceRange = '1h' | '6h' | '24h' | '7d' | '30d' | '90d' | '365d'
export type ComputeMarketRentalTerm = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY'
export type ComputeMarketPriceCurrency = 'CNY' | 'USD'
export type ComputeMarketBillingUnit = 'HOUR' | 'DAY' | 'WEEK' | 'MONTH'
export type ComputeMarketAvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'WAITLIST' | 'UNKNOWN'
export type ComputeMarketPriceQuoteType =
  | 'MIN_AVAILABLE'
  | 'MEDIAN_AVAILABLE'
  | 'VERIFIED_MIN'
  | 'OFFICIAL_LIST'
  | 'MEMBER_PRICE'

export interface ComputeMarketRegionOption {
  value: string
  label: string
  source?: ComputeMarketPriceSource
}

export interface ComputeMarketPriceHistoryFilters {
  rentalTerm?: ComputeMarketRentalTerm
  regions?: string[]
  vramMiB?: number
  formFactor?: string | null
}

export interface ComputeMarketPriceQuote {
  source: ComputeMarketPriceSource
  sourceLabel: string
  gpuModel: string
  sourceUrl: string
  status: ComputeMarketPriceStatus
  quoteType?: ComputeMarketPriceQuoteType
  priceUsdPerGpuHour?: number
  priceCnyPerGpuHour?: number
  cardHoursPerGpuHour?: number
  sampleSize?: number
  sampledAt?: string
  lastAttemptAt?: string
  lastSuccessAt?: string
  errorMessage?: string
  modelKey?: string
  sourceModel?: string
  vramMiB?: number
  formFactor?: string | null
  rentalTerm?: ComputeMarketRentalTerm
  regionCode?: string
  regionLabel?: string
  originalCurrency?: ComputeMarketPriceCurrency
  originalPricePerGpuHour?: number
  originalBillingPrice?: number
  originalBillingUnit?: ComputeMarketBillingUnit
  medianPricePerGpuHour?: number
  verifiedPricePerGpuHour?: number
  availableGpuCount?: number
  priceCondition?: string
  providerUpdatedAt?: string
  providerId?: string
  providerName?: string
  providerCountry?: string
  externalOfferingId?: string
  availabilityStatus?: ComputeMarketAvailabilityStatus
}

export interface ComputeMarketPriceSnapshot {
  trackedModels: string[]
  quotes: ComputeMarketPriceQuote[]
  usdCnyRate?: number
  cardHourCnyRate?: number
  usdCnyRateUpdatedAt?: string
  cardHourCnyRateUpdatedAt?: string
  refreshIntervalSeconds: number
  historySampleSeconds: number
  historyRetentionDays: number
  generatedAt: string
  availableRegions?: ComputeMarketRegionOption[]
  availableRentalTerms?: ComputeMarketRentalTerm[]
}

export interface ComputeMarketPricePoint {
  source: ComputeMarketPriceSource
  gpuModel: string
  quoteType: ComputeMarketPriceQuoteType
  status?: ComputeMarketPriceStatus
  priceUsdPerGpuHour?: number
  priceCnyPerGpuHour?: number
  cardHoursPerGpuHour?: number
  sampleSize?: number
  sampledAt: string
  modelKey?: string
  sourceModel?: string
  vramMiB?: number
  formFactor?: string | null
  rentalTerm?: ComputeMarketRentalTerm
  regionCode?: string
  regionLabel?: string
  originalCurrency?: ComputeMarketPriceCurrency
  originalPricePerGpuHour?: number
  originalBillingPrice?: number
  originalBillingUnit?: ComputeMarketBillingUnit
  medianPricePerGpuHour?: number
  verifiedPricePerGpuHour?: number
  availableGpuCount?: number
  priceCondition?: string
  providerUpdatedAt?: string
  providerId?: string
  providerName?: string
  providerCountry?: string
  externalOfferingId?: string
  availabilityStatus?: ComputeMarketAvailabilityStatus
}

export interface ComputeMarketPriceHistory {
  gpuModel: string
  range: ComputeMarketPriceRange
  points: ComputeMarketPricePoint[]
  usdCnyRate?: number
  cardHourCnyRate?: number
  usdCnyRateUpdatedAt?: string
  cardHourCnyRateUpdatedAt?: string
  rentalTerm?: ComputeMarketRentalTerm
  regions?: string[]
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

export interface ComputeReferralProfile {
  inviteCode: string
  inviteLink: string
  registrationLink: string
  rewardPolicy: 'LEGACY_READ_ONLY'
  invitedCount: number
  pendingCommission: number
  paidCommission: number
  bound: boolean
  inviterEmail?: string
  boundAt?: string | null
  canBind: boolean
  bindReason: string
}

export interface ComputeReferralPreview {
  inviteCode: string
  inviterEmail: string
  canBind: boolean
  reason: string
}

export interface ComputeReferralReward {
  id: number
  topupOrderNo: string
  inviteeEmail: string
  rechargeAmount: number
  rewardRate: number
  rewardCap: number
  rewardAmount: number
  status: 'WAITING' | 'PAID' | 'CANCELLED'
  releaseAt: string
  paidAt?: string | null
  cancelReason?: string
  createTime: string
}

const contractDecimalPattern = /^\d{1,17}(?:\.\d{1,3})?$/
const maxSafeContractThousandths = BigInt(Number.MAX_SAFE_INTEGER)
const maxUnambiguousNumericContractValue = 2 ** 43
const contractNonnegativeDecimal = z
  .union([z.number().finite().nonnegative(), z.string()])
  .transform((input, context) => {
    if (typeof input === 'number' && input >= maxUnambiguousNumericContractValue) {
      context.addIssue({ code: 'custom', message: 'numeric value exceeds unambiguous thousandth precision' })
      return z.NEVER
    }
    const text = String(input)
    if (!contractDecimalPattern.test(text)) {
      context.addIssue({ code: 'custom', message: 'value must be a nonnegative DECIMAL(20,3)' })
      return z.NEVER
    }
    const [whole, fraction = ''] = text.split('.')
    const thousandths = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'))
    if (thousandths > maxSafeContractThousandths) {
      context.addIssue({ code: 'custom', message: 'value exceeds the exact UI number range' })
      return z.NEVER
    }
    const value = Number(text)
    if (value.toFixed(3) !== `${whole}.${fraction.padEnd(3, '0')}`) {
      context.addIssue({ code: 'custom', message: 'value cannot round-trip through the UI number type' })
      return z.NEVER
    }
    return value
  })
const moneyDecimalPattern = /^\d{1,16}(?:\.\d{1,4})?$/
const maxSafeMoneyTenThousandths = BigInt(Number.MAX_SAFE_INTEGER)
const maxUnambiguousNumericMoney = 2 ** 39
const contractNonnegativeMoney = z
  .union([z.number().finite().nonnegative(), z.string()])
  .transform((input, context) => {
    if (typeof input === 'number' && input >= maxUnambiguousNumericMoney) {
      context.addIssue({ code: 'custom', message: 'numeric money exceeds unambiguous ten-thousandth precision' })
      return z.NEVER
    }
    const text = String(input)
    if (!moneyDecimalPattern.test(text)) {
      context.addIssue({ code: 'custom', message: 'money must be a nonnegative decimal with at most four places' })
      return z.NEVER
    }
    const [whole, fraction = ''] = text.split('.')
    const tenThousandths = BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0'))
    if (tenThousandths > maxSafeMoneyTenThousandths) {
      context.addIssue({ code: 'custom', message: 'money exceeds the exact UI number range' })
      return z.NEVER
    }
    const value = Number(text)
    if (value.toFixed(4) !== `${whole}.${fraction.padEnd(4, '0')}`) {
      context.addIssue({ code: 'custom', message: 'money cannot round-trip through the UI number type' })
      return z.NEVER
    }
    return value
  })
function exactDecimalUnits(value: number, scale: number) {
  return BigInt(value.toFixed(scale).replace('.', ''))
}
const contractLongId = z
  .union([z.string().regex(/^[1-9]\d*$/), z.number().int().positive().safe()])
  .transform((value) => String(value))
const contractDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?$/)
  .refine((value) => z.iso.datetime({ local: true }).safeParse(value).success, { message: 'invalid local date-time' })
const contractNumber = z
  .union([z.number().finite(), z.string().regex(/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/)])
  .transform((value) => Number(value))
  .pipe(z.number().finite())
const contractNonnegativeNumber = contractNumber.pipe(z.number().nonnegative())
const contractCount = z.number().int().nonnegative().safe()
const strictContractId = z.string().regex(/^[1-9]\d{0,18}$/, { message: 'ID must be a positive digit string' })
const strictContractDecimal = z.string().regex(/^\d{1,17}(?:\.\d{1,3})?$/, {
  message: 'value must be a nonnegative decimal string with at most three places',
})
const strictPositiveContractDecimal = strictContractDecimal.refine((value) => /[1-9]/.test(value), {
  message: 'value must be a positive decimal string',
})

export const ComputeAccountSchema: z.ZodType<ComputeAccount> = z
  .object({
    userId: contractLongId,
    email: z.string().min(1),
    cnyBalance: contractNonnegativeNumber,
    availableCardHours: contractNonnegativeDecimal,
    spendableCardHours: contractNonnegativeDecimal,
    redeemableCardHours: contractNonnegativeDecimal,
    rewardCardHours: contractNonnegativeDecimal,
    frozenCardHours: contractNonnegativeDecimal,
    lifetimeIncome: contractNonnegativeDecimal,
    lifetimeConsumption: contractNonnegativeDecimal,
    rentalIncome: contractNonnegativeDecimal,
    rentalIncomeCnyEquivalent: contractNonnegativeNumber,
    commissionIncome: contractNonnegativeMoney,
    pendingCommission: contractNonnegativeMoney,
    totalIncomeCny: contractNonnegativeNumber,
    invitedCount: contractCount,
    apiSalesIncome: contractNonnegativeDecimal,
    withdrawableCardHours: contractNonnegativeDecimal,
    supplierStatus: z.string().min(1),
    identityStatus: z.string().min(1),
    isAdmin: z.boolean(),
    roles: z.array(z.enum(['BUYER', 'SUPPLIER', 'ADMIN'])),
    deviceCounts: z.object({
      PENDING: contractCount,
      DEPLOYING: contractCount,
      RUNNING: contractCount,
      PENDING_ACTION: contractCount,
    }),
    gpuAssetCounts: z.object({
      PENDING: contractCount,
      REJECTED: contractCount,
      RUNNING: contractCount,
      PENDING_DELIVERY: contractCount,
      ACTIVE_RENTAL: contractCount,
      PENDING_ACTION: contractCount,
      OFFLINE: contractCount,
    }),
    cardHourCnyRate: contractNonnegativeNumber,
    cardHourRedeemRate: contractNonnegativeNumber,
    unitName: z.string().min(1),
    currency: z.string().min(1),
    unreadNotifications: contractCount,
    unreadOrderMessages: contractCount.optional(),
  })
  .passthrough()
  .refine(
    (value) => exactDecimalUnits(value.availableCardHours, 3) === exactDecimalUnits(value.spendableCardHours, 3),
    {
      message: 'available and spendable card hours must match',
    }
  )
  .refine(
    (value) =>
      exactDecimalUnits(value.spendableCardHours, 3) <=
      exactDecimalUnits(value.redeemableCardHours, 3) + exactDecimalUnits(value.rewardCardHours, 3),
    { message: 'spendable card hours cannot exceed qualified card hours' }
  )

export const EmailInvitationSchema = z.object({
  id: contractLongId,
  inviterUserId: contractLongId,
  email: z.string().min(1),
  inviteCode: z.string().min(1),
  inviteeUserId: contractLongId.nullable(),
  status: z.enum(['PENDING', 'ACCEPTED', 'FAILED', 'EXPIRED']),
  failureReason: z.string(),
  createdAt: contractDateTime,
  acceptedAt: contractDateTime.nullable(),
  expiresAt: contractDateTime,
  registrationLink: z.string().min(1),
})
export type EmailInvitation = z.infer<typeof EmailInvitationSchema>

const EmailInvitationReceiptSchema = z.object({ acknowledgment: z.string().min(1) })

export const PlatformServerSkuSchema = z
  .object({
    id: contractLongId,
    skuCode: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    region: z.string().min(1),
    gpuModel: z.string().min(1),
    gpuMemoryGb: z.number().int().nonnegative(),
    gpuCount: z.number().int().positive(),
    cpuDescription: z.string(),
    ramGb: z.number().int().nonnegative(),
    storageGb: z.number().int().nonnegative(),
    networkDescription: z.string(),
    monthlyRent: contractNonnegativeDecimal,
    platformSalePrice: contractNonnegativeDecimal,
    packageDurationHours: z.number().int().positive(),
    deliveryDeadlineHours: z.number().int().nonnegative(),
    totalInventory: z.number().int().nonnegative(),
    availableInventory: z.number().int().nonnegative(),
    status: z.literal('ACTIVE'),
  })
  .refine((value) => value.availableInventory <= value.totalInventory, {
    path: ['availableInventory'],
    message: 'available inventory cannot exceed total inventory',
  })
export type PlatformServerSku = z.infer<typeof PlatformServerSkuSchema>

export const PlatformServerLeaseSchema = z.object({
  id: contractLongId,
  leaseNo: z.string().min(1),
  userId: contractLongId,
  skuId: contractLongId,
  requestId: z.string().min(1),
  hostedNodeId: contractLongId,
  productId: contractLongId,
  monthlyRent: contractNonnegativeDecimal,
  salePrice: contractNonnegativeDecimal,
  status: z.enum(['ACTIVE', 'STOPPING', 'RELEASED']),
  autoRenew: z.boolean(),
  startedAt: contractDateTime,
  expiresAt: contractDateTime,
  stoppingAt: contractDateTime.nullable(),
  releasedAt: contractDateTime.nullable(),
  renewalCount: z.number().int().nonnegative(),
})
export type PlatformServerLease = z.infer<typeof PlatformServerLeaseSchema>

const EmailInvitationListSchema = z.array(EmailInvitationSchema)
const PlatformServerSkuListSchema = z.array(PlatformServerSkuSchema)
export const PlatformServerLeaseListSchema = z.array(PlatformServerLeaseSchema)

const PlatformLeaseSnapshotSchema = z.object({
  id: strictContractId,
  leaseNo: z.string().min(1),
  userId: strictContractId,
  skuId: strictContractId,
  requestId: z.string().min(1),
  hostedNodeId: strictContractId,
  productId: strictContractId,
  monthlyRent: strictContractDecimal,
  salePrice: strictContractDecimal,
  status: z.enum(['ACTIVE', 'STOPPING', 'RELEASED']),
  autoRenew: z.boolean(),
  startedAt: contractDateTime,
  expiresAt: contractDateTime,
  stoppingAt: contractDateTime.nullable(),
  releasedAt: contractDateTime.nullable(),
  renewalCount: z.number().int().nonnegative(),
})

export const PlatformLeasePeriodSchema = z.object({
  id: strictContractId,
  leaseId: strictContractId,
  periodNo: z.number().int().positive(),
  rentCardHours: strictContractDecimal,
  startedAt: contractDateTime,
  endsAt: contractDateTime,
  paymentLedgerId: strictContractId,
  status: z.enum(['ACTIVE', 'COMPLETED']),
  completedAt: contractDateTime.nullable(),
})
export type PlatformLeasePeriod = z.infer<typeof PlatformLeasePeriodSchema>

export const PlatformLeaseIncomeEventSchema = z.object({
  id: strictContractId,
  leaseId: strictContractId,
  reservationId: strictContractId,
  productId: strictContractId,
  orderId: strictContractId,
  orderNo: z.string().min(1),
  buyerUserId: strictContractId,
  beneficiaryUserId: strictContractId,
  grossCardHours: strictContractDecimal,
  platformFeeCardHours: strictContractDecimal,
  netIncomeCardHours: strictContractDecimal,
  supplierIncomeLedgerId: strictContractId.nullable(),
  settlementStatus: z.enum(['PENDING', 'SETTLED']),
  serviceStartedAt: contractDateTime.nullable(),
  serviceEndedAt: contractDateTime.nullable(),
  settledAt: contractDateTime.nullable(),
})
export type PlatformLeaseIncomeEvent = z.infer<typeof PlatformLeaseIncomeEventSchema>

export const PlatformLeaseDetailsSchema = z.object({
  lease: PlatformLeaseSnapshotSchema,
  periods: z.array(PlatformLeasePeriodSchema),
  incomeEvents: z.array(PlatformLeaseIncomeEventSchema),
  totalCost: strictContractDecimal,
  totalPendingIncome: strictContractDecimal,
  totalSettledIncome: strictContractDecimal,
  totalFee: strictContractDecimal,
  totalNetIncome: strictContractDecimal,
})
export type PlatformLeaseDetails = z.infer<typeof PlatformLeaseDetailsSchema>

export const PlatformSkuAdminInputSchema = z.object({
  skuCode: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  description: z.string().max(1_000),
  region: z.string().min(1).max(128),
  gpuModel: z.string().min(1).max(128),
  gpuMemoryGb: z.number().int().positive().safe(),
  gpuCount: z.number().int().positive().safe(),
  cpuDescription: z.string().max(256),
  ramGb: z.number().int().positive().safe(),
  storageGb: z.number().int().positive().safe(),
  networkDescription: z.string().max(256),
  monthlyRent: strictPositiveContractDecimal,
  platformSalePrice: strictPositiveContractDecimal,
  packageDurationHours: z.number().int().positive().max(8_760).safe(),
  deliveryDeadlineHours: z.number().int().positive().max(720).safe(),
  totalInventory: z.number().int().nonnegative().safe(),
  status: z.enum(['ACTIVE', 'DISABLED']),
})
export type PlatformSkuAdminInput = z.infer<typeof PlatformSkuAdminInputSchema>

const PlatformSkuAdminSchema = PlatformSkuAdminInputSchema.extend({
  id: strictContractId,
  availableInventory: z.number().int().nonnegative(),
}).refine((value) => value.availableInventory <= value.totalInventory, {
  path: ['availableInventory'],
  message: 'available inventory cannot exceed total inventory',
})
export type PlatformSkuAdmin = z.infer<typeof PlatformSkuAdminSchema>

const LotterySourceTypeSchema = z.enum(['GPU_RESERVATION', 'HOSTING_PERIOD'])
const LotteryEligibilityStatusSchema = z.enum(['PENDING', 'DRAWN', 'DISMISSED'])

export const LotteryEligibilitySchema = z.object({
  id: strictContractId,
  beneficiaryUserId: strictContractId,
  sourceType: LotterySourceTypeSchema,
  sourceId: strictContractId,
  rewardBase: strictContractDecimal,
  status: LotteryEligibilityStatusSchema,
  ruleVersion: z.number().int().positive(),
  createdAt: contractDateTime,
  drawnAt: contractDateTime.nullable(),
  dismissedAt: contractDateTime.nullable(),
})
export type LotteryEligibility = z.infer<typeof LotteryEligibilitySchema>

export const LotteryDrawSchema = z.object({
  id: strictContractId,
  eligibilityId: strictContractId,
  ruleVersion: z.number().int().positive(),
  rateBasisPoints: z.union([z.literal(50), z.literal(100), z.literal(200), z.literal(300), z.literal(500)]),
  rewardAmount: strictContractDecimal,
  requestId: z.string().min(1),
  rewardLedgerId: strictContractId.nullable(),
  drawnAt: contractDateTime,
})
export type LotteryDraw = z.infer<typeof LotteryDrawSchema>

export const LotteryHistorySchema = z
  .object({
    eligibilityId: strictContractId,
    drawId: strictContractId,
    sourceType: LotterySourceTypeSchema,
    sourceId: strictContractId,
    rewardBase: strictContractDecimal,
    rewardAmount: strictContractDecimal,
    rewardLedgerId: strictContractId.nullable(),
    ruleVersion: z.number().int().positive(),
    rateBasisPoints: z.number().int().positive(),
    drawnAt: contractDateTime,
  })
  .strict()
export type LotteryHistory = z.infer<typeof LotteryHistorySchema>

export const LocalDemoCapabilitySchema = z.object({
  enabled: z.boolean(),
  roles: z.array(z.enum(['ADMIN', 'HOSTING_TENANT', 'GPU_BUYER'])),
})
export type LocalDemoCapability = z.infer<typeof LocalDemoCapabilitySchema>

const LocalDemoSessionSchema = z.object({
  token: z.string().min(1),
  refreshToken: z.string().min(1),
  accountId: strictContractId,
})
export type LocalDemoRole = z.infer<typeof LocalDemoCapabilitySchema>['roles'][number]
export type LocalDemoSession = z.infer<typeof LocalDemoSessionSchema>

export type CardHourAssetType = 'STANDARD' | 'SPECIFIC'
export type CardHourMarketType = 'PRIMARY_SALE' | 'IDLE_TRANSFER' | 'RFQ'

export interface CardHourLot {
  id: number
  assetType: CardHourAssetType
  gpuModel?: string | null
  issuerUserId?: string | null
  nodeId?: number | null
  nodeName?: string | null
  sourceType: string
  sourceRef: string
  originalAmount: number
  remainingAmount: number
  frozenAmount: number
  availableAmount: number
  rateVersion?: string | null
  rateMultiplier?: number | null
  custodyStatus: string
  custodyFeeAccrued: number
  expiresAt?: string | null
  createTime: string
}

export interface CardHourRateRule {
  id: number
  versionNo: string
  gpuModel: string
  multiplier: number
  status: string
  effectiveFrom: string
  notes: string
}

export interface CardHourListing {
  id: number
  listingNo: string
  sellerUserId?: string
  sellerEmail?: string
  sellerName?: string
  identityVerified?: number | boolean
  nodeVerified?: number | boolean
  marketType: CardHourMarketType
  assetType: CardHourAssetType
  gpuModel?: string | null
  nodeId?: number | null
  sourceLotId?: number
  quantity: number
  unitPrice: number
  priceCurrency: 'CNY' | 'CARD_HOUR'
  assetExpiresAt: string
  listingExpiresAt?: string | null
  rateVersion?: string | null
  rateMultiplier?: number | null
  title: string
  description: string
  status: string
  createTime: string
}

export interface CardHourPurchaseQuote {
  id: number
  quoteNo: string
  listingId: number
  buyerUserId: string
  quantity: number
  unitPrice: number
  priceCurrency: 'CNY' | 'CARD_HOUR'
  totalPrice: number
  cnyRate: number
  buyerFee: number
  sellerFee: number
  assetExpiresAt: string
  status: string
  expiresAt: string
}

export interface CardHourTrade {
  id: number
  tradeNo: string
  marketType: CardHourMarketType
  assetType: CardHourAssetType
  gpuModel?: string | null
  quantity: number
  unitPrice: number
  priceCurrency: 'CNY' | 'CARD_HOUR'
  totalPrice: number
  buyerFee: number
  sellerFee: number
  buyerEmail?: string
  sellerEmail?: string
  status: string
  completedAt: string
}

export interface CardHourRfq {
  id: number
  rfqNo: string
  buyerUserId: string
  buyerEmail: string
  assetType: CardHourAssetType
  gpuModel?: string | null
  quantity: number
  minimumExpiresAt: string
  requirements: string
  status: string
  quoteCount: number
  closesAt: string
  createTime: string
}

export interface CardHourRfqQuote {
  id: number
  quoteNo: string
  rfqId: number
  supplierUserId: string
  supplierEmail: string
  supplierName?: string
  listingId: number
  unitPrice: number
  priceCurrency: 'CNY' | 'CARD_HOUR'
  assetExpiresAt: string
  status: string
  expiresAt: string
}

export interface CardHourDeposit {
  id: number
  depositNo: string
  supplierUserId: string
  email?: string
  nodeId: number
  nodeName?: string
  gpuModel: string
  gpuCount: number
  availableFrom: string
  availableTo: string
  expiresAt: string
  gpuHours: number
  rateVersion: string
  rateMultiplier: number
  standardCardHours: number
  status: string
  lotId?: number | null
  rejectionReason?: string
  reviewedAt?: string | null
  createTime: string
}

export interface CardHourRedemption {
  id: number
  redemptionNo: string
  buyerUserId: string
  supplierUserId: string
  buyerEmail: string
  supplierEmail: string
  nodeId: number
  nodeName: string
  gpuModel: string
  gpuCount: number
  startTime: string
  endTime: string
  buyerPublicKey?: string | null
  bookedGpuHours: number
  rateVersion: string
  rateMultiplier: number
  specificHoursFrozen: number
  standardHoursFrozen: number
  actualGpuHours?: number | null
  actualStandardHours?: number | null
  status: string
  deliveryInfo?: string
  deliveryNote?: string
  usageEvidence?: string
  disputeReason?: string
  deliveredAt?: string | null
  stopRemindedAt?: string | null
  usageSubmittedAt?: string | null
  autoConfirmAt?: string | null
  completedAt?: string | null
  createTime: string
}

export interface CardHourMarketStats {
  standardInventory: number
  specificInventory: number
  volume24h: number
  recentTrades: CardHourTrade[]
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
  errorMessage?: string
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

export interface ComputePackagePurchase {
  id: number
  productId: number
  productName: string
  orderNo: string
  modelId: string
  promptTokensTotal: number
  promptTokensRemaining: number
  completionTokensTotal: number
  completionTokensRemaining: number
  priceCardHours: number
  status: string
  keyStatus: 'ACTIVE' | 'SUSPENDED' | 'EXHAUSTED' | 'CONFIG_REQUIRED'
  accessKeyLast4: string
  suspendedReason?: string
  baseUrl: string
  apiFormat: string
  authenticationHeader: string
  endpoints: string[]
  upstreamStationId?: number | null
  upstreamKeyId?: number | null
  createTime: string
}

export interface ComputePackageCredential {
  purchaseId: number
  modelId: string
  baseUrl: string
  apiKey: string
  apiFormat: string
  authenticationHeader: string
  endpoints: string[]
  keyStatus: string
}

export interface ComputeUpstreamOption {
  stationId: number
  stationUrl: string
  keyId: number
  keyLabel: string
  occupancyStatus: number
}

export interface ComputeSuspendedProxyKey {
  id: number
  userId: string
  email: string
  productId: number
  productName: string
  modelId: string
  keyStatus: string
  accessKeyLast4: string
  suspendedReason: string
  stationUrl?: string
  updateTime: string
}

export interface ComputeIdentity {
  id?: number
  userId?: string
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
  supplierUserId: string
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
  platformManaged: number | boolean
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

export function resolveComputeMarketApiOrigin(configuredOrigin: string, fallbackOrigin: string) {
  const origin = configuredOrigin.trim() || fallbackOrigin.trim()
  return origin.replace(/\/+$/, '')
}

function getComputeMarketApiOrigin() {
  return resolveComputeMarketApiOrigin(KOD_MARKET_API_ORIGIN, getKodApiOrigin())
}

function optionalAccountIdentity(accountId: string | null | undefined) {
  return accountId?.trim() || null
}

function requireCurrentAccountIdentity(accessToken: string | null, accountId: string | null) {
  const current = authInfoStore.getState()
  if (current.accessToken !== accessToken || optionalAccountIdentity(current.accountId) !== accountId) {
    throw new Error('账户已切换，已取消旧账户操作')
  }
}

async function request<T>(
  path: string,
  options?: FetchOptions<'json'>,
  authenticated = true,
  origin = getKodApiOrigin(),
  authRefreshAttempted = false
): Promise<T> {
  const session = authInfoStore.getState()
  const token = session.accessToken
  const accountId = optionalAccountIdentity(session.accountId)
  if (authenticated && !token) {
    throw new Error('请先登录 KOD 账号')
  }
  const json = await ofetch<KodResult<T>>(`${origin.replace(/\/+$/, '')}${path}`, {
    ...options,
    headers: {
      ...(options?.headers || {}),
      ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ignoreResponseError: true,
  })
  if (authenticated) requireCurrentAccountIdentity(token, accountId)
  const isSafeToReplay = !options?.method || options.method === 'GET'
  if (json.code === 401 && authenticated && token && isSafeToReplay && !authRefreshAttempted) {
    await refreshKodSession(token, accountId)
    return request(path, options, authenticated, origin, true)
  }
  if (json.code !== 0) {
    throw new ComputeCenterApiError(json.code, json.message || '算力中心请求失败', json.data)
  }
  if (json.data == null) {
    throw new Error(json.message || '算力中心响应缺少数据')
  }
  return json.data
}

export const computeMarketplaceRequest = request

export function getComputeConfig() {
  return request<{
    cardHourCnyRate: number
    cardHourRedeemRate: number
    usdCnyRate: number
    unitName: string
    currency: string
  }>('/api/compute/config', undefined, false)
}

export function getComputeMarketPrices() {
  return request<ComputeMarketPriceSnapshot>(
    '/api/compute/market-prices/latest',
    { timeout: 15_000 },
    false,
    getComputeMarketApiOrigin()
  )
}

export function getComputeMarketPriceHistory(
  model: string,
  range: ComputeMarketPriceRange,
  filters: ComputeMarketPriceHistoryFilters = {}
) {
  const query = new URLSearchParams({ model, range })
  if (filters.rentalTerm) {
    query.set('rentalTerm', filters.rentalTerm)
  }
  if (filters.regions?.length) {
    query.set('regions', filters.regions.join(','))
  }
  if (filters.vramMiB != null) {
    query.set('vramMiB', String(filters.vramMiB))
  }
  if (filters.formFactor) {
    query.set('formFactor', filters.formFactor)
  }
  return request<ComputeMarketPriceHistory>(
    `/api/compute/market-prices/history?${query.toString()}`,
    { timeout: 15_000 },
    false,
    getComputeMarketApiOrigin()
  )
}

export function listComputeProducts(type?: ProductType) {
  const query = type ? `?type=${type}` : ''
  return request<ComputeProduct[]>(`/api/compute/products${query}`, undefined, false)
}

export function getComputeProductImageUrl(productId: number, imageId: number) {
  return `${getKodApiOrigin()}/api/compute/products/${productId}/images/${imageId}`
}

export function getComputeAccount() {
  return request<unknown>('/api/compute/account').then((data) => ComputeAccountSchema.parse(data))
}

export function purchaseCardHours(cardHours: number) {
  return request<unknown>('/api/compute/account/purchase', {
    method: 'POST',
    body: { cardHours },
  }).then((data) => ComputeAccountSchema.parse(data))
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

export function getComputeReferralProfile() {
  return request<ComputeReferralProfile>('/api/compute/referrals/me')
}

export function previewComputeReferral(inviteCode: string) {
  return request<ComputeReferralPreview>(`/api/compute/referrals/preview?code=${encodeURIComponent(inviteCode)}`)
}

export function bindComputeReferral(inviteCode: string, deviceId: string) {
  return request<ComputeReferralProfile>('/api/compute/referrals/bind', {
    method: 'POST',
    body: { inviteCode, deviceId },
  })
}

export function listComputeReferralRewards() {
  return request<ComputeReferralReward[]>('/api/compute/referrals/rewards')
}

function localDateTime(date: Date) {
  const pad = (value: number, width = 2) => String(value).padStart(width, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

export function createEmailInvitation(email: string) {
  return request<unknown>('/api/compute/referrals/email-invites', {
    method: 'POST',
    body: { email },
    retry: 0,
  }).then((data) => EmailInvitationReceiptSchema.parse(data))
}

export function listEmailInvitations(days = 90) {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - days)
  const search = new URLSearchParams({ from: localDateTime(from), to: localDateTime(to) })
  return request<unknown>(`/api/compute/referrals/email-invites?${search.toString()}`).then((data) =>
    EmailInvitationListSchema.parse(data)
  )
}

export function listPlatformServerSkus() {
  return request<unknown>('/api/compute/platform-hosting/skus', undefined, false).then((data) =>
    PlatformServerSkuListSchema.parse(data)
  )
}

export function listPlatformServerLeases() {
  return request<unknown>('/api/compute/platform-hosting/leases').then((data) =>
    PlatformServerLeaseListSchema.parse(data)
  )
}

export function rentPlatformServer(skuId: string, requestId: string) {
  return request<unknown>('/api/compute/platform-hosting/leases', {
    method: 'POST',
    body: { skuId, requestId },
    retry: 0,
  }).then((data) => PlatformServerLeaseSchema.parse(data))
}

export function setLeaseAutoRenew(leaseId: string, enabled: boolean) {
  return request<unknown>(`/api/compute/platform-hosting/leases/${encodeURIComponent(leaseId)}/auto-renew`, {
    method: 'POST',
    body: { enabled },
    retry: 0,
  }).then((data) => PlatformServerLeaseSchema.parse(data))
}

export function getPlatformLeaseDetails(leaseId: string) {
  strictContractId.parse(leaseId)
  return request<unknown>(`/api/compute/platform-hosting/leases/${encodeURIComponent(leaseId)}`).then((data) =>
    PlatformLeaseDetailsSchema.parse(data)
  )
}

export function listAdminPlatformSkus() {
  return request<unknown>('/api/compute/admin/platform-hosting/skus').then((data) =>
    z.array(PlatformSkuAdminSchema).parse(data)
  )
}

export function upsertAdminPlatformSku(input: PlatformSkuAdminInput) {
  const body = PlatformSkuAdminInputSchema.parse(input)
  return request<unknown>('/api/compute/admin/platform-hosting/skus', {
    method: 'POST',
    body,
    retry: 0,
  }).then((data) => PlatformSkuAdminSchema.parse(data))
}

export function listLotteryEligibilities(status?: LotteryEligibility['status']) {
  const parsedStatus = status == null ? undefined : LotteryEligibilityStatusSchema.parse(status)
  const query = parsedStatus ? `?status=${encodeURIComponent(parsedStatus)}` : ''
  return request<unknown>(`/api/compute/lottery/eligibilities${query}`).then((data) =>
    z.array(LotteryEligibilitySchema).parse(data)
  )
}

export function drawLotteryEligibility(eligibilityId: string, requestId: string) {
  strictContractId.parse(eligibilityId)
  const body = z.object({ requestId: z.string().min(1) }).parse({ requestId })
  return request<unknown>(`/api/compute/lottery/eligibilities/${encodeURIComponent(eligibilityId)}/draw`, {
    method: 'POST',
    body,
    retry: 0,
  }).then((data) => LotteryDrawSchema.parse(data))
}

export function listLotteryHistory() {
  return request<unknown>('/api/compute/lottery/history').then((data) => z.array(LotteryHistorySchema).parse(data))
}

export function getLocalDemoCapability() {
  return request<unknown>('/api/compute/local-demo/capability').then((data) => LocalDemoCapabilitySchema.parse(data))
}

export function switchLocalDemoRole(role: LocalDemoRole) {
  const parsedRole = z.enum(['ADMIN', 'HOSTING_TENANT', 'GPU_BUYER']).parse(role)
  return request<unknown>(`/api/compute/local-demo/session/${encodeURIComponent(parsedRole)}`, {
    method: 'POST',
    retry: 0,
  }).then((data) => LocalDemoSessionSchema.parse(data))
}

export function listCardHourMarketListings() {
  return request<CardHourListing[]>('/api/compute/card-hours/market/listings', undefined, false)
}

export function getCardHourMarketStats() {
  return request<CardHourMarketStats>('/api/compute/card-hours/market/stats', undefined, false)
}

export function listCardHourRates() {
  return request<CardHourRateRule[]>('/api/compute/card-hours/rates', undefined, false)
}

export function listCardHourLots() {
  return request<CardHourLot[]>('/api/compute/card-hours/lots')
}

export function getCardHourCustody() {
  return request<{ lots: CardHourLot[]; feeEnabled: boolean; accruedFee: number; rule: string }>(
    '/api/compute/card-hours/custody'
  )
}

export function createCardHourListing(input: {
  marketType: 'PRIMARY_SALE' | 'IDLE_TRANSFER'
  assetType: CardHourAssetType
  gpuModel?: string | null
  sourceLotId: number
  quantity: number
  unitPrice: number
  assetExpiresAt: string
  listingExpiresAt?: string | null
  title: string
  description: string
}) {
  return request<CardHourListing>('/api/compute/card-hours/listings', { method: 'POST', body: input })
}

export function listMyCardHourListings() {
  return request<CardHourListing[]>('/api/compute/card-hours/listings/mine')
}

export function cancelCardHourListing(listingId: number) {
  return request<CardHourListing>(`/api/compute/card-hours/listings/${listingId}/cancel`, { method: 'POST' })
}

export function createCardHourPurchaseQuote(listingId: number) {
  return request<CardHourPurchaseQuote>(`/api/compute/card-hours/listings/${listingId}/purchase-quote`, {
    method: 'POST',
  })
}

export function confirmCardHourPurchaseQuote(quoteId: number, autoTopUp = false) {
  return request<CardHourTrade>(
    `/api/compute/card-hours/purchase-quotes/${quoteId}/confirm${autoTopUp ? '?autoTopUp=true' : ''}`,
    { method: 'POST' }
  )
}

export function listCardHourTrades() {
  return request<CardHourTrade[]>('/api/compute/card-hours/trades')
}

export function createCardHourRfq(input: {
  assetType: CardHourAssetType
  gpuModel?: string | null
  quantity: number
  minimumExpiresAt: string
  closesAt?: string | null
  requirements: string
}) {
  return request<CardHourRfq>('/api/compute/card-hours/rfqs', { method: 'POST', body: input })
}

export function listCardHourRfqs() {
  return request<CardHourRfq[]>('/api/compute/card-hours/rfqs')
}

export function quoteCardHourRfq(rfqId: number, sourceLotId: number, unitPrice: number) {
  return request<CardHourRfqQuote>(`/api/compute/card-hours/rfqs/${rfqId}/quotes`, {
    method: 'POST',
    body: { sourceLotId, unitPrice },
  })
}

export function listCardHourRfqQuotes(rfqId: number) {
  return request<CardHourRfqQuote[]>(`/api/compute/card-hours/rfqs/${rfqId}/quotes`)
}

export function acceptCardHourRfqQuote(quoteId: number, autoTopUp = false) {
  return request<CardHourTrade>(
    `/api/compute/card-hours/rfq-quotes/${quoteId}/accept${autoTopUp ? '?autoTopUp=true' : ''}`,
    { method: 'POST' }
  )
}

export function createCardHourDeposit(input: {
  nodeId: number
  availableFrom: string
  availableTo: string
  expiresAt: string
}) {
  return request<CardHourDeposit>('/api/compute/card-hours/deposits', { method: 'POST', body: input })
}

export function listCardHourDeposits() {
  return request<CardHourDeposit[]>('/api/compute/card-hours/deposits')
}

export function createCardHourRedemption(
  input: { nodeId: number; gpuCount: number; startTime: string; endTime: string; buyerPublicKey: string },
  autoTopUp = false
) {
  return request<CardHourRedemption>(`/api/compute/card-hours/redemptions${autoTopUp ? '?autoTopUp=true' : ''}`, {
    method: 'POST',
    body: input,
  })
}

export function listCardHourRedemptions(role: 'buyer' | 'supplier') {
  return request<CardHourRedemption[]>(`/api/compute/card-hours/redemptions?role=${role}`)
}

export function deliverCardHourRedemption(
  id: number,
  input: { sshHost: string; sshPort: number; sshUsername: string; note: string }
) {
  return request<CardHourRedemption>(`/api/compute/card-hours/redemptions/${id}/delivery`, {
    method: 'POST',
    body: input,
  })
}

export function submitCardHourRedemptionUsage(id: number, actualGpuHours: number, evidence: string) {
  return request<CardHourRedemption>(`/api/compute/card-hours/redemptions/${id}/usage`, {
    method: 'POST',
    body: { actualGpuHours, evidence },
  })
}

export function topUpCardHourRedemption(id: number, autoTopUp = false) {
  return request<CardHourRedemption>(
    `/api/compute/card-hours/redemptions/${id}/top-up${autoTopUp ? '?autoTopUp=true' : ''}`,
    { method: 'POST' }
  )
}

export function confirmCardHourRedemption(id: number) {
  return request<CardHourRedemption>(`/api/compute/card-hours/redemptions/${id}/confirm`, { method: 'POST' })
}

export function disputeCardHourRedemption(id: number, reason: string) {
  return request<CardHourRedemption>(`/api/compute/card-hours/redemptions/${id}/dispute`, {
    method: 'POST',
    body: { reason },
  })
}

export function listAdminCardHourDeposits() {
  return request<CardHourDeposit[]>('/api/compute/card-hours/admin/deposits')
}

export function reviewAdminCardHourDeposit(id: number, approved: boolean, reason: string) {
  return request<CardHourDeposit>(`/api/compute/card-hours/admin/deposits/${id}/review`, {
    method: 'POST',
    body: { approved, reason },
  })
}

export function createAdminCardHourRate(input: {
  versionNo: string
  gpuModel: string
  multiplier: number
  notes: string
}) {
  return request<CardHourRateRule>('/api/compute/card-hours/admin/rates', { method: 'POST', body: input })
}

export function resolveAdminCardHourRedemption(id: number, actualGpuHours: number, reason: string) {
  return request<CardHourRedemption>(`/api/compute/card-hours/admin/redemptions/${id}/resolve`, {
    method: 'POST',
    body: { actualGpuHours, reason },
  })
}

export function listAdminCardHourRedemptions() {
  return request<CardHourRedemption[]>('/api/compute/card-hours/admin/redemptions')
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

export function listComputePackagePurchases() {
  return request<ComputePackagePurchase[]>('/api/compute/packages/purchases')
}

export function getComputePackageCredential(purchaseId: number) {
  return request<ComputePackageCredential>(`/api/compute/packages/purchases/${purchaseId}/credential`)
}

export function regenerateComputePackageKey(purchaseId: number) {
  return request<ComputePackageCredential>(`/api/compute/packages/purchases/${purchaseId}/regenerate-key`, {
    method: 'POST',
  })
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
    buyerPublicKey: string
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

export function deliverComputeReservation(
  reservationId: number,
  input: {
    sshHost: string
    sshPort: number
    sshUsername: string
    actualStart: string
    actualEnd: string
    deliveryNote: string
  }
) {
  return request<ComputeReservation>(`/api/compute/reservations/${reservationId}/delivery`, {
    method: 'POST',
    body: input,
  })
}

export function confirmComputeReservation(reservationId: number) {
  return request<ComputeReservation>(`/api/compute/reservations/${reservationId}/confirm`, { method: 'POST' })
}

export function disputeComputeReservation(reservationId: number, reason: string, evidence: string) {
  return request<ComputeReservation>(`/api/compute/reservations/${reservationId}/dispute`, {
    method: 'POST',
    body: { reason, evidence },
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

type CurrentOwnerGuard = () => boolean

function requireCurrentOwner(isCurrentOwner?: CurrentOwnerGuard) {
  if (isCurrentOwner && !isCurrentOwner()) throw new Error('账户已切换，已取消旧账户操作')
}

export async function submitComputeIdentity(
  input: { realName: string; identityNo: string; front: File; back: File },
  isCurrentOwner?: CurrentOwnerGuard
) {
  const submit = async (maxBytes: number) => {
    const [front, back] = await Promise.all([
      prepareComputeImageUpload(input.front, maxBytes),
      prepareComputeImageUpload(input.back, maxBytes),
    ])
    requireCurrentOwner(isCurrentOwner)
    const body = new FormData()
    body.append('realName', input.realName)
    body.append('identityNo', input.identityNo)
    body.append('front', front)
    body.append('back', back)
    return request<ComputeIdentity>('/api/compute/identity', { method: 'POST', body })
  }

  try {
    return await submit(COMPUTE_IMAGE_UPLOAD_MAX_BYTES)
  } catch (error) {
    if (!isComputeUploadSizeExceeded(error)) throw error
    return submit(COMPUTE_IMAGE_UPLOAD_RETRY_BYTES)
  }
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
  resourceProof: File | null
}

export async function createSupplierNode(input: ComputeNodeInput, isCurrentOwner?: CurrentOwnerGuard) {
  const { resourceProof, ...payload } = input
  if (!resourceProof) throw new Error('请上传 GPU 资源证明图片')
  const submit = async (maxBytes: number) => {
    const proof = await prepareComputeImageUpload(resourceProof, maxBytes)
    requireCurrentOwner(isCurrentOwner)
    const body = new FormData()
    body.append('payload', JSON.stringify(payload))
    body.append('resourceProof', proof)
    return request<ComputeGpuNode>('/api/compute/supplier/nodes', { method: 'POST', body })
  }

  try {
    return await submit(COMPUTE_IMAGE_UPLOAD_MAX_BYTES)
  } catch (error) {
    if (!isComputeUploadSizeExceeded(error)) throw error
    return submit(COMPUTE_IMAGE_UPLOAD_RETRY_BYTES)
  }
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
  supplierUserId?: string
  nodeId?: number
  packagePromptTokens?: number
  packageCompletionTokens?: number
  packagePriceCardHours?: number
  packageDurationHours?: number
  deliveryDeadlineHours?: number
  upstreamStationId?: number
  upstreamKeyId?: number
}

export async function createSupplierGpuProduct(
  input: ComputeProductInput,
  images: File[] = [],
  isCurrentOwner?: CurrentOwnerGuard
) {
  requireCurrentOwner(isCurrentOwner)
  const product = await request<ComputeProduct>('/api/compute/supplier/products', { method: 'POST', body: input })
  requireCurrentOwner(isCurrentOwner)
  for (const image of images) {
    const uploadImage = async (maxBytes: number) => {
      const body = new FormData()
      body.append('image', await prepareComputeImageUpload(image, maxBytes))
      requireCurrentOwner(isCurrentOwner)
      return request<{ imageId: number; productId: number }>(`/api/compute/supplier/products/${product.id}/images`, {
        method: 'POST',
        body,
      })
    }
    try {
      await uploadImage(COMPUTE_IMAGE_UPLOAD_MAX_BYTES)
    } catch (error) {
      if (!isComputeUploadSizeExceeded(error)) throw error
      await uploadImage(COMPUTE_IMAGE_UPLOAD_RETRY_BYTES)
    }
  }
  return product
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

export function updateComputeAdminSettings(input: {
  transferReviewThreshold: number
  reservationManualReviewThreshold?: number
  platformFeeRate: number
  usdCnyRate: number
}) {
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

export async function getAdminNodeProof(nodeId: number) {
  const token = authInfoStore.getState().accessToken
  if (!token) throw new Error('请先登录 KOD 账号')
  const response = await fetch(`${getKodApiOrigin()}/api/compute/admin/nodes/${nodeId}/proof`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error('资源证明读取失败')
  return response.blob()
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

export function listAdminUpstreams() {
  return request<ComputeUpstreamOption[]>('/api/compute/admin/upstreams')
}

export function configureAdminProductUpstream(productId: number, stationId: number, keyId: number) {
  return request<ComputeProduct>(`/api/compute/admin/products/${productId}/upstream`, {
    method: 'POST',
    body: { stationId, keyId },
  })
}

export function listAdminSuspendedProxyKeys() {
  return request<ComputeSuspendedProxyKey[]>('/api/compute/admin/proxy-keys/suspended')
}

export function repairAdminProxyKey(purchaseId: number, regenerate: boolean) {
  return request<{ purchaseId: number; keyStatus: string; regenerated: boolean }>(
    `/api/compute/admin/proxy-keys/${purchaseId}/repair`,
    { method: 'POST', body: { regenerate } }
  )
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

export function settleAdminReservation(reservationId: number, expectedVersion?: number | null) {
  return request<ComputeReservation>(`/api/compute/admin/reservations/${reservationId}/settle`, {
    method: 'POST',
    ...(expectedVersion == null ? {} : { body: { expectedVersion } }),
  })
}

export function resolveAdminReservation(
  reservationId: number,
  input: {
    resolution: 'FULL_REFUND' | 'ACTUAL_USAGE' | 'FULL_SETTLEMENT'
    actualCardHours?: number
    reason: string
    expectedVersion?: number
  }
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
