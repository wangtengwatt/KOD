import { z } from 'zod'

export const TINPAY_ORIGIN = 'https://tinpay.kai.com'
export const TINPAY_SESSION_PARTITION = 'tinpay-demo-isolated'

export const TINPAY_IPC_CHANNELS = {
  open: 'tinpay:open',
  close: 'tinpay:close',
  openExternal: 'tinpay:open-external',
  event: 'tinpay:event',
  notification: 'tinpay:notification',
} as const

export type TinpayIpcChannel = (typeof TINPAY_IPC_CHANNELS)[keyof typeof TINPAY_IPC_CHANNELS]

export const tinpaySessionIdSchema = z.string().regex(/^tp_demo_[0-9a-f]{20}$/)
export type TinpaySessionId = z.infer<typeof tinpaySessionIdSchema>

const tinpayCheckoutUrlSchema = z
  .string()
  .url()
  .max(4096)
  .refine((value) => isAllowedTinpayUrl(value), {
    message: `URL must use the exact ${TINPAY_ORIGIN} origin`,
  })
export { tinpayCheckoutUrlSchema }

export const tinpaySessionStatusSchema = z.enum([
  'CREATED',
  'READY',
  'RECORDING',
  'TRANSCRIBED',
  'MATCHED',
  'RETRY_REQUIRED',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'ERROR',
])
export type TinpaySessionStatus = z.infer<typeof tinpaySessionStatusSchema>

export const tinpayOpenRequestSchema = z
  .object({
    sessionId: tinpaySessionIdSchema,
    checkoutUrl: tinpayCheckoutUrlSchema,
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict()
export type TinpayOpenRequest = z.infer<typeof tinpayOpenRequestSchema>

export const tinpayCloseRequestSchema = z.object({ sessionId: tinpaySessionIdSchema }).strict()
export type TinpayCloseRequest = z.infer<typeof tinpayCloseRequestSchema>

export const tinpayOpenResultSchema = z
  .object({
    sessionId: tinpaySessionIdSchema,
    disposition: z.enum(['opened', 'focused']),
  })
  .strict()
export type TinpayOpenResult = z.infer<typeof tinpayOpenResultSchema>

export const tinpayEventNameSchema = z.enum([
  'tinpay.ready',
  'tinpay.recording_started',
  'tinpay.retry_required',
  'tinpay.completed',
  'tinpay.cancelled',
  'tinpay.permission_denied',
  'tinpay.error',
])
export type TinpayEventName = z.infer<typeof tinpayEventNameSchema>

const tinpayEventErrorSchema = z
  .object({
    code: z.string().trim().min(1).max(80),
    message: z.string().trim().min(1).max(500).optional(),
    retryable: z.boolean().optional(),
  })
  .strict()

export const tinpayPageEventSchema = z
  .object({
    version: z.literal('1.0'),
    type: tinpayEventNameSchema,
    sessionId: tinpaySessionIdSchema,
    timestamp: z.iso.datetime({ offset: true }),
    status: tinpaySessionStatusSchema.optional(),
    error: tinpayEventErrorSchema.optional(),
    retryable: z.boolean().optional(),
    message: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
export type TinpayPageEvent = z.infer<typeof tinpayPageEventSchema>

export const tinpayNotificationSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('event'),
      sessionId: tinpaySessionIdSchema,
      event: tinpayPageEventSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('window-closed'),
      sessionId: tinpaySessionIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('permission-denied'),
      sessionId: tinpaySessionIdSchema,
      permission: z.literal('media'),
    })
    .strict(),
  z
    .object({
      type: z.literal('deep-link-result'),
      sessionId: tinpaySessionIdSchema,
    })
    .strict(),
])
export type TinpayNotification = z.infer<typeof tinpayNotificationSchema>

export interface TinpayRendererApi {
  open(input: TinpayOpenRequest): Promise<TinpayOpenResult>
  close(input: TinpayCloseRequest): Promise<void>
  openExternal(input: TinpayCloseRequest): Promise<void>
  onNotification(listener: (notification: TinpayNotification) => void): () => void
}

export interface TinpayHostApi {
  postMessage(message: unknown): void
}

export function parseTinpayUrl(value: string): URL | null {
  if (value.length === 0 || value.length > 4096) return null
  try {
    const authority = value.match(/^https:\/\/([^/?#]+)/)?.[1] ?? ''
    if (authority.includes('@') || authority.includes(':')) return null
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'tinpay.kai.com' ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== '' ||
      url.origin !== TINPAY_ORIGIN
    ) {
      return null
    }
    return url
  } catch {
    return null
  }
}

export function isAllowedTinpayUrl(value: string): boolean {
  return parseTinpayUrl(value) !== null
}
