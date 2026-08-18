import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = resolve('scripts/verify-ci-toolchain.ps1')
const fixtureRoots: string[] = []

function createSdk() {
  const root = mkdtempSync(join(tmpdir(), 'kod-ci-sdk-'))
  fixtureRoots.push(root)
  mkdirSync(join(root, 'platforms', 'android-35'), { recursive: true })
  mkdirSync(join(root, 'build-tools', '35.0.0'), { recursive: true })
  return root
}

function runVerifier(sdkRoot: string, nodeVersion = '22.23.2', javaVersion = '21.0.8') {
  return spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-SdkRoot',
      sdkRoot,
      '-NodeVersion',
      nodeVersion,
      '-JavaVersion',
      javaVersion,
    ],
    { encoding: 'utf8' },
  )
}

afterEach(() => {
  while (fixtureRoots.length > 0) rmSync(fixtureRoots.pop()!, { force: true, recursive: true })
})

describe.skipIf(process.platform !== 'win32')('CI toolchain verification', () => {
  it('accepts exactly Node 22, Java 21, Android platform 35, and build-tools 35.0.0', () => {
    const result = runVerifier(createSdk())

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain('Node.js 22.23.2')
    expect(result.stdout).toContain('Java 21.0.8')
    expect(result.stdout).toContain('Android platform android-35')
    expect(result.stdout).toContain('Android build-tools 35.0.0')
  })

  it.each([
    ['Node.js', '23.0.0', '21.0.8', /Node\.js 22 required.*23\.0\.0/i],
    ['Java', '22.23.2', '17.0.12', /Java 21 required.*17\.0\.12/i],
  ])('diagnoses an unsupported %s major version', (_label, nodeVersion, javaVersion, expected) => {
    const result = runVerifier(createSdk(), nodeVersion, javaVersion)

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(expected)
  })

  it.each([
    ['platforms\\android-35', /Android SDK platform missing.*android-35/i],
    ['build-tools\\35.0.0', /Android SDK build-tools missing.*35\.0\.0/i],
  ])('diagnoses a missing Android SDK component: %s', (relativePath, expected) => {
    const sdk = createSdk()
    rmSync(join(sdk, relativePath), { recursive: true })

    const result = runVerifier(sdk)

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(expected)
  })
})
