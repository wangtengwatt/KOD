import { type TinpaySessionId, tinpaySessionIdSchema } from '@shared/tinpay'
import type { BrowserWindow } from 'electron'
import log from 'electron-log/main'

const MAX_DEEP_LINK_LENGTH = 4096
const ALLOWED_SCHEMES = new Set(['kod:', 'kod-dev:'])

export type DeepLinkAction = { type: 'navigate'; path: string } | { type: 'tinpay-result'; sessionId: TinpaySessionId }

export function isKodDeepLink(value: string): boolean {
  if (value.length === 0 || value.length > MAX_DEEP_LINK_LENGTH) return false
  try {
    return ALLOWED_SCHEMES.has(new URL(value).protocol)
  } catch {
    return false
  }
}

export function findKodDeepLink(args: readonly string[]): string | undefined {
  return args.find(isKodDeepLink)
}

export function parseDeepLink(link: string): DeepLinkAction | null {
  if (!isKodDeepLink(link)) return null

  try {
    const url = new URL(link)
    if (url.username || url.password || url.hash) return null

    if (url.hostname === 'mcp' && url.pathname === '/install') {
      if ([...url.searchParams.keys()].some((key) => key !== 'server')) return null
      const encodedConfig = url.searchParams.get('server')
      if (!encodedConfig || encodedConfig.length > 8192) return null
      return { type: 'navigate', path: `/settings/mcp?install=${encodeURIComponent(encodedConfig)}` }
    }

    if (url.hostname === 'provider' && url.pathname === '/import') {
      if ([...url.searchParams.keys()].some((key) => key !== 'config')) return null
      const encodedConfig = url.searchParams.get('config')
      if (!encodedConfig || encodedConfig.length > 8192) return null
      return { type: 'navigate', path: `/settings/provider?import=${encodeURIComponent(encodedConfig)}` }
    }

    if (url.hostname === 'compute' && url.pathname === '/invite') {
      if ([...url.searchParams.keys()].some((key) => key !== 'code')) return null
      const codeValues = url.searchParams.getAll('code')
      if (codeValues.length !== 1) return null
      const code = codeValues[0]?.trim().toLowerCase()
      if (!code?.match(/^[0-9a-f]{32}$/)) return null
      return { type: 'navigate', path: `/compute-center?invite=${encodeURIComponent(code)}` }
    }

    if (url.hostname === 'tinpay' && url.pathname === '/result') {
      if ([...url.searchParams.keys()].some((key) => !['sessionId', 'callbackState'].includes(key))) return null
      const callbackState = url.searchParams.get('callbackState')
      if (callbackState && callbackState.length > 2048) return null
      const sessionId = tinpaySessionIdSchema.safeParse(url.searchParams.get('sessionId'))
      if (!sessionId.success) return null
      return { type: 'tinpay-result', sessionId: sessionId.data }
    }
  } catch {
    return null
  }

  return null
}

export function handleDeepLink(
  mainWindow: BrowserWindow,
  link: string,
  handlers: { onTinpayResult?: (sessionId: TinpaySessionId) => void } = {}
): boolean {
  const action = parseDeepLink(link)
  if (!action) {
    log.warn('[DeepLink] Rejected malformed or unsupported link.')
    return false
  }

  log.info('[DeepLink] Accepted action.', { type: action.type })
  if (action.type === 'navigate') mainWindow.webContents.send('navigate-to', action.path)
  else handlers.onTinpayResult?.(action.sessionId)
  return true
}
