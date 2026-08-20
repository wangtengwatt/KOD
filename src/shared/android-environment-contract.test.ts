import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadCapacitorConfig(environment: string) {
  vi.resetModules()
  vi.stubEnv('KOD_ANDROID_ENV', environment)
  return (await import('../../capacitor.config')).default
}

describe('Android environment contract', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('emits an HTTPS-only production identity', async () => {
    const config = await loadCapacitorConfig('production')

    expect(config).toMatchObject({
      appId: 'com.kod.app',
      appName: 'KOD',
      android: { allowMixedContent: false },
      server: { androidScheme: 'https', cleartext: false },
    })
    expect(config.server?.url).toBeUndefined()
  })

  it('emits the visibly distinct local-test identity without replacing the bundled renderer URL', async () => {
    const config = await loadCapacitorConfig('localtest')

    expect(config).toMatchObject({
      appId: 'com.kod.app.localtest',
      appName: 'KOD 本地测试',
      android: { allowMixedContent: true },
      server: {
        androidScheme: 'http',
        cleartext: true,
      },
    })
    expect(config.server?.url).toBeUndefined()
  })

  it('rejects unknown environment values instead of silently producing a mixed build', async () => {
    await expect(loadCapacitorConfig('staging')).rejects.toThrow('KOD_ANDROID_ENV must be production or localtest')
  })

  it('accepts only matching synchronized config and marker pairs for each Gradle variant', async () => {
    const verifier = await vi
      .importActual<Record<string, unknown>>('../../scripts/verify-android-environment.mjs')
      .catch(() => null)
    expect(verifier, 'the executable Android variant verifier must exist').not.toBeNull()
    if (!verifier) return

    const productionConfig = await loadCapacitorConfig('production')
    const localConfig = await loadCapacitorConfig('localtest')
    const verify = verifier.verifyAndroidBuildEnvironment as (variant: string, config: unknown, marker: unknown) => void

    expect(() =>
      verify('release', productionConfig, {
        environment: 'production',
        appId: 'com.kod.app',
        displayName: 'KOD',
      })
    ).not.toThrow()
    expect(() =>
      verify('debug', localConfig, {
        environment: 'localtest',
        appId: 'com.kod.app.localtest',
        displayName: 'KOD 本地测试',
      })
    ).not.toThrow()

    expect(() =>
      verify('release', localConfig, {
        environment: 'localtest',
        appId: 'com.kod.app.localtest',
        displayName: 'KOD 本地测试',
      })
    ).toThrow(/release.*production/i)
    expect(() =>
      verify('debug', productionConfig, {
        environment: 'production',
        appId: 'com.kod.app',
        displayName: 'KOD',
      })
    ).toThrow(/debug.*localtest/i)

    expect(() =>
      verify(
        'release',
        { ...productionConfig, server: { ...productionConfig.server, url: 'https://example.com' } },
        {
          environment: 'production',
          appId: 'com.kod.app',
          displayName: 'KOD',
        }
      )
    ).toThrow(/Capacitor server URL/i)
    expect(() =>
      verify(
        'debug',
        { ...localConfig, server: { ...localConfig.server, url: 'http://10.0.2.2:8080' } },
        {
          environment: 'localtest',
          appId: 'com.kod.app.localtest',
          displayName: 'KOD 鏈湴娴嬭瘯',
        }
      )
    ).toThrow(/Capacitor server URL/i)
  })
})
