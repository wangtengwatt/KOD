import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const environments = {
  production: {
    variant: 'release',
    appId: 'com.kod.app',
    displayName: 'KOD',
    androidScheme: 'https',
    cleartext: false,
    allowMixedContent: false,
    url: undefined,
  },
  localtest: {
    variant: 'debug',
    appId: 'com.kod.app.localtest',
    displayName: 'KOD 本地测试',
    androidScheme: 'http',
    cleartext: true,
    allowMixedContent: true,
    url: 'http://10.0.2.2:8080',
  },
}

export function verifyAndroidBuildEnvironment(variant, capacitorConfig, marker) {
  const expectedEnvironment = variant === 'release' ? 'production' : variant === 'debug' ? 'localtest' : null
  if (!expectedEnvironment) throw new Error(`Unsupported Android variant: ${variant}`)

  const expected = environments[expectedEnvironment]
  if (marker?.environment !== expectedEnvironment) {
    throw new Error(`${variant} builds require the ${expectedEnvironment} synchronized environment marker`)
  }

  const actual = {
    appId: capacitorConfig?.appId,
    displayName: capacitorConfig?.appName,
    androidScheme: capacitorConfig?.server?.androidScheme,
    cleartext: capacitorConfig?.server?.cleartext,
    allowMixedContent: capacitorConfig?.android?.allowMixedContent,
    url: capacitorConfig?.server?.url,
  }
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'variant') continue
    if (actual[key] !== value) {
      throw new Error(`${variant} ${key} mismatch: expected ${String(value)}, received ${String(actual[key])}`)
    }
  }

  if (marker.appId !== expected.appId || marker.displayName !== expected.displayName) {
    throw new Error(`${variant} marker identity does not match ${expectedEnvironment}`)
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [variant, capacitorConfigPath, markerPath] = process.argv.slice(2)
  try {
    verifyAndroidBuildEnvironment(variant, readJson(capacitorConfigPath), readJson(markerPath))
    process.stdout.write(`Android ${variant} environment contract passed.\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
