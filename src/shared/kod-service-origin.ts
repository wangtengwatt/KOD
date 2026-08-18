export type KodServiceEnvironment = 'production' | 'localtest' | 'desktop-local'

export const KOD_PRODUCTION_ORIGIN = 'https://kod.kai.com'
export const KOD_LOCALTEST_ORIGIN = 'http://10.0.2.2:8080'
export const KOD_DESKTOP_LOCAL_ORIGIN = 'http://localhost:8080'

export function resolveKodServiceOrigin(environment: KodServiceEnvironment, configuredOrigin: string) {
  if (environment !== 'production' && environment !== 'localtest' && environment !== 'desktop-local') {
    throw new Error(`Unknown KOD service environment: ${String(environment)}`)
  }
  const origin = new URL(configuredOrigin).origin
  if (environment === 'production') {
    if (origin !== KOD_PRODUCTION_ORIGIN) {
      throw new Error(`Invalid production KOD service origin: ${configuredOrigin}`)
    }
    return KOD_PRODUCTION_ORIGIN
  }
  if (environment === 'localtest' && origin !== KOD_LOCALTEST_ORIGIN) {
    throw new Error(`Invalid local-test KOD service origin: ${configuredOrigin}`)
  }
  if (environment === 'desktop-local' && origin !== KOD_DESKTOP_LOCAL_ORIGIN) {
    throw new Error(`Invalid desktop-local KOD service origin: ${configuredOrigin}`)
  }
  return environment === 'localtest' ? KOD_LOCALTEST_ORIGIN : KOD_DESKTOP_LOCAL_ORIGIN
}
