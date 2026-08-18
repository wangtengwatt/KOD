import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { resolveKodServiceOrigin } from './kod-service-origin'

describe('KOD service build origin contract', () => {
  it('accepts only the public HTTPS KOD origin for production', () => {
    expect(resolveKodServiceOrigin('production', 'https://kod.kai.com')).toBe('https://kod.kai.com')

    for (const origin of [
      'http://kod.kai.com',
      'http://localhost:8080',
      'https://localhost:8080',
      'http://10.0.2.2:8080',
      'https://example.com',
    ]) {
      expect(() => resolveKodServiceOrigin('production', origin), origin).toThrow(/production KOD service origin/i)
    }
  })

  it('accepts only the emulator host for a local-test build', () => {
    expect(resolveKodServiceOrigin('localtest', 'http://10.0.2.2:8080')).toBe('http://10.0.2.2:8080')
    expect(() => resolveKodServiceOrigin('localtest', 'http://localhost:8080')).toThrow(
      /local-test KOD service origin/i
    )
    expect(() => resolveKodServiceOrigin('localtest', 'https://kod.kai.com')).toThrow(/local-test KOD service origin/i)
  })

  it('preserves the explicit desktop dev:local host without weakening production builds', () => {
    expect(resolveKodServiceOrigin('desktop-local', 'http://localhost:8080')).toBe('http://localhost:8080')
    expect(() => resolveKodServiceOrigin('desktop-local', 'http://10.0.2.2:8080')).toThrow(
      /desktop-local KOD service origin/i
    )
    expect(() => resolveKodServiceOrigin('desktop-local', 'https://kod.kai.com')).toThrow(
      /desktop-local KOD service origin/i
    )
  })

  it('pins the executable production and local-test env files to their matching origins', () => {
    const production = readFileSync(resolve(process.cwd(), '.env.production'), 'utf8')
    const localtest = readFileSync(resolve(process.cwd(), '.env.localtest'), 'utf8')

    expect(production).toContain('KOD_SERVICE_ENV=production')
    expect(production).toContain('KOD_API_ORIGIN=https://kod.kai.com')
    expect(production).not.toMatch(/localhost|10\.0\.2\.2|KOD_API_ORIGIN=http:/)
    expect(localtest).toContain('KOD_SERVICE_ENV=localtest')
    expect(localtest).toContain('KOD_API_ORIGIN=http://10.0.2.2:8080')
    expect(localtest).not.toContain('localhost')
  })

  it('does not ship local or cleartext KOD origins in the production renderer bundle', async () => {
    const result = await build({
      entryPoints: [resolve(process.cwd(), 'src/renderer/variables.ts')],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'esm',
      minify: true,
      treeShaking: true,
      alias: {
        '@shared': resolve(process.cwd(), 'src/shared'),
      },
      define: {
        'process.env.KOD_SERVICE_ENV': JSON.stringify('production'),
        'process.env.KOD_API_ORIGIN': JSON.stringify('https://kod.kai.com'),
      },
    })
    const bundle = result.outputFiles.map((file) => file.text).join('\n')

    expect(bundle).toContain('https://kod.kai.com')
    expect(bundle).not.toMatch(/localhost|10\.0\.2\.2|http:\/\//)
  })

  it('rejects an unknown build environment instead of falling back to a local host', () => {
    expect(() => resolveKodServiceOrigin('unexpected' as 'production', 'http://localhost:8080')).toThrow(
      /unknown KOD service environment/i
    )
  })
})
