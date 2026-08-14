import { z } from 'zod'

export const suanbaoPetStateSchema = z.enum([
  'idle',
  'listening',
  'thinking',
  'executing',
  'success',
  'error',
  'reminding',
  'focus',
  'rest',
  'sleeping',
  'peeking',
  'hiding',
])
export type SuanbaoPetState = z.infer<typeof suanbaoPetStateSchema>

export const suanbaoAnimationLevelSchema = z.enum(['full', 'reduced', 'off'])
export type SuanbaoAnimationLevel = z.infer<typeof suanbaoAnimationLevelSchema>

export const suanbaoPlacementSchema = z
  .object({
    mode: z.enum(['in-app', 'desktop']),
    displayId: z.string().trim().min(1).max(128).optional(),
    x: z.number().finite(),
    y: z.number().finite(),
    anchor: z.enum(['free', 'bottom-left', 'bottom-right']),
    scaleFactor: z.number().finite().positive().max(8).optional(),
    locked: z.boolean(),
  })
  .strict()
export type SuanbaoPlacement = z.infer<typeof suanbaoPlacementSchema>

export const suanbaoPlatformCapabilitiesSchema = z
  .object({
    overlay: z.enum(['desktop-window', 'in-app']),
    notifications: z.boolean(),
    backgroundScheduling: z.enum(['reliable', 'foreground-only', 'unavailable']),
    geolocation: z.boolean(),
    systemCalendarRead: z.boolean(),
    reason: z.string().trim().max(160).optional(),
  })
  .strict()
export type SuanbaoPlatformCapabilities = z.infer<typeof suanbaoPlatformCapabilitiesSchema>

export const suanbaoOperationIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)

export const suanbaoOperationPresentationSchema = z
  .object({
    operationId: suanbaoOperationIdSchema,
    phase: z.enum(['awaiting-confirmation', 'running', 'succeeded', 'failed', 'cancelled']),
    kind: z.enum(['todo', 'reminder', 'pomodoro', 'local-calendar-event', 'reminder-delivery']).optional(),
    title: z.string().trim().min(1).max(160).optional(),
    fields: z
      .array(z.object({ label: z.string().max(80), value: z.string().max(240) }).strict())
      .max(12)
      .optional(),
    message: z.string().max(4000).optional(),
    errorCode: z.string().max(120).optional(),
  })
  .strict()
export type SuanbaoOperationPresentation = z.infer<typeof suanbaoOperationPresentationSchema>

export const suanbaoViewModelSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    petState: suanbaoPetStateSchema,
    bubbleOpen: z.boolean(),
    message: z.string().max(4000).optional(),
    operationId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .optional(),
    connection: z.enum(['online', 'offline', 'connecting']),
    updatedAt: z.number().int().nonnegative(),
    operation: suanbaoOperationPresentationSchema.optional(),
  })
  .strict()
export type SuanbaoViewModel = z.infer<typeof suanbaoViewModelSchema>

export const suanbaoWindowLanguageSchema = z.enum(['zh-Hans', 'en'])
export type SuanbaoWindowLanguage = z.infer<typeof suanbaoWindowLanguageSchema>

export const suanbaoBootstrapSchema = z
  .object({
    enabled: z.boolean(),
    visible: z.boolean(),
    language: suanbaoWindowLanguageSchema,
    animation: suanbaoAnimationLevelSchema,
    placement: suanbaoPlacementSchema,
    capabilities: suanbaoPlatformCapabilitiesSchema,
    viewModel: suanbaoViewModelSchema,
  })
  .strict()
export type SuanbaoBootstrap = z.infer<typeof suanbaoBootstrapSchema>

export const suanbaoCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open-bubble') }).strict(),
  z.object({ type: z.literal('close-bubble') }).strict(),
  z.object({ type: z.literal('send-message'), input: z.string().trim().min(1).max(2000) }).strict(),
  z
    .object({
      type: z.literal('navigate'),
      route: z.enum(['home', 'new-chat', 'recent-chat', 'image-creator', 'task-home', 'suanbao-settings']),
    })
    .strict(),
])
export type SuanbaoCommand = z.infer<typeof suanbaoCommandSchema>

export const suanbaoInteractiveRegionSchema = z
  .object({
    interactive: z.boolean(),
  })
  .strict()
export type SuanbaoInteractiveRegion = z.infer<typeof suanbaoInteractiveRegionSchema>

export const suanbaoCommandEnvelopeSchema = z
  .object({
    requestId: z.string().uuid(),
    command: suanbaoCommandSchema,
  })
  .strict()
export type SuanbaoCommandEnvelope = z.infer<typeof suanbaoCommandEnvelopeSchema>

export const suanbaoHostRequestSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('dispatch-command'),
      requestId: z.string().uuid(),
      command: suanbaoCommandSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('confirm-operation'),
      requestId: z.string().uuid(),
      operationId: suanbaoOperationIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('cancel-operation'),
      requestId: z.string().uuid(),
      operationId: suanbaoOperationIdSchema,
    })
    .strict(),
])
export type SuanbaoHostRequest = z.infer<typeof suanbaoHostRequestSchema>

export interface SuanbaoPetWindowApi {
  getBootstrap(): Promise<SuanbaoBootstrap>
  dispatchCommand(command: SuanbaoCommand): Promise<{ accepted: true; requestId: string }>
  confirmOperation(operationId: string): Promise<{ accepted: true }>
  cancelOperation(operationId: string): Promise<{ accepted: true }>
  updatePlacement(placement: SuanbaoPlacement): Promise<SuanbaoPlacement>
  setInteractiveRegion(input: SuanbaoInteractiveRegion): Promise<void>
  hide(): Promise<void>
  minimize(): Promise<void>
  openMainWindow(): Promise<void>
  onViewModelChanged(listener: (viewModel: SuanbaoViewModel) => void): () => void
  onNotificationClicked(listener: (entityId: string) => void): () => void
}

export interface SuanbaoHostBridgeApi {
  publishBootstrap(bootstrap: SuanbaoBootstrap): Promise<SuanbaoBootstrap>
  publishViewModel(viewModel: SuanbaoViewModel): Promise<SuanbaoViewModel>
  onCommand(listener: (request: SuanbaoHostRequest) => void): () => void
}

export type SuanbaoRouteId = 'home' | 'new-chat' | 'recent-chat' | 'image-creator' | 'task-home' | 'suanbao-settings'

export type SuanbaoAnimation = SuanbaoAnimationLevel
export interface SuanbaoPosition {
  x: number
  y: number
}

export interface SuanbaoPreferences {
  schemaVersion: 2
  enabled: boolean
  hidden: boolean
  activeMode: boolean
  soundEnabled: boolean
  animation: SuanbaoAnimation
  locked: boolean
  desktopOverlayEnabled: boolean
  notificationsEnabled: boolean
  locationMode: 'permission' | 'manual' | 'off'
  calendarEnabled: boolean
  doNotDisturb?: { start: string; end: string }
}

// Zod schema mirroring SuanbaoPreferences，供 SettingsSchema 校验/回填默认值（arch §10.1：偏好进 Settings）。
// z.infer 与上方接口结构一致；schemaVersion 用 z.literal(2) 精确匹配接口的字面量类型。
export const suanbaoPreferencesSchema = z.object({
  schemaVersion: z.literal(2).catch(2),
  enabled: z.boolean().catch(false),
  hidden: z.boolean().catch(false),
  activeMode: z.boolean().catch(false),
  soundEnabled: z.boolean().catch(false),
  animation: suanbaoAnimationLevelSchema.catch('full'),
  locked: z.boolean().catch(false),
  desktopOverlayEnabled: z.boolean().catch(false),
  notificationsEnabled: z.boolean().catch(false),
  locationMode: z.enum(['permission', 'manual', 'off']).catch('off'),
  calendarEnabled: z.boolean().catch(false),
  doNotDisturb: z.object({ start: z.string(), end: z.string() }).optional(),
})

export type SuanbaoDomainCommand =
  | { type: 'message'; input: string; locale: string }
  | { type: 'navigate'; route: SuanbaoRouteId }
  | { type: 'set-visibility'; hidden: boolean }
  | { type: 'set-locked'; locked: boolean }
  | { type: 'cancel'; operationId: string }
  | { type: 'confirm'; operationId: string }

export type SuanbaoOperationStatus =
  | 'draft'
  | 'awaiting-confirmation'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export type SuanbaoAction =
  | { kind: 'create-todo'; title: string; dueAt?: number }
  | { kind: 'create-reminder'; title: string; triggerAt: number; timezone: string; recurrence?: 'daily' | 'weekly' }
  | { kind: 'start-pomodoro'; durationMs: number }
  | {
      kind: 'create-local-calendar-event'
      title: string
      startsAt: number
      endsAt: number
      timezone: string
      notes?: string
    }

export interface SuanbaoOperation {
  id: string
  command: SuanbaoDomainCommand
  action?: SuanbaoAction
  idempotencyKey?: string
  status: SuanbaoOperationStatus
  createdAt: number
  updatedAt: number
  resultEntityId?: string
  errorCode?: string
}

export interface SuanbaoConfirmation {
  id: string
  operationId: string
  kind: 'todo' | 'reminder' | 'pomodoro' | 'local-calendar-event'
  title: string
  fields: Array<{ label: string; value: string }>
  idempotencyKey: string
  action: SuanbaoAction
}

export interface SuanbaoActivity {
  state: SuanbaoPetState
  operationId?: string
  message?: string
  confirmation?: SuanbaoConfirmation
}

export interface SuanbaoTodoItem {
  id: string
  title: string
  completed: boolean
  dueAt?: number
  createdAt: number
  updatedAt: number
}

export interface SuanbaoReminder {
  id: string
  title: string
  triggerAt: number
  timezone: string
  recurrence?: 'daily' | 'weekly'
  status: 'scheduled' | 'fired' | 'dismissed' | 'cancelled'
  platformScheduleId?: string
  firedAt?: number
  createdAt: number
  updatedAt: number
  revision: number
}

export interface SuanbaoPomodoroSession {
  id: string
  phase: 'work' | 'short-break' | 'long-break'
  status: 'running' | 'paused' | 'completed' | 'cancelled'
  durationMs: number
  startedAt?: number
  endsAt?: number
  remainingMs?: number
  completedWorkCycles: number
  createdAt: number
  updatedAt: number
  completedAt?: number
  revision: number
}

export interface SuanbaoLocalCalendarEvent {
  id: string
  title: string
  startsAt: number
  endsAt: number
  timezone: string
  notes?: string
  createdAt: number
  updatedAt: number
}

export interface SuanbaoSystemCalendarEvent {
  externalId: string
  calendarName: string
  title: string
  startsAt: number
  endsAt: number
  allDay: boolean
  fetchedAt: number
}

export type SuanbaoWeatherLocation =
  | { type: 'coordinates'; latitude: number; longitude: number; label?: string }
  | { type: 'city'; name: string; countryCode?: string; latitude: number; longitude: number }

export interface SuanbaoWeatherSnapshot {
  location: SuanbaoWeatherLocation
  temperatureCelsius: number
  apparentTemperatureCelsius: number
  weatherCode: number
  fetchedAt: number
}

export type SuanbaoPermissionState = 'granted' | 'denied' | 'prompt' | 'limited' | 'unavailable'

export const MAX_SUANBAO_INPUT_LENGTH = 8_000

export function canTransitionSuanbaoOperation(from: SuanbaoOperationStatus, to: SuanbaoOperationStatus): boolean {
  return (
    (from === 'draft' && (to === 'awaiting-confirmation' || to === 'cancelled')) ||
    (from === 'awaiting-confirmation' && (to === 'running' || to === 'cancelled')) ||
    (from === 'running' && (to === 'succeeded' || to === 'failed' || to === 'cancelled')) ||
    (from === 'failed' && (to === 'running' || to === 'cancelled'))
  )
}

export function isSuanbaoRouteId(value: unknown): value is SuanbaoRouteId {
  return ['home', 'new-chat', 'recent-chat', 'image-creator', 'task-home', 'suanbao-settings'].includes(String(value))
}

export function isValidSuanbaoPosition(value: unknown): value is SuanbaoPosition {
  if (!value || typeof value !== 'object') return false
  const position = value as Partial<SuanbaoPosition>
  return (
    typeof position.x === 'number' &&
    typeof position.y === 'number' &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    position.x >= 0 &&
    position.x <= 1 &&
    position.y >= 0 &&
    position.y <= 1
  )
}

export function isValidSuanbaoDomainCommand(value: unknown): value is SuanbaoDomainCommand {
  if (!value || typeof value !== 'object') return false
  const command = value as Record<string, unknown>
  switch (command.type) {
    case 'message':
      return (
        typeof command.input === 'string' &&
        command.input.trim().length > 0 &&
        command.input.length <= MAX_SUANBAO_INPUT_LENGTH &&
        typeof command.locale === 'string'
      )
    case 'navigate':
      return isSuanbaoRouteId(command.route)
    case 'set-visibility':
      return typeof command.hidden === 'boolean'
    case 'set-locked':
      return typeof command.locked === 'boolean'
    case 'cancel':
    case 'confirm':
      return typeof command.operationId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(command.operationId)
    default:
      return false
  }
}
