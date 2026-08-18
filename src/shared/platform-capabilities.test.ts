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

  it('rejects an absolute entrypoint path', () => {
    const manifest = createCompleteManifest()
    manifest[0] = { ...manifest[0], entrypoints: ['C:/outside-repository.ts'] }

    expect(() => validateFeatureParity(manifest, { fileExists: () => true })).toThrow(
      'Feature account.session must use a repository-relative entrypoint path: C:/outside-repository.ts'
    )
  })

  it('rejects traversal in a test path', () => {
    const manifest = createCompleteManifest()
    manifest[0] = { ...manifest[0], tests: ['src/shared/../outside.test.ts'] }

    expect(() => validateFeatureParity(manifest, { fileExists: () => true })).toThrow(
      'Feature account.session must use a repository-relative test path: src/shared/../outside.test.ts'
    )
  })

  it('rejects an entrypoint outside source roots or with a non-source extension', () => {
    const manifest = createCompleteManifest()
    manifest[0] = { ...manifest[0], entrypoints: ['docs/entrypoint.ts'] }

    expect(() => validateFeatureParity(manifest, { fileExists: () => true })).toThrow(
      'Feature account.session must reference a source entrypoint: docs/entrypoint.ts'
    )

    manifest[0] = { ...manifest[0], entrypoints: ['src/renderer/entrypoint.json'] }
    expect(() => validateFeatureParity(manifest, { fileExists: () => true })).toThrow(
      'Feature account.session must reference a source entrypoint: src/renderer/entrypoint.json'
    )
  })

  it('rejects a test outside test roots or without a test filename', () => {
    const manifest = createCompleteManifest()
    manifest[0] = { ...manifest[0], tests: ['docs/entrypoint.test.ts'] }

    expect(() => validateFeatureParity(manifest, { fileExists: () => true })).toThrow(
      'Feature account.session must reference a test file: docs/entrypoint.test.ts'
    )

    manifest[0] = { ...manifest[0], tests: ['src/renderer/entrypoint.ts'] }
    expect(() => validateFeatureParity(manifest, { fileExists: () => true })).toThrow(
      'Feature account.session must reference a test file: src/renderer/entrypoint.ts'
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
