import { ofetch } from 'ofetch'
import { z } from 'zod'
import { authInfoStore } from '@/stores/authInfoStore'
import { KOD_API_ORIGIN } from '@/variables'

const nullableString = z.string().nullish()
const decimalPattern = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/
const decimalWire = z.union([z.number().finite(), z.string().regex(decimalPattern)])
const decimalNumber = decimalWire.transform((value) => Number(value)).pipe(z.number().finite())
const nonnegativeInteger = decimalNumber.pipe(z.number().int().nonnegative())
const nonnegativeNumber = decimalNumber.pipe(z.number().nonnegative())
const positiveIntegerInput = z.number().finite().int().positive()
const longIdWire = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative().safe()])

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

export const CardTimeProductWireSchema = z.object({
  id: longIdWire,
  name: z.string(),
  category: z.string().default('other'),
  brand: z.string().default(''),
  spec: z.string().default(''),
  rmb_price: decimalWire,
  card_time_price: decimalWire,
  stock: decimalWire.pipe(z.number().int()),
  image_url: nullableString,
  status: z.string().default('active'),
})
export const CardTimeProductSchema = CardTimeProductWireSchema.transform((v) => ({
  id: String(v.id),
  name: v.name,
  category: v.category,
  brand: v.brand,
  spec: v.spec,
  rmbPrice: decimalNumber.parse(v.rmb_price),
  cardTimePrice: decimalNumber.parse(v.card_time_price),
  stock: v.stock,
  imageUrl: v.image_url ?? null,
  status: v.status,
}))
export type CardTimeProduct = z.infer<typeof CardTimeProductSchema>

export const CardTimeAccountWireSchema = z.object({
  available_card_hours: decimalWire,
})
export const CardTimeAccountSchema = CardTimeAccountWireSchema.transform((v) => ({
  availableCardHours: nonnegativeNumber.parse(v.available_card_hours),
}))
export type CardTimeAccount = z.infer<typeof CardTimeAccountSchema>

export const ExchangeOrderWireSchema = z.object({
  id: longIdWire,
  order_no: z.string(),
  user_id: longIdWire,
  product_id: longIdWire,
  product_name: z.string(),
  product_spec: z.string().default(''),
  rmb_price: decimalWire,
  card_time_cost: decimalWire,
  status: z.string().default('pending'),
  shipping_address: nullableString,
  tracking_no: nullableString,
  remark: nullableString,
  create_time: decimalWire.pipe(nonnegativeInteger),
  update_time: decimalWire.pipe(nonnegativeInteger),
})
export const ExchangeOrderSchema = ExchangeOrderWireSchema.transform((v) => ({
  id: String(v.id),
  orderNo: v.order_no,
  userId: String(v.user_id),
  productId: String(v.product_id),
  productName: v.product_name,
  productSpec: v.product_spec,
  rmbPrice: decimalNumber.parse(v.rmb_price),
  cardTimeCost: decimalNumber.parse(v.card_time_cost),
  status: v.status,
  shippingAddress: v.shipping_address ?? null,
  trackingNo: v.tracking_no ?? null,
  remark: v.remark ?? null,
  createTime: nonnegativeInteger.parse(v.create_time),
  updateTime: nonnegativeInteger.parse(v.update_time),
}))
export type ExchangeOrder = z.infer<typeof ExchangeOrderSchema>

export const ExchangeOrderListSchema = z
  .object({
    items: z.array(ExchangeOrderWireSchema),
    total: decimalWire.pipe(nonnegativeInteger),
    page: decimalWire.pipe(z.number().int().positive()),
    pageSize: decimalWire.pipe(z.number().int().positive()),
  })
  .transform((v) => ({
    items: v.items.map((i) => ExchangeOrderSchema.parse(ExchangeOrderWireSchema.parse(i))),
    total: v.total,
    page: v.page,
    pageSize: v.pageSize,
  }))

export const VideoConsumeReportWireSchema = z.object({
  duplicated: z.boolean().default(false),
  amount: decimalWire.pipe(nonnegativeNumber),
  balance: decimalWire.pipe(z.number()),
})
export const VideoConsumeReportSchema = VideoConsumeReportWireSchema.transform((v) => ({
  duplicated: v.duplicated,
  amount: v.amount,
  balance: v.balance,
}))
export type VideoConsumeReport = z.infer<typeof VideoConsumeReportSchema>

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

export const ConsumeRecordWireSchema = z.object({
  id: longIdWire,
  biz_type: nullableString,
  model_name: nullableString,
  tokens: z.union([z.number().int().nonnegative(), z.null(), z.undefined()]),
  unit_price: z.union([decimalWire, z.null(), z.undefined()]),
  amount: decimalWire.pipe(nonnegativeNumber),
  balance_after: z.union([decimalWire, z.null(), z.undefined()]),
  duration: z.union([z.number().int().nonnegative(), z.null(), z.undefined()]),
  resolution: nullableString,
  create_time: decimalWire.pipe(nonnegativeInteger),
})
export const ConsumeRecordSchema = ConsumeRecordWireSchema.transform((v) => ({
  id: String(v.id),
  bizType: v.biz_type ?? null,
  modelName: v.model_name ?? null,
  tokens: v.tokens ?? null,
  unitPrice: v.unit_price == null ? null : decimalNumber.parse(v.unit_price),
  amount: v.amount,
  balanceAfter: v.balance_after == null ? null : decimalNumber.parse(v.balance_after),
  duration: v.duration ?? null,
  resolution: v.resolution ?? null,
  createTime: v.create_time,
}))
export type ConsumeRecord = z.infer<typeof ConsumeRecordSchema>

export const ConsumeHistoryWireSchema = z.object({
  items: z.array(ConsumeRecordWireSchema),
  total: decimalWire.pipe(nonnegativeInteger),
  page: decimalWire.pipe(positiveIntegerInput),
  pageSize: decimalWire.pipe(positiveIntegerInput),
})
export const ConsumeHistorySchema = ConsumeHistoryWireSchema.transform((v) => ({
  items: v.items.map((item) => ConsumeRecordSchema.parse(item)),
  total: v.total,
  page: v.page,
  pageSize: v.pageSize,
}))
export type ConsumeHistory = z.infer<typeof ConsumeHistorySchema>

export class WalletApiError extends Error {
  constructor(
    message: string,
    public readonly kind: 'auth' | 'http' | 'business' | 'schema' | 'network'
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
function schemaFailure(path: string, issues: z.core.$ZodIssue[]): WalletApiError {
  const issuePaths = issues.map((issue) => (issue.path.length ? issue.path.join('.') : '<root>')).join(',')
  console.warn(`[wallet] schema endpoint=${path} issue_path=${issuePaths}`)
  return new WalletApiError('服务响应格式异常，请稍后重试', 'schema')
}
async function request<T extends z.ZodType>(
  path: string,
  schema: T,
  options: { method?: 'GET' | 'POST'; body?: unknown; retry?: number } = {}
): Promise<z.infer<T>> {
  try {
    const response = await ofetch.raw(new URL(path, KOD_API_ORIGIN).toString(), {
      method: options.method ?? 'GET',
      body: options.body as Record<string, unknown> | undefined,
      retry: options.retry ?? 1,
      ignoreResponseError: true,
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
    if (response.status === 401 || response.status === 403)
      throw new WalletApiError('登录状态已失效，请重新登录', 'auth')
    if (response.status < 200 || response.status >= 300)
      throw new WalletApiError(`钱包服务请求失败（HTTP ${response.status}）`, 'http')
    const envelope = ResultEnvelopeSchema.safeParse(response._data)
    if (!envelope.success) throw schemaFailure(path, envelope.error.issues)
    if (envelope.data.code !== 0) throw new WalletApiError(envelope.data.message || '钱包服务处理失败', 'business')
    if (envelope.data.data == null)
      throw schemaFailure(path, [{ code: 'custom', path: ['data'], message: 'missing data', input: undefined }])
    const data = schema.safeParse(envelope.data.data)
    if (!data.success) throw schemaFailure(path, data.error.issues)
    return data.data
  } catch (error) {
    if (error instanceof WalletApiError) throw error
    throw new WalletApiError(error instanceof Error ? error.message : '网络请求失败，请检查网络后重试', 'network')
  }
}
function historyParams(page: number, pageSize: number) {
  return { page: positiveIntegerInput.parse(page), pageSize: positiveIntegerInput.parse(pageSize) }
}
export const walletApi = {
  getTopupInfo: () => request('/api/user/topup/info', TopupInfoSchema),
  getWallet: () => request('/api/user/wallet', WalletSchema),
  getCardTimeAccount: () => request('/api/user/compute/account', CardTimeAccountSchema),
  getCardTimeProducts: () =>
    request(
      '/api/user/compute/products',
      z.array(CardTimeProductWireSchema).transform((arr) => arr.map((i) => CardTimeProductSchema.parse(i)))
    ),
  createExchangeOrder: (productId: string) =>
    request('/api/user/compute/exchange', ExchangeOrderWireSchema, {
      method: 'POST',
      body: { product_id: productId },
      retry: 0,
    }),
  getExchangeOrders: async (page: number, pageSize: number) => {
    const search = new URLSearchParams({ p: String(page), pageSize: String(pageSize) })
    return request(`/api/user/compute/exchange/orders?${search.toString()}`, ExchangeOrderListSchema)
  },
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
  // 视频消费上报：retry 0，客户端以 requestId 幂等，网络重试由调用方按记录状态驱动
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
  getConsumeHistory: async (page: number, pageSize: number) => {
    const input = historyParams(page, pageSize)
    const search = new URLSearchParams({ p: String(input.page), pageSize: String(input.pageSize) })
    const history = await request(`/api/user/consume/self?${search.toString()}`, ConsumeHistorySchema)
    if (history.page !== input.page || history.pageSize !== input.pageSize) {
      throw schemaFailure('/api/user/consume/self', [
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
}
export type PayMethod = z.infer<typeof PayMethodSchema>
export type TopupInfo = z.infer<typeof TopupInfoSchema>
export type Wallet = z.infer<typeof WalletSchema>
export type TopupRecord = z.infer<typeof TopupRecordSchema>
export type TopupHistory = z.infer<typeof TopupHistorySchema>
