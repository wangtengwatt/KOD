import { ofetch } from 'ofetch'
import { z } from 'zod'
import { getKodApiOrigin } from '@/packages/kodApiOrigin'
import { authInfoStore } from '@/stores/authInfoStore'

const nullableString = z.string().nullish()
const decimalPattern = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/
const decimalWire = z.union([z.number().finite(), z.string().regex(decimalPattern)])
const decimalNumber = decimalWire.transform((value) => Number(value)).pipe(z.number().finite())
const nonnegativeInteger = decimalNumber.pipe(z.number().int().nonnegative())
const nonnegativeNumber = decimalNumber.pipe(z.number().nonnegative())
const positiveIntegerInput = z.number().finite().int().positive()
const longIdWire = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative().safe()])
const rewardedAdCampaignId = z.string().min(1).max(64)
const rewardedAdWatchId = z.number().int().positive().safe()
const WALLET_REQUEST_TIMEOUT_MS = 10_000
const rewardAssetUrl = z
  .string()
  .min(1)
  .max(2048)
  .transform((value, context) => {
    try {
      const apiOrigin = new URL(getKodApiOrigin())
      const url = new URL(value, apiOrigin)
      const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      if (url.origin !== apiOrigin.origin || (url.protocol !== 'https:' && !localHttp)) throw new Error('unsafe URL')
      return url.toString()
    } catch {
      context.addIssue({ code: 'custom', message: 'reward asset must use the trusted API origin' })
      return z.NEVER
    }
  })
const optionalRewardAssetUrl = z
  .string()
  .max(2048)
  .transform((value) => value.trim())
  .pipe(z.union([z.literal('').transform(() => null), rewardAssetUrl]))
const rewardedAdDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const rewardedAdInstant = z
  .string()
  .datetime({ offset: true })
  .transform((value) => Date.parse(value) / 1000)

export const PayMethodWireSchema = z.object({
  name: z.string(),
  type: z.string().min(1),
  color: z.string().optional(),
  min_topup: decimalWire.optional(),
})
export const PayMethodSchema = PayMethodWireSchema.transform((value) => ({
  name: value.name,
  type: value.type,
  color: value.color,
  minTopup: value.min_topup === undefined ? undefined : nonnegativeInteger.parse(value.min_topup),
}))
export const TopupInfoWireSchema = z.object({
  enable_online_topup: z.boolean(),
  enable_stripe_topup: z.boolean().default(false),
  enable_creem_topup: z.boolean().default(false),
  enable_waffo_topup: z.boolean().default(false),
  enable_waffo_pancake_topup: z.boolean().default(false),
  payment_compliance_confirmed: z.boolean().default(false),
  payment_compliance_terms_version: nullableString,
  min_topup: decimalWire,
  stripe_min_topup: decimalWire.default(0),
  waffo_min_topup: decimalWire.default(0),
  waffo_pancake_min_topup: decimalWire.default(0),
  amount_options: z.array(decimalWire).default([]),
  discount: z.record(z.string(), decimalWire).nullish(),
  pay_methods: z.array(PayMethodWireSchema),
  waffo_pay_methods: z.array(PayMethodWireSchema).nullish(),
  topup_link: nullableString,
  creem_products: z.unknown().nullish(),
})
export const TopupInfoSchema = TopupInfoWireSchema.transform((value) => ({
  enableOnlineTopup: value.enable_online_topup,
  enableStripeTopup: value.enable_stripe_topup,
  enableCreemTopup: value.enable_creem_topup,
  enableWaffoTopup: value.enable_waffo_topup,
  enableWaffoPancakeTopup: value.enable_waffo_pancake_topup,
  paymentComplianceConfirmed: value.payment_compliance_confirmed,
  paymentComplianceTermsVersion: value.payment_compliance_terms_version ?? null,
  minTopup: nonnegativeInteger.parse(value.min_topup),
  stripeMinTopup: nonnegativeInteger.parse(value.stripe_min_topup),
  waffoMinTopup: nonnegativeInteger.parse(value.waffo_min_topup),
  waffoPancakeMinTopup: nonnegativeInteger.parse(value.waffo_pancake_min_topup),
  amountOptions: value.amount_options.map((item) => nonnegativeInteger.pipe(z.number().positive()).parse(item)),
  discount: value.discount
    ? Object.fromEntries(Object.entries(value.discount).map(([key, item]) => [key, decimalNumber.parse(item)]))
    : null,
  payMethods: value.pay_methods.map((item) => PayMethodSchema.parse(item)),
  waffoPayMethods: (value.waffo_pay_methods ?? []).map((item) => PayMethodSchema.parse(item)),
  topupLink: value.topup_link ?? null,
  creemProducts: value.creem_products,
}))
export const WalletWireSchema = z.object({ balance: decimalWire, historical_consumption: decimalWire })
export const WalletSchema = WalletWireSchema.transform((value) => ({
  balance: decimalNumber.parse(value.balance),
  historicalConsumption: decimalNumber.parse(value.historical_consumption),
}))

const cardHourDecimalPattern = /^\d{1,17}(?:\.\d{1,3})?$/
const maxSafeCardHourThousandths = BigInt(Number.MAX_SAFE_INTEGER)
const maxUnambiguousNumericCardHours = 2 ** 43
const cardHourDecimalWire = z.union([z.number().finite().nonnegative(), z.string()]).transform((input, context) => {
  if (typeof input === 'number' && input >= maxUnambiguousNumericCardHours) {
    context.addIssue({ code: 'custom', message: 'numeric card hours exceed unambiguous thousandth precision' })
    return z.NEVER
  }
  const text = String(input)
  if (!cardHourDecimalPattern.test(text)) {
    context.addIssue({ code: 'custom', message: 'card hours must be a nonnegative DECIMAL(20,3)' })
    return z.NEVER
  }
  const [whole, fraction = ''] = text.split('.')
  const thousandths = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'))
  if (thousandths > maxSafeCardHourThousandths) {
    context.addIssue({ code: 'custom', message: 'card hours exceed the exact UI number range' })
    return z.NEVER
  }
  const value = Number(text)
  if (value.toFixed(3) !== `${whole}.${fraction.padEnd(3, '0')}`) {
    context.addIssue({ code: 'custom', message: 'card hours cannot round-trip through the UI number type' })
    return z.NEVER
  }
  return { thousandths, value }
})

const cardTimeAccountAliasesSchema = z
  .object({
    available_card_hours: cardHourDecimalWire.optional(),
    availableCardHours: cardHourDecimalWire.optional(),
    spendable_card_hours: cardHourDecimalWire.optional(),
    spendableCardHours: cardHourDecimalWire.optional(),
    redeemable_card_hours: cardHourDecimalWire.optional(),
    redeemableCardHours: cardHourDecimalWire.optional(),
    reward_card_hours: cardHourDecimalWire.optional(),
    rewardCardHours: cardHourDecimalWire.optional(),
  })
  .passthrough()
  .superRefine((value, context) => {
    const pairs = [
      ['available_card_hours', 'availableCardHours'],
      ['spendable_card_hours', 'spendableCardHours'],
      ['redeemable_card_hours', 'redeemableCardHours'],
      ['reward_card_hours', 'rewardCardHours'],
    ] as const
    for (const [snake, camel] of pairs) {
      if (value[snake] && value[camel] && value[snake].thousandths !== value[camel].thousandths) {
        context.addIssue({ code: 'custom', path: [camel], message: `${snake} and ${camel} must match` })
      }
    }
    const qualifiedAliases = [
      value.spendable_card_hours,
      value.spendableCardHours,
      value.redeemable_card_hours,
      value.redeemableCardHours,
      value.reward_card_hours,
      value.rewardCardHours,
    ]
    const hasQualifiedAlias = qualifiedAliases.some(Boolean)
    const spendable = value.spendable_card_hours ?? value.spendableCardHours
    const redeemable = value.redeemable_card_hours ?? value.redeemableCardHours
    const reward = value.reward_card_hours ?? value.rewardCardHours
    const available = value.available_card_hours ?? value.availableCardHours
    if (hasQualifiedAlias && (!spendable || !redeemable || !reward)) {
      context.addIssue({ code: 'custom', message: 'all qualified card-hour balances are required' })
    }
    if (!hasQualifiedAlias && !available) {
      context.addIssue({ code: 'custom', message: 'available card hours are required' })
    }
    if (spendable && redeemable && reward && spendable.thousandths > redeemable.thousandths + reward.thousandths) {
      context.addIssue({ code: 'custom', message: 'spendable card hours cannot exceed qualified card hours' })
    }
    if (available && spendable && available.thousandths !== spendable.thousandths) {
      context.addIssue({
        code: 'custom',
        path: ['availableCardHours'],
        message: 'available and spendable hours must match',
      })
    }
  })
  .transform((value) => {
    const spendable = value.spendable_card_hours ?? value.spendableCardHours
    const redeemable = value.redeemable_card_hours ?? value.redeemableCardHours
    const reward = value.reward_card_hours ?? value.rewardCardHours
    if (spendable && redeemable && reward) {
      return {
        availableCardHours: spendable.value,
        spendableCardHours: spendable.value,
        redeemableCardHours: redeemable.value,
        rewardCardHours: reward.value,
      }
    }
    return { availableCardHours: (value.available_card_hours ?? value.availableCardHours)?.value as number }
  })

export interface CardHourBalances {
  availableCardHours: number
  spendableCardHours: number
  redeemableCardHours: number
  rewardCardHours: number
}
export type CardTimeAccount = CardHourBalances | { availableCardHours: number }

export const CardTimeAccountWireSchema = cardTimeAccountAliasesSchema
export const CardTimeAccountSchema = cardTimeAccountAliasesSchema
export const CardHourAccountWireSchema = cardTimeAccountAliasesSchema.refine(
  (value): value is CardHourBalances => 'spendableCardHours' in value,
  { message: 'qualified card-hour balances are required' }
)
export const CardHourAccountSchema = CardHourAccountWireSchema

export const RewardedAdStatusWireSchema = z
  .object({
    campaignId: rewardedAdCampaignId,
    assetPath: rewardAssetUrl,
    posterPath: optionalRewardAssetUrl,
    durationSeconds: z.number().int().positive().max(3600),
    minimumSeconds: z.number().int().positive().max(3600),
    rewardCardHours: decimalWire,
    remainingCount: z.number().int().min(0).max(1),
    nextEligibleDate: rewardedAdDate,
    eligible: z.boolean(),
  })
  .transform((value) => ({
    campaignId: value.campaignId,
    rewardCardHours: nonnegativeNumber.pipe(z.number().positive().max(100)).parse(value.rewardCardHours),
    remainingCount: value.remainingCount,
    durationSeconds: value.durationSeconds,
    minimumSeconds: value.minimumSeconds,
    nextEligibleDate: value.nextEligibleDate,
    eligible: value.eligible,
    videoUrl: value.assetPath,
    posterUrl: value.posterPath,
  }))
  .refine((value) => value.minimumSeconds >= value.durationSeconds, {
    path: ['minimumSeconds'],
    message: 'minimum watch time must cover the asset duration',
  })
  .refine((value) => value.eligible === value.remainingCount > 0, {
    path: ['eligible'],
    message: 'eligibility must match the remaining server allowance',
  })
  .refine((value) => value.rewardCardHours === 10, {
    path: ['rewardCardHours'],
    message: 'rewarded ads must credit exactly ten card hours',
  })
export type RewardedAdStatus = z.infer<typeof RewardedAdStatusWireSchema>

export const RewardedAdWatchWireSchema = z.object({
  id: rewardedAdWatchId,
  campaignId: rewardedAdCampaignId,
  assetPath: rewardAssetUrl,
  minimumSeconds: z.number().int().positive().max(3600),
  startedAt: rewardedAdInstant,
  expiresAt: rewardedAdInstant,
  progressToken: z.string().min(1).max(160),
})
export const RewardedAdWatchSchema = RewardedAdWatchWireSchema.transform((value) => ({
  watchId: value.id,
  campaignId: value.campaignId,
  videoUrl: value.assetPath,
  minimumSeconds: value.minimumSeconds,
  startedAt: value.startedAt,
  expiresAt: value.expiresAt,
  progressToken: value.progressToken,
}))
export type RewardedAdWatch = z.infer<typeof RewardedAdWatchSchema>

export const RewardedAdClaimWireSchema = z.object({
  watchId: rewardedAdWatchId,
  rewardCardHours: decimalWire,
  remainingCount: z.number().int().min(0).max(1),
  nextEligibleDate: rewardedAdDate,
})
export const RewardedAdClaimSchema = RewardedAdClaimWireSchema.transform((value) => ({
  watchId: value.watchId,
  rewardCardHours: nonnegativeNumber.pipe(z.number().positive().max(100)).parse(value.rewardCardHours),
  remainingCount: value.remainingCount,
  nextEligibleDate: value.nextEligibleDate,
})).refine((value) => value.rewardCardHours === 10, {
  path: ['rewardCardHours'],
  message: 'rewarded ad claims must credit exactly ten card hours',
})
export type RewardedAdClaim = z.infer<typeof RewardedAdClaimSchema>

export const RewardedAdProgressSchema = z
  .object({
    watchId: rewardedAdWatchId,
    mediaPositionSeconds: z.number().int().positive().max(3600),
    sequence: z.number().int().positive().safe(),
    nextProgressToken: z.string().min(1).max(160),
    expiresAt: rewardedAdInstant,
  })
  .passthrough()
export type RewardedAdProgress = z.infer<typeof RewardedAdProgressSchema>

export const RewardedAdCompletionSchema = z
  .object({
    watchId: rewardedAdWatchId,
    completedAt: rewardedAdInstant,
    expiresAt: rewardedAdInstant,
  })
  .passthrough()
export type RewardedAdCompletion = z.infer<typeof RewardedAdCompletionSchema>

export const RewardedAdAbandonmentSchema = z.object({
  watchId: rewardedAdWatchId,
  abandonedAt: rewardedAdInstant,
})
export type RewardedAdAbandonment = z.infer<typeof RewardedAdAbandonmentSchema>

export const REWARDED_AD_PROGRESS_WINDOW_ELAPSED_CODE = 409
export const REWARDED_AD_PROGRESS_WINDOW_ELAPSED_MESSAGE = 'Advertisement progress window has elapsed'

export interface RewardedAdProgressInput {
  watchId: number
  progressToken: string
  mediaPositionSeconds: number
  sequence: number
  focused: boolean
}
export const VideoConsumeReportSchema = z
  .object({
    duplicated: z.boolean().default(false),
    amount: decimalWire.pipe(nonnegativeNumber),
    balance: decimalWire,
  })
  .transform((value) => ({
    duplicated: value.duplicated,
    amount: Number(value.amount),
    balance: Number(value.balance),
  }))

export interface VideoConsumeReportInput {
  requestId: string
  model: string
  tokens: number
  upstreamTaskId?: string
  duration?: number
  resolution?: string
  hasVideoInput?: boolean
  hasAudio?: boolean
}
export const TopupRecordWireSchema = z.object({
  id: longIdWire,
  user_id: longIdWire,
  amount: decimalWire.pipe(nonnegativeInteger),
  money: decimalWire.pipe(nonnegativeNumber),
  trade_no: nullableString,
  payment_method: nullableString,
  payment_provider: nullableString,
  create_time: decimalWire.pipe(nonnegativeInteger),
  complete_time: z.union([decimalWire, z.null(), z.undefined()]),
  status: nullableString,
})
export const TopupRecordSchema = TopupRecordWireSchema.transform((value) => ({
  id: String(value.id),
  userId: String(value.user_id),
  amount: value.amount,
  money: value.money,
  tradeNo: value.trade_no ?? null,
  paymentMethod: value.payment_method ?? null,
  paymentProvider: value.payment_provider ?? null,
  createTime: nonnegativeInteger.parse(value.create_time),
  completeTime:
    value.complete_time == null || Number(value.complete_time) === 0
      ? null
      : nonnegativeInteger.parse(value.complete_time),
  status: value.status ?? null,
}))
export const TopupHistoryWireSchema = z
  .object({
    items: z.array(TopupRecordWireSchema),
    total: decimalWire.pipe(nonnegativeInteger),
    page: decimalWire.pipe(positiveIntegerInput),
    pageSize: decimalWire.pipe(positiveIntegerInput),
  })
  .refine((value) => value.total >= value.items.length, { path: ['total'], message: 'total must cover returned items' })
export const TopupHistorySchema = TopupHistoryWireSchema.transform((value) => ({
  items: value.items.map((item) => TopupRecordSchema.parse(item)),
  total: value.total,
  page: value.page,
  pageSize: value.pageSize,
}))
export const PaymentWireSchema = z.object({ orderNo: z.string().min(1), paymentUrl: z.string().min(1) })
export const PaymentSchema = PaymentWireSchema
const AmountSchema = decimalNumber
const ResultEnvelopeSchema = z.object({
  code: z.number(),
  message: z.string().default(''),
  data: z.unknown().optional(),
})
const ErrorEnvelopeSchema = z.object({ message: z.string().optional() })

export class WalletApiError extends Error {
  constructor(
    message: string,
    public readonly kind: 'auth' | 'http' | 'business' | 'schema' | 'network' | 'unsupported',
    public readonly businessCode?: number,
    public readonly statusCode?: number
  ) {
    super(message)
    this.name = 'WalletApiError'
  }
}
function accessToken() {
  const token = authInfoStore.getState().accessToken
  if (!token) throw new WalletApiError('请先登录 Kod 账户', 'auth')
  return token
}
function invalidSession(rejectedAccessToken: string) {
  if (authInfoStore.getState().accessToken === rejectedAccessToken) {
    authInfoStore.getState().clearTokens()
  }
  return new WalletApiError('登录状态已失效，请重新登录', 'auth')
}
function schemaFailure(path: string, issues: z.core.$ZodIssue[]): WalletApiError {
  const issuePaths = issues.map((issue) => (issue.path.length ? issue.path.join('.') : '<root>')).join(',')
  console.warn(`[wallet] schema endpoint=${path} issue_path=${issuePaths}`)
  return new WalletApiError('服务响应格式异常，请稍后重试', 'schema')
}
async function request<T extends z.ZodType>(
  path: string,
  schema: T,
  options: { method?: 'GET' | 'POST'; body?: unknown; retry?: number; timeoutMs?: number } = {}
): Promise<z.infer<T>> {
  const requestAccessToken = accessToken()
  try {
    const response = await ofetch.raw(new URL(path, getKodApiOrigin()).toString(), {
      method: options.method ?? 'GET',
      body: options.body as Record<string, unknown> | undefined,
      retry: options.retry ?? 1,
      timeout: options.timeoutMs ?? WALLET_REQUEST_TIMEOUT_MS,
      ignoreResponseError: true,
      headers: {
        Authorization: `Bearer ${requestAccessToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
    if (response.status === 401 || response.status === 403) throw invalidSession(requestAccessToken)
    if (response.status < 200 || response.status >= 300) {
      const responseMessage = ErrorEnvelopeSchema.safeParse(response._data)
      const serverMessage = responseMessage.success ? responseMessage.data.message : undefined
      const missingFeatureRoute =
        (path.startsWith('/api/compute/') || path.startsWith('/api/user/compute/')) &&
        (response.status === 404 || (response.status === 500 && /no static resource/i.test(serverMessage ?? '')))
      if (missingFeatureRoute) {
        throw new WalletApiError('当前服务端尚未开通卡时奖励', 'unsupported', undefined, response.status)
      }
      const errorMessage =
        response.status >= 500 ? '钱包服务暂时不可用，请稍后重试' : `钱包服务请求失败（HTTP ${response.status}）`
      throw new WalletApiError(errorMessage, 'http', undefined, response.status)
    }
    const envelope = ResultEnvelopeSchema.safeParse(response._data)
    if (!envelope.success) throw schemaFailure(path, envelope.error.issues)
    if (envelope.data.code === 401 || envelope.data.code === 403) throw invalidSession(requestAccessToken)
    if (envelope.data.code !== 0)
      throw new WalletApiError(envelope.data.message || '钱包服务处理失败', 'business', envelope.data.code)
    if (envelope.data.data == null)
      throw schemaFailure(path, [{ code: 'custom', path: ['data'], message: 'missing data', input: undefined }])
    const data = schema.safeParse(envelope.data.data)
    if (!data.success) throw schemaFailure(path, data.error.issues)
    return data.data
  } catch (error) {
    if (error instanceof WalletApiError) throw error
    const causeText = error instanceof Error ? `${error.name} ${error.message}` : String(error)
    if (/abort|timeout|timed out/i.test(causeText)) {
      throw new WalletApiError('钱包服务响应超时，请稍后重试', 'network')
    }
    throw new WalletApiError('无法连接钱包服务，请检查网络后重试', 'network')
  }
}
function historyParams(page: number, pageSize: number) {
  return { page: positiveIntegerInput.parse(page), pageSize: positiveIntegerInput.parse(pageSize) }
}
async function getCardTimeAccount() {
  try {
    return await request('/api/compute/account', CardTimeAccountSchema, { retry: 0 })
  } catch (error) {
    if (!(error instanceof WalletApiError) || error.kind !== 'unsupported') throw error
    return request('/api/user/compute/account', CardTimeAccountSchema, { retry: 0 })
  }
}
export const walletApi = {
  getTopupInfo: () => request('/api/user/topup/info', TopupInfoSchema),
  getWallet: () => request('/api/user/wallet', WalletSchema),
  getCardTimeAccount,
  getRewardedAdStatus: () => request('/api/compute/ad-reward/status', RewardedAdStatusWireSchema, { retry: 0 }),
  startRewardedAd: (campaignId: string) =>
    request('/api/compute/ad-reward/start', RewardedAdWatchSchema, {
      method: 'POST',
      body: { campaignId: rewardedAdCampaignId.parse(campaignId) },
      retry: 0,
    }),
  progressRewardedAd: (input: RewardedAdProgressInput) =>
    request('/api/compute/ad-reward/progress', RewardedAdProgressSchema, {
      method: 'POST',
      body: {
        watchId: rewardedAdWatchId.parse(input.watchId),
        progressToken: z.string().min(1).max(160).parse(input.progressToken),
        mediaPositionSeconds: z.number().int().positive().max(3600).parse(input.mediaPositionSeconds),
        sequence: z.number().int().positive().safe().parse(input.sequence),
        focused: z.boolean().parse(input.focused),
      },
      retry: 0,
    }),
  abandonRewardedAd: (watchId: number) =>
    request('/api/compute/ad-reward/abandon', RewardedAdAbandonmentSchema, {
      method: 'POST',
      body: { watchId: rewardedAdWatchId.parse(watchId) },
      retry: 0,
    }),
  completeRewardedAd: (watchId: number, progressToken: string) =>
    request('/api/compute/ad-reward/complete', RewardedAdCompletionSchema, {
      method: 'POST',
      body: {
        watchId: rewardedAdWatchId.parse(watchId),
        progressToken: z.string().min(1).max(160).parse(progressToken),
      },
      retry: 0,
    }),
  claimRewardedAd: (watchId: number) =>
    request('/api/compute/ad-reward/claim', RewardedAdClaimSchema, {
      method: 'POST',
      body: { watchId: rewardedAdWatchId.parse(watchId) },
      retry: 0,
    }),
  calculateAmount: (amount: number) => request('/api/user/amount', AmountSchema, { method: 'POST', body: { amount } }),
  pay: (amount: number, paymentMethod: string) =>
    request('/api/user/pay', PaymentSchema, {
      method: 'POST',
      body: { amount, payment_method: paymentMethod },
      retry: 0,
    }),
  getTopupHistory: async (page: number, pageSize: number) => {
    const input = historyParams(page, pageSize)
    const search = new URLSearchParams({ p: String(input.page), pageSize: String(input.pageSize) })
    const history = await request(`/api/user/topup/self?${search.toString()}`, TopupHistorySchema)
    if (history.page !== input.page || history.pageSize !== input.pageSize) {
      throw schemaFailure('/api/user/topup/self', [
        {
          code: 'custom',
          path: [history.page !== input.page ? 'page' : 'pageSize'],
          message: 'pagination response does not match request',
          input: history.page !== input.page ? history.page : history.pageSize,
        },
      ])
    }
    return history
  },
  reportVideoConsumption: (input: VideoConsumeReportInput) =>
    request('/api/user/consume/video', VideoConsumeReportSchema, {
      method: 'POST',
      body: {
        request_id: input.requestId,
        model: input.model,
        tokens: input.tokens,
        upstream_task_id: input.upstreamTaskId,
        duration: input.duration,
        resolution: input.resolution,
        has_video_input: input.hasVideoInput,
        has_audio: input.hasAudio,
      },
      retry: 0,
    }),
}
export type PayMethod = z.infer<typeof PayMethodSchema>
export type TopupInfo = z.infer<typeof TopupInfoSchema>
export type Wallet = z.infer<typeof WalletSchema>
export type TopupRecord = z.infer<typeof TopupRecordSchema>
export type TopupHistory = z.infer<typeof TopupHistorySchema>
