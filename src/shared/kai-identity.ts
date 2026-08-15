import type { OAuthCredentials } from './oauth'

export interface KaiIdentityConfig {
  enabled: boolean
  clientId: string
  issuer: string
  authorizationEndpoint: string
  tokenEndpoint: string
  redirectUri: string
  scope: string
}

export interface KaiIdentityLoginResult {
  success: boolean
  credentials?: OAuthCredentials
  error?: string
}

export const KaiIdentityIpcChannels = {
  LOGIN: 'kai-identity:login',
  CANCEL: 'kai-identity:cancel',
} as const
