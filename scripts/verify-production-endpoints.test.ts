import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertProductionEndpoints, findForbiddenProductionEndpoints } from './verify-production-endpoints'

const fixtureRoots: string[] = []

function writeBundle(contents: string, name = 'app.js') {
  const root = mkdtempSync(join(tmpdir(), 'kod-production-endpoints-'))
  fixtureRoots.push(root)
  const bundle = join(root, 'dist')
  mkdirSync(bundle)
  writeFileSync(join(bundle, name), contents, 'utf8')
  return bundle
}

afterEach(() => {
  while (fixtureRoots.length > 0) {
    rmSync(fixtureRoots.pop()!, { force: true, recursive: true })
  }
})

describe('production endpoint verification', () => {
  it.each([
    ['desktop local API', 'const apiOrigin = "http://localhost:8080/api"', 'localhost'],
    ['Android emulator API', 'fetch("http:\\/\\/10.0.2.2:8080/api/auth/login")', '10.0.2.2'],
    ['cleartext wallet', 'const walletUrl = "http://kod.kai.com/console/wallet"', 'cleartext'],
  ])('rejects a %s endpoint embedded in a production bundle', (_label, contents, reason) => {
    const issues = findForbiddenProductionEndpoints([writeBundle(contents)])

    expect(issues).toHaveLength(1)
    expect(issues[0]?.reason).toContain(reason)
  })

  it('accepts ordinary HTTP prose, standard namespaces, legal HTTPS, and unrelated local model defaults', () => {
    const bundle = writeBundle(`
      <svg xmlns="http://www.w3.org/2000/svg"></svg>
      <p>HTTP endpoints are forbidden for the KOD production service.</p>
      <script>
        const apiOrigin = "https://kod.kai.com";
        const localModelProvider = "http://127.0.0.1:11434/api/generate";
        const alternateLocalProvider = "http://localhost:1234/api/v1/models";
      </script>
    `, 'index.html')

    expect(findForbiddenProductionEndpoints([bundle])).toEqual([])
    expect(() => assertProductionEndpoints([bundle])).not.toThrow()
  })

  it('fails closed when an expected production artifact path is absent', () => {
    const missing = join(mkdtempSync(join(tmpdir(), 'kod-missing-artifact-')), 'not-built')
    fixtureRoots.push(join(missing, '..'))

    expect(() => assertProductionEndpoints([missing])).toThrow(/does not exist/i)
  })
})
