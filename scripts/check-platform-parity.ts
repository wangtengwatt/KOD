import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseFeatureParityManifest, validateFeatureParity } from '../src/shared/platform-capabilities'

const repositoryRoot = resolve(process.cwd())
const manifestPath = resolve(repositoryRoot, 'docs/android-feature-parity.json')

try {
  const manifest = parseFeatureParityManifest(readFileSync(manifestPath, 'utf8'))
  validateFeatureParity(manifest, {
    fileExists: (path) => existsSync(resolve(repositoryRoot, path)),
  })
  console.log('Platform feature parity manifest is valid.')
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
