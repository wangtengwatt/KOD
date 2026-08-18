export const PLATFORM_FEATURE_IDS = [
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
] as const

export type PlatformFeatureId = (typeof PLATFORM_FEATURE_IDS)[number]

export type FeatureImplementation = 'shared' | 'native' | 'cloud'

export interface PlatformFeatureMapping {
  id: PlatformFeatureId
  windows: FeatureImplementation
  android: FeatureImplementation
  entrypoints: string[]
  tests: string[]
}

export interface FeatureParityValidationOptions {
  fileExists?: (path: string) => boolean
}

const featureImplementations = new Set<FeatureImplementation>(['shared', 'native', 'cloud'])
const featureIds = new Set<string>(PLATFORM_FEATURE_IDS)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFeatureImplementation(value: unknown): value is FeatureImplementation {
  return typeof value === 'string' && featureImplementations.has(value as FeatureImplementation)
}

function isRepositoryRelativePath(path: string): boolean {
  return (
    !path.startsWith('/') &&
    !path.startsWith('\\') &&
    !/^[a-zA-Z]:[\\/]/.test(path) &&
    !path.includes('\\') &&
    path.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
  )
}

function isSourceEntrypointPath(path: string): boolean {
  return path.startsWith('src/') && /\.(ts|tsx)$/.test(path) && !/\.(test|spec)\.(ts|tsx)$/.test(path)
}

function isTestPath(path: string): boolean {
  return (path.startsWith('src/') || path.startsWith('test/')) && /\.(test|spec)\.(ts|tsx)$/.test(path)
}

function validateFileList(
  featureId: string,
  field: 'entrypoints' | 'tests',
  value: unknown,
  fileExists: (path: string) => boolean
): void {
  if (!Array.isArray(value) || value.length === 0) {
    const label = field === 'tests' ? 'test' : 'entrypoint'
    throw new Error(`Feature ${featureId} must reference at least one ${label}`)
  }

  for (const path of value) {
    if (typeof path !== 'string' || path.length === 0) {
      throw new Error(`Feature ${featureId} has an invalid ${field} path`)
    }

    const label = field === 'tests' ? 'test' : 'entrypoint'
    if (!isRepositoryRelativePath(path)) {
      throw new Error(`Feature ${featureId} must use a repository-relative ${label} path: ${path}`)
    }

    if (field === 'entrypoints' && !isSourceEntrypointPath(path)) {
      throw new Error(`Feature ${featureId} must reference a source entrypoint: ${path}`)
    }

    if (field === 'tests' && !isTestPath(path)) {
      throw new Error(`Feature ${featureId} must reference a test file: ${path}`)
    }

    if (!fileExists(path)) {
      throw new Error(`Feature ${featureId} references missing ${label}: ${path}`)
    }
  }
}

export function parseFeatureParityManifest(manifestJson: string): PlatformFeatureMapping[] {
  let manifest: unknown

  try {
    manifest = JSON.parse(manifestJson)
  } catch {
    throw new Error('Platform feature parity manifest must be valid JSON')
  }

  if (!Array.isArray(manifest)) {
    throw new Error('Platform feature parity manifest must be an array')
  }

  return manifest as PlatformFeatureMapping[]
}

export function validateFeatureParity(
  manifest: unknown,
  { fileExists = () => true }: FeatureParityValidationOptions = {}
): asserts manifest is PlatformFeatureMapping[] {
  if (!Array.isArray(manifest)) {
    throw new Error('Platform feature parity manifest must be an array')
  }

  const seenIds = new Set<string>()

  for (const mapping of manifest) {
    if (!isRecord(mapping) || typeof mapping.id !== 'string' || !featureIds.has(mapping.id)) {
      throw new Error('Every feature mapping must use a known feature ID')
    }

    if (seenIds.has(mapping.id)) {
      throw new Error(`Duplicate feature ID: ${mapping.id}`)
    }
    seenIds.add(mapping.id)

    if (!isFeatureImplementation(mapping.windows)) {
      throw new Error(`Feature ${mapping.id} must define a Windows implementation`)
    }

    if (!isFeatureImplementation(mapping.android)) {
      throw new Error(`Feature ${mapping.id} must define an Android implementation`)
    }

    validateFileList(mapping.id, 'entrypoints', mapping.entrypoints, fileExists)
    validateFileList(mapping.id, 'tests', mapping.tests, fileExists)
  }

  const missingIds = PLATFORM_FEATURE_IDS.filter((id) => !seenIds.has(id))
  if (missingIds.length > 0) {
    throw new Error(`Manifest is missing required feature IDs: ${missingIds.join(', ')}`)
  }
}
