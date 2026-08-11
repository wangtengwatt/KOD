import { z } from 'zod'
import { getAuthenticatedAfetch, getKodApiOrigin } from '@/packages/remote'

const kodResultSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ code: z.number(), message: z.string().optional(), data: data.nullish() })

function unwrap<T>(value: { code: number; message?: string; data?: T | null }): T {
  if (value.code !== 0 || value.data == null) throw new Error(value.message || 'Kod API request failed')
  return value.data
}

const authPayloadSchema = z.object({
  token: z.string().min(1),
  newUser: z.boolean(),
  relayMessage: z.string().nullable().optional(),
})
const stationSchema = z.object({ id: z.number(), url: z.string().url(), createTime: z.string() })
const relayConfigSchema = z.object({ url: z.string().url(), apiKey: z.string().min(1) })
const walletSchema = z.object({ balance: z.number(), historical_consumption: z.number() })
const topUpItemSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  amount: z.number(),
  money: z.string(),
  trade_no: z.string(),
  payment_method: z.string(),
  payment_provider: z.string(),
  create_time: z.string(),
  complete_time: z.string().nullable(),
  status: z.string(),
})
const topUpPageSchema = z.object({
  items: z.array(topUpItemSchema),
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
})
const payResponseSchema = z.object({ orderNo: z.string(), paymentUrl: z.string().url() })

export type KodAuthPayload = z.infer<typeof authPayloadSchema>
export type KodStation = z.infer<typeof stationSchema>
export type KodRelayConfig = z.infer<typeof relayConfigSchema>
export type KodWallet = z.infer<typeof walletSchema>
export type KodTopUpPage = z.infer<typeof topUpPageSchema>
export type KodPayResponse = z.infer<typeof payResponseSchema>

async function publicPost<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${getKodApiOrigin()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await response.json()
  return unwrap(kodResultSchema(schema).parse(json))
}

async function authenticated<T>(path: string, schema: z.ZodType<T>, options?: RequestInit): Promise<T> {
  const afetch = await getAuthenticatedAfetch()
  const response = await afetch(`${getKodApiOrigin()}${path}`, options)
  return unwrap(kodResultSchema(schema).parse(await response.json()))
}

export const kodPortalApi = {
  login: (email: string, password: string) => publicPost('/api/auth/login', { email, password }, authPayloadSchema),
  register: (email: string, password: string, inviteCode: string, emailCode: string) =>
    publicPost('/api/auth/login', { email, password, inviteCode, emailCode }, authPayloadSchema),
  sendEmailCode: (email: string) => publicPost('/api/auth/send-code', { email }, z.unknown()),
  listStations: async () => {
    const response = await fetch(`${getKodApiOrigin()}/api/relay-station/list`)
    return unwrap(kodResultSchema(z.array(stationSchema)).parse(await response.json()))
  },
  getRelayConfig: () => authenticated('/api/relay-station/config', relayConfigSchema),
  getWallet: () => authenticated('/api/user/wallet', walletSchema),
  getTopUpHistory: (page = 1, pageSize = 10) =>
    authenticated(`/api/user/topup/self?p=${page}&pageSize=${pageSize}`, topUpPageSchema),
  createPay: (amount: number, paymentMethod: string) =>
    authenticated('/api/user/pay', payResponseSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, payment_method: paymentMethod }),
    }),
}

export function isAllowedPaymentUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}
