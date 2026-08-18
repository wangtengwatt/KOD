import { describe, expect, it } from 'vitest'
import {
  parseFeatureParityManifest,
  validateFeatureParity,
  type PlatformFeatureId,
  type PlatformFeatureMapping,
} from './platform-capabilities'

const featureIds: PlatformFeatureId[] = [
  'account.session',
  'chat.relayNodeSelector',
  'chat.historySync',
  'image.generation',
  'video.generation',
  'knowledgeBase',
  'mcp',
  'skills',
  'taskSandbox',
  'wallet',
  'computeCenter',
  'computeAdmin',
]

function createCompleteManifest(): PlatformFeatureMapping[] {
  return featureIds.map((id) => ({
    id,
    windows: 'shared',
    android: 'cloud',
    entrypoints: ['src/renderer/routes/index.tsx'],
    tests: ['src/shared/types.test.ts'],
  }))
}

describe('validateFeatureParity', () => {
  it('rejects a manifest that is not a JSON array', () => {
    expect(() => parseFeatureParityManifest('{"features": []}')).toThrow(
      'Platform feature parity manifest must be an array'
    )
  })

  it('rejects a duplicate feature ID', () => {
    const manifest = createCompleteManifest()
    manifest.push({ ...manifest[0] })

    expect(() => validateFeatureParity(manifest, { fileExists: () => true })).toThrow(
      'Duplicate feature ID: account.session'
    )
  })

  it('rejects a missing Android implementation mapping', () => {
    const manifest = createCompleteManifest()
    manifest[0] = { ...manifest[0], android: undefined as never }

    expect(() => validateFeatureParity(manifest, { fileExists: () => true })).toThrow(
      'Feature account.session must define an Android implementation'
    )
  })

  it('rejects an entrypoint file that does not exist', () => {
    const manifest = createCompleteManifest()
    manifest[0] = { ...manifest[0], entrypoints: ['src/missing-entrypoint.ts'] }

    expect(() => validateFeatureParity(manifest, { fileExists: (path) => path !== 'src/missing-entrypoint.ts' })).toThrow(
      'Feature account.session references missing entrypoint: src/missing-entrypoint.ts'
    )
  })

  it('rejects a feature without automated tests', () => {
    const manifest = createCompleteManifest()
    manifest[0] = { ...manifest[0], tests: [] }

    expect(() => validateFeatureParity(manifest, { fileExists: () => true })).toThrow(
      'Feature account.session must reference at least one test'
    )
  })
})
