import { tinpayCheckoutUrlSchema, tinpaySessionIdSchema, tinpaySessionStatusSchema } from '@shared/tinpay'
import { z } from 'zod'
import { getKodApiOrigin } from './kodApiOrigin'
import { getAuthenticatedAfetch } from './remote'

const sessionFields = {
  sessionId: tinpaySessionIdSchema,
  checkoutUrl: tinpayCheckoutUrlSchema,
  expiresAt: z.iso.datetime({ offset: true }),
  demoOnly: z.literal(true),
}
const createResponseSchema = z
  .object({
    ...sessionFields,
    status: tinpaySessionStatusSchema.optional(),
    transcript: z.string().optional(),
    recognizedCode: z.string().optional(),
    completedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict()
const statusResponseSchema = z
  .object({
    sessionId: tinpaySessionIdSchema,
    status: tinpaySessionStatusSchema,
    expiresAt: z.iso.datetime({ offset: true }),
    demoOnly: z.literal(true),
    transcript: z.string().optional(),
    recognizedCode: z.string().optional(),
    completedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict()
const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z
    .object({ code: z.number(), message: z.string().optional(), data: data.nullish() })
    .strict()
    .superRefine((value, context) => {
      if (value.code !== 0)
        context.addIssue({ code: 'custom', path: ['code'], message: value.message || 'KOD API error' })
      if (value.data == null)
        context.addIssue({ code: 'custom', path: ['data'], message: 'KOD API response missing data' })
    })
export type TinpayCreateRequest = {
  product: string
  scene: string
  electron: { platform: 'windows'; container: 'electron'; hostAppId: 'kod-electron'; appVersion: string }
}
export type TinpaySession = z.infer<typeof createResponseSchema>
export type TinpayStatus = z.infer<typeof statusResponseSchema>
export const parseTinpayCreateResponse = (value: unknown) => {
  const parsed = createResponseSchema.or(envelope(createResponseSchema)).parse(value)
  return createResponseSchema.parse('data' in parsed ? parsed.data : parsed)
}
export const parseTinpayStatusResponse = (value: unknown) => {
  const parsed = statusResponseSchema.or(envelope(statusResponseSchema)).parse(value)
  return statusResponseSchema.parse('data' in parsed ? parsed.data : parsed)
}
async function parse<T>(response: Response, parser: (value: unknown) => T): Promise<T> {
  if (!response.ok) throw new Error(`Tinpay API request failed (${response.status})`)
  return parser(await response.json())
}
export async function createTinpaySession(input: TinpayCreateRequest, signal?: AbortSignal): Promise<TinpaySession> {
  const afetch = await getAuthenticatedAfetch()
  const response = await afetch(
    `${getKodApiOrigin()}/api/tinpay/demo-sessions`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal },
    { retry: 0 }
  )
  return parse(response, parseTinpayCreateResponse)
}
export async function getTinpaySession(sessionId: string, signal?: AbortSignal): Promise<TinpayStatus> {
  const id = tinpaySessionIdSchema.parse(sessionId)
  const afetch = await getAuthenticatedAfetch()
  const response = await afetch(
    `${getKodApiOrigin()}/api/tinpay/demo-sessions/${encodeURIComponent(id)}`,
    { method: 'GET', signal },
    { retry: 0 }
  )
  return parse(response, parseTinpayStatusResponse)
}
