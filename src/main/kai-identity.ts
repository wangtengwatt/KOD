import { ipcMain, shell } from 'electron'
import log from 'electron-log/main'
import type { KaiIdentityConfig, KaiIdentityLoginResult } from '../shared/kai-identity'
import { KaiIdentityIpcChannels } from '../shared/kai-identity'
import { createCallbackServer } from './oauth/callback-server'
import { generatePKCE, generateState } from './oauth/pkce'

const CALLBACK_HOST = '127.0.0.1'
const CALLBACK_PORT = 1456
const CALLBACK_URI = `http://${CALLBACK_HOST}:${CALLBACK_PORT}/auth/callback`

let activeController: AbortController | undefined

function parseConfig(json: string): KaiIdentityConfig {
  const parsed: unknown = JSON.parse(json)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('KAI Identity 配置无效')
  }
  const value = parsed as Record<string, unknown>
  const required = ['clientId', 'issuer', 'authorizationEndpoint', 'tokenEndpoint', 'redirectUri', 'scope'] as const
  for (const key of required) {
    if (typeof value[key] !== 'string' || !(value[key] as string).trim()) {
      throw new Error(`KAI Identity 配置缺少 ${key}`)
    }
  }
  if (value.enabled !== true) {
    throw new Error('KAI 统一登录尚未启用')
  }
  if (value.redirectUri !== CALLBACK_URI) {
    throw new Error(`KAI Identity 回调地址必须为 ${CALLBACK_URI}`)
  }
  for (const key of ['issuer', 'authorizationEndpoint', 'tokenEndpoint'] as const) {
    const url = new URL(value[key] as string)
    if (url.protocol !== 'https:') {
      throw new Error(`KAI Identity ${key} 必须使用 HTTPS`)
    }
  }
  return value as unknown as KaiIdentityConfig
}

export function buildKaiIdentityAuthorizationUrl(config: KaiIdentityConfig, state: string, challenge: string): string {
  const authUrl = new URL(config.authorizationEndpoint)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', config.clientId)
  authUrl.searchParams.set('redirect_uri', config.redirectUri)
  authUrl.searchParams.set('scope', config.scope)
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state', state)
  return authUrl.toString()
}

async function exchangeCode(config: KaiIdentityConfig, code: string, verifier: string) {
  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code,
      code_verifier: verifier,
      redirect_uri: config.redirectUri,
    }),
  })
  if (!response.ok) {
    const body = await response.text()
    log.error(`[KAI Identity] Token exchange failed (${response.status}): ${body}`)
    throw new Error(`KAI Identity 令牌交换失败（${response.status}）`)
  }
  const data = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    id_token?: string
  }
  if (!data.access_token) {
    throw new Error('KAI Identity 未返回 access_token')
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: typeof data.expires_in === 'number' ? Date.now() + data.expires_in * 1000 : undefined,
    extra: data.id_token ? { idToken: data.id_token } : undefined,
  }
}

async function login(config: KaiIdentityConfig, signal: AbortSignal) {
  const { verifier, challenge } = generatePKCE()
  const state = generateState()
  const callback = createCallbackServer(CALLBACK_PORT, signal, CALLBACK_HOST)
  try {
    await shell.openExternal(buildKaiIdentityAuthorizationUrl(config, state, challenge))
    const result = await callback.promise
    if (result.state !== state) {
      throw new Error('KAI Identity OAuth state 校验失败')
    }
    return await exchangeCode(config, result.code, verifier)
  } finally {
    callback.close()
  }
}

export function registerKaiIdentityHandlers(): void {
  ipcMain.handle(KaiIdentityIpcChannels.LOGIN, async (_event, configJson: string): Promise<string> => {
    activeController?.abort()
    activeController = new AbortController()
    const controller = activeController
    try {
      const config = parseConfig(configJson)
      const credentials = await login(config, controller.signal)
      return JSON.stringify({ success: true, credentials } satisfies KaiIdentityLoginResult)
    } catch (error) {
      const message = controller.signal.aborted
        ? 'KAI Identity 登录已取消'
        : error instanceof Error
          ? error.message
          : String(error)
      return JSON.stringify({ success: false, error: message } satisfies KaiIdentityLoginResult)
    } finally {
      if (activeController === controller) {
        activeController = undefined
      }
    }
  })

  ipcMain.handle(KaiIdentityIpcChannels.CANCEL, (): string => {
    activeController?.abort()
    activeController = undefined
    return JSON.stringify({ success: true } satisfies KaiIdentityLoginResult)
  })
}
