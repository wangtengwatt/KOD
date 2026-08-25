import { z } from 'zod'
import { getWalletIdentity, type WalletIdentity } from '@/packages/walletIdentity'
import { authInfoStore } from '@/stores/authInfoStore'
import { computeMarketplaceRequest } from '../computeCenter'

const MAX_SIGNED_LONG = 9_223_372_036_854_775_807n
const DECIMAL_PRECISION = 18
const PRICE_ERROR_DECIMAL_PRECISION = 26

const accountIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,18}$/, { message: 'Expected a positive string identifier' })
  .refine((value) => !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) <= MAX_SIGNED_LONG, {
    message: 'Identifier exceeds signed 64-bit range',
  })

const opaqueIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^\S+$/u, { message: 'Expected a bounded opaque string identifier' })
  .refine(
    (value) =>
      Array.from(value).every((character) => {
        const codePoint = character.codePointAt(0)
        return codePoint !== undefined && codePoint >= 0x20 && codePoint !== 0x7f
      }),
    { message: 'Identifier must not contain control characters' }
  )

const recordIdSchema = accountIdSchema
const dtNsSchema = z.string().regex(/^[0-9]{1,32}$/, { message: 'Expected an ASCII dt_ns integer string' })
const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/, { message: 'Expected a SHA-256 fingerprint' })
const timestampSchema = z.iso.datetime({ offset: true })

function hasValidPrecision(value: string, maximumPrecision: number) {
  return value.replace('-', '').replace('.', '').length <= maximumPrecision
}

function isNegativeZero(value: string) {
  return value.startsWith('-') && /^-0(?:\.0+)?$/.test(value)
}

const unsignedDecimalSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/, { message: 'Expected a non-negative fixed-point string' })
  .refine((value) => hasValidPrecision(value, DECIMAL_PRECISION), { message: 'Decimal exceeds precision 18' })

const positiveDecimalSchema = unsignedDecimalSchema.refine((value) => !/^0(?:\.0+)?$/.test(value), {
  message: 'Expected a positive fixed-point string',
})

const priceErrorDecimalSchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,8})?$/, { message: 'Expected a fixed-point string' })
  .refine((value) => hasValidPrecision(value, PRICE_ERROR_DECIMAL_PRECISION), {
    message: 'Decimal exceeds precision 26',
  })
  .refine((value) => !isNegativeZero(value), { message: 'Negative zero is not canonical' })

const modelSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value.trim() === value && !value.includes('\u0000'), {
    message: 'Model must be bounded text without surrounding whitespace or NUL',
  })

const boundedAnswerSchema = z
  .string()
  .min(1)
  .max(65_536)
  .refine((value) => value.trim() === value && !value.includes('\u0000'), {
    message: 'Answer must be bounded non-empty text',
  })

export const kaiPredictedNextEventSchema = z
  .object({
    dtNs: dtNsSchema,
    event: z.literal('TRADE'),
    side: z.enum(['BUY', 'SELL']),
    price: unsignedDecimalSchema,
    quantity: positiveDecimalSchema,
  })
  .strict()

export const kaiMarketPredictionSchema = z
  .object({
    model: modelSchema,
    text: boundedAnswerSchema,
    nextEvent: kaiPredictedNextEventSchema.nullable(),
  })
  .strict()

const availablePipelineSchema = z
  .object({
    status: z.literal('AVAILABLE'),
    model: modelSchema,
    text: boundedAnswerSchema,
  })
  .strict()

const unavailablePipelineSchema = z
  .object({
    status: z.enum(['INSUFFICIENT_ORDER_BOOK', 'UNAVAILABLE']),
  })
  .strict()

export const kaiMarketPipelineSchema = z.discriminatedUnion('status', [
  availablePipelineSchema,
  unavailablePipelineSchema,
])

export const kaiMarketInferenceSuccessSchema = z
  .object({
    inferenceId: recordIdSchema,
    fingerprint: fingerprintSchema,
    generatedAt: timestampSchema,
    prediction: kaiMarketPredictionSchema,
    pipeline: kaiMarketPipelineSchema.nullable(),
  })
  .strict()

const pendingVerificationSchema = z
  .object({
    status: z.literal('PENDING'),
    inferenceId: recordIdSchema,
  })
  .strict()

const unverifiableVerificationSchema = z
  .object({
    status: z.literal('UNVERIFIABLE'),
    inferenceId: recordIdSchema,
  })
  .strict()

const completedVerificationSchema = z
  .object({
    status: z.enum(['MATCHED', 'MISSED']),
    inferenceId: recordIdSchema,
    actualTradeId: opaqueIdSchema,
    actualSide: z.enum(['BUY', 'SELL']),
    actualPrice: unsignedDecimalSchema,
    actualQuantity: positiveDecimalSchema,
    actualAt: timestampSchema,
    directionMatched: z.boolean(),
    priceError: priceErrorDecimalSchema,
  })
  .strict()

export const kaiMarketVerificationSchema = z.discriminatedUnion('status', [
  pendingVerificationSchema,
  unverifiableVerificationSchema,
  completedVerificationSchema,
])

export const kaiMarketInferenceViewSchema = z
  .object({
    contractId: opaqueIdSchema,
    status: z.enum(['FRESH', 'CACHED', 'UNAVAILABLE']),
    fingerprint: fingerprintSchema.nullable(),
    checkedAt: timestampSchema,
    lastSuccess: kaiMarketInferenceSuccessSchema.nullable(),
    verification: kaiMarketVerificationSchema.nullable(),
  })
  .strict()
  .superRefine((view, context) => {
    if (view.status === 'UNAVAILABLE') return

    if (!view.lastSuccess) {
      context.addIssue({ code: 'custom', message: `${view.status} requires lastSuccess`, path: ['lastSuccess'] })
    }
    if (!view.fingerprint) {
      context.addIssue({ code: 'custom', message: `${view.status} requires fingerprint`, path: ['fingerprint'] })
    }
    if (view.lastSuccess && view.fingerprint && view.lastSuccess.fingerprint !== view.fingerprint) {
      context.addIssue({
        code: 'custom',
        message: `${view.status} fingerprint must match lastSuccess`,
        path: ['fingerprint'],
      })
    }
  })

export type KaiPredictedNextEvent = z.infer<typeof kaiPredictedNextEventSchema>
export type KaiMarketPipeline = z.infer<typeof kaiMarketPipelineSchema>
export type KaiMarketVerification = z.infer<typeof kaiMarketVerificationSchema>
export type KaiMarketInferenceView = z.infer<typeof kaiMarketInferenceViewSchema>

function currentWalletIdentity() {
  const { accountId, loginEmail, accessToken, refreshToken } = authInfoStore.getState()
  return getWalletIdentity(accountId, loginEmail, accessToken, refreshToken)
}

function captureCurrentIdentity(identity: WalletIdentity) {
  if (currentWalletIdentity() !== identity) throw new Error('账户已切换，已取消旧账户操作')
  return identity
}

function requireCurrentIdentity(identity: WalletIdentity) {
  if (currentWalletIdentity() !== identity) throw new Error('账户已切换，已取消旧账户操作')
}

async function requestKaiMarketInference(
  contractId: string,
  identity: WalletIdentity,
  refresh: boolean,
  signal?: AbortSignal
) {
  const parsedContractId = opaqueIdSchema.parse(contractId)
  const ownerIdentity = captureCurrentIdentity(identity)
  const encodedContractId = encodeURIComponent(parsedContractId)
  const path = refresh
    ? `/api/compute/market/inference/refresh?contractId=${encodedContractId}`
    : `/api/compute/market/inference?contractId=${encodedContractId}`
  const response = refresh
    ? await computeMarketplaceRequest<unknown>(path, { method: 'POST', signal, timeout: 15_000 })
    : await computeMarketplaceRequest<unknown>(path, { signal, timeout: 15_000 })

  requireCurrentIdentity(ownerIdentity)
  const view = kaiMarketInferenceViewSchema.parse(response)
  if (view.contractId !== parsedContractId) throw new Error('推理响应合约不匹配')
  return view
}

export function getKaiMarketInference(
  contractId: string,
  identity: WalletIdentity,
  signal?: AbortSignal
): Promise<KaiMarketInferenceView> {
  return requestKaiMarketInference(contractId, identity, false, signal)
}

export function refreshKaiMarketInference(
  contractId: string,
  identity: WalletIdentity,
  signal?: AbortSignal
): Promise<KaiMarketInferenceView> {
  return requestKaiMarketInference(contractId, identity, true, signal)
}
