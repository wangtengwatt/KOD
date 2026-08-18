import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = resolve('scripts/verify-android-build.ps1')
const fixtureRoots: string[] = []

type AndroidEnvironment = 'localtest' | 'production'

function createFixtureApk(
  root: string,
  environment: AndroidEnvironment,
  rendererSource: string,
  options: { label?: string; name?: string } = {},
) {
  const appId = environment === 'localtest' ? 'com.kod.app.localtest' : 'com.kod.app'
  const displayName = options.label ?? (environment === 'localtest' ? 'KOD 本地测试' : 'KOD')
  const capacitor = {
    appId,
    appName: displayName,
    webDir: 'release/app/dist/renderer',
    android: { allowMixedContent: environment === 'localtest' },
    server: {
      androidScheme: environment === 'localtest' ? 'http' : 'https',
      cleartext: environment === 'localtest',
      ...(environment === 'localtest' ? { url: 'http://10.0.2.2:8080' } : {}),
    },
  }
  const zip = new AdmZip()
  zip.addFile(
    'assets/kod-build-environment.json',
    Buffer.from(JSON.stringify({ environment, appId, displayName }), 'utf8'),
  )
  zip.addFile('assets/capacitor.config.json', Buffer.from(JSON.stringify(capacitor), 'utf8'))
  zip.addFile('assets/public/js/app.js', Buffer.from(rendererSource, 'utf8'))
  const apkPath = join(root, options.name ?? `app-${environment}.apk`)
  zip.writeZip(apkPath)
  return { apkPath, appId, displayName }
}

function createFakeAapt(root: string, appId: string, displayName: string, environment: AndroidEnvironment) {
  const versionName = environment === 'localtest' ? '0.1.0-localtest' : '0.1.0'
  const aaptPath = join(root, 'fake-aapt.cmd')
  writeFileSync(
    aaptPath,
    [
      '@echo off',
      `echo package: name='${appId}' versionCode='1' versionName='${versionName}'`,
      `echo application-label:'${displayName}'`,
      'exit /b 0',
      '',
    ].join('\r\n'),
    'utf8',
  )
  return aaptPath
}

function runVerifier(args: string[]) {
  return spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args],
    { encoding: 'utf8' },
  )
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'kod-apk-verifier-'))
  fixtureRoots.push(root)
  return root
}

afterEach(() => {
  while (fixtureRoots.length > 0) rmSync(fixtureRoots.pop()!, { force: true, recursive: true })
})

describe.skipIf(process.platform !== 'win32')('Android APK verification', () => {
  it('discovers the release APK from output-metadata.json instead of assuming a signed filename', () => {
    const root = makeRoot()
    const release = join(root, 'release')
    mkdirSync(release)
    const fixture = createFixtureApk(
      release,
      'production',
      'const KOD_API_ORIGIN="https://kod.kai.com"',
      { name: 'app-release-unsigned.apk' },
    )
    writeFileSync(
      join(release, 'output-metadata.json'),
      JSON.stringify({ variantName: 'release', elements: [{ outputFile: 'app-release-unsigned.apk' }] }),
      'utf8',
    )
    const aapt = createFakeAapt(root, fixture.appId, fixture.displayName, 'production')

    const result = runVerifier(['-Environment', 'production', '-OutputsRoot', root, '-AaptPath', aapt])

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain(fixture.apkPath)
  })

  it.each([
    ['path traversal', [{ outputFile: '..\\outside.apk' }], /outside|escape|metadata/i],
    [
      'multiple outputs',
      [{ outputFile: 'first.apk' }, { outputFile: 'second.apk' }],
      /multiple|ambiguous|exactly one/i,
    ],
  ])('rejects unsafe or ambiguous metadata: %s', (_label, elements, expected) => {
    const root = makeRoot()
    const release = join(root, 'release')
    mkdirSync(release)
    writeFileSync(join(release, 'output-metadata.json'), JSON.stringify({ variantName: 'release', elements }), 'utf8')
    writeFileSync(join(root, 'outside.apk'), 'not an apk', 'utf8')
    writeFileSync(join(release, 'first.apk'), 'not an apk', 'utf8')
    writeFileSync(join(release, 'second.apk'), 'not an apk', 'utf8')

    const result = runVerifier(['-Environment', 'production', '-OutputsRoot', root])

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(expected)
  })

  it.each([
    [
      'production renderer containing an emulator endpoint',
      'production' as const,
      'const KOD_API_ORIGIN="http://10.0.2.2:8080"',
      /10\.0\.2\.2|forbidden/i,
    ],
    [
      'local-test renderer missing its emulator endpoint',
      'localtest' as const,
      'const KOD_API_ORIGIN="https://kod.kai.com"',
      /localtest renderer|production KOD origin/i,
    ],
    [
      'local-test renderer mixing both service origins',
      'localtest' as const,
      'const KOD_API_ORIGIN="http://10.0.2.2:8080"; const KOD_API_ORIGIN_OLD="https://kod.kai.com"',
      /production KOD origin/i,
    ],
  ])('rejects %s', (_label, environment, rendererSource, expected) => {
    const root = makeRoot()
    const fixture = createFixtureApk(root, environment, rendererSource)
    const aapt = createFakeAapt(root, fixture.appId, fixture.displayName, environment)

    const result = runVerifier([
      '-Environment',
      environment,
      '-ApkPath',
      fixture.apkPath,
      '-AaptPath',
      aapt,
    ])

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(expected)
  })

  it('accepts a local-test package whose renderer uses only the emulator service origin', () => {
    const root = makeRoot()
    const fixture = createFixtureApk(root, 'localtest', 'const KOD_API_ORIGIN="http://10.0.2.2:8080"')
    const aapt = createFakeAapt(root, fixture.appId, fixture.displayName, 'localtest')

    const result = runVerifier([
      '-Environment',
      'localtest',
      '-ApkPath',
      fixture.apkPath,
      '-AaptPath',
      aapt,
    ])

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain('Application label: KOD')
  })

  it.each([
    ['aapt label differs from packaged names', 'Wrong label', 'KOD 本地测试', /application-label|label mismatch/i],
    ['all packaged names use lowercase kod', 'kod', 'kod', /uppercase KOD/i],
  ])('rejects identity mismatch: %s', (_label, aaptLabel, packagedLabel, expected) => {
    const root = makeRoot()
    const fixture = createFixtureApk(root, 'localtest', 'const KOD_API_ORIGIN="http://10.0.2.2:8080"', {
      label: packagedLabel,
    })
    const aapt = createFakeAapt(root, fixture.appId, aaptLabel, 'localtest')

    const result = runVerifier([
      '-Environment',
      'localtest',
      '-ApkPath',
      fixture.apkPath,
      '-AaptPath',
      aapt,
    ])

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(expected)
  })
})
