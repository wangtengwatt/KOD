// 在 webpack.config.base.ts 的 webpack.EnvironmentPlugin 中注册的变量，
// 在编译时 webpack 会根据环境变量替换掉 process.env.XXX

export const CHATBOX_BUILD_TARGET = (process.env.CHATBOX_BUILD_TARGET || 'unknown') as 'unknown' | 'mobile_app'
export const CHATBOX_BUILD_PLATFORM = (process.env.CHATBOX_BUILD_PLATFORM || 'unknown') as
  | 'unknown'
  | 'ios'
  | 'android'
  | 'web'

export const CHATBOX_BUILD_CHANNEL = (process.env.CHATBOX_BUILD_CHANNEL || 'unknown') as 'unknown' | 'google_play'

// api.chatboxai.app
export const USE_LOCAL_API = process.env.USE_LOCAL_API || ''
export const USE_BETA_API = process.env.USE_BETA_API || ''
export const USE_NEWDB_API = process.env.USE_NEWDB_API || ''

// chatboxai.app
export const USE_LOCAL_CHATBOX = process.env.USE_LOCAL_CHATBOX || ''
export const USE_BETA_CHATBOX = process.env.USE_BETA_CHATBOX || ''

// KOD service identity and transport are build contracts, not runtime preferences.
export const KOD_SERVICE_ENV = (process.env.KOD_SERVICE_ENV || 'production') as
  | 'production'
  | 'localtest'
  | 'desktop-local'
export const KOD_API_ORIGIN = process.env.KOD_API_ORIGIN || 'https://kod.kai.com'

export const NODE_ENV = process.env.NODE_ENV || 'development'

export const KOD_PAYMENT_HOSTS = process.env.KOD_PAYMENT_HOSTS || ''
