import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
    [
      'Unicode-escaped Android emulator API',
      String.raw`const api = "http\u003a\u002f\u002f10\u002e0\u002e2\u002e2\u003a8080/api"`,
      '10.0.2.2',
    ],
    [
      'hex-escaped desktop local API',
      String.raw`const api = "\x68\x74\x74\x70\x3a\x2f\x2f\x6c\x6f\x63\x61\x6c\x68\x6f\x73\x74\x3a8080/api"`,
      'localhost',
    ],
    ['concatenated Android emulator API', 'const api = "http://" + "10.0." + "2.2:8080/api"', '10.0.2.2'],
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

  it.each([
    ['empty directory', undefined],
    ['directory containing only unknown extensions', 'artifact.bin'],
  ])('fails closed for an %s', (_label, unknownFile) => {
    const root = mkdtempSync(join(tmpdir(), 'kod-empty-artifact-'))
    fixtureRoots.push(root)
    if (unknownFile) writeFileSync(join(root, unknownFile), 'http://10.0.2.2:8080', 'utf8')

    expect(() => assertProductionEndpoints([root])).toThrow(/no scannable production artifact/i)
  })

  it('does not follow a directory symlink outside the artifact or into a cycle', () => {
    const root = mkdtempSync(join(tmpdir(), 'kod-symlink-artifact-'))
    fixtureRoots.push(root)
    const bundle = join(root, 'bundle')
    const outside = join(root, 'outside')
    mkdirSync(bundle)
    mkdirSync(outside)
    writeFileSync(join(bundle, 'index.html'), '<p>safe</p>', 'utf8')
    writeFileSync(join(outside, 'leak.js'), 'fetch("http://10.0.2.2:8080/api")', 'utf8')
    symlinkSync(outside, join(bundle, 'outside-link'), 'junction')
    symlinkSync(bundle, join(bundle, 'self-link'), 'junction')

    expect(findForbiddenProductionEndpoints([bundle])).toEqual([])
  })
})
