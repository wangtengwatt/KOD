import { describe, expect, it } from 'vitest'
import { resolveKodApiOrigin } from './kodApiOrigin'

describe('resolveKodApiOrigin', () => {
  it('uses the configured KOD backend in development unless local mode is explicitly enabled', () => {
    expect(
      resolveKodApiOrigin({
        configuredOrigin: 'https://kod.kai.com',
        nodeEnv: 'development',
        useLocalApi: '',
      })
    ).toBe('https://kod.kai.com')
  })

  it('keeps every KOD request on localhost when local mode is explicitly enabled', () => {
    expect(
      resolveKodApiOrigin({
        configuredOrigin: 'https://kod.kai.com',
        nodeEnv: 'development',
        useLocalApi: 'true',
      })
    ).toBe('http://localhost:8080')
  })

  it.each(['false', '0', 'off', 'no', ' FALSE '])(
    'does not enable localhost for the false-like flag %j',
    (useLocalApi) => {
      expect(
        resolveKodApiOrigin({
          configuredOrigin: 'https://kod.kai.com',
          nodeEnv: 'development',
          useLocalApi,
        })
      ).toBe('https://kod.kai.com')
    }
  )
})
