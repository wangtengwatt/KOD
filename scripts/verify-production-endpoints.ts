import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface ForbiddenProductionEndpoint {
  file: string
  line: number
  column: number
  url: string
  reason: string
}

const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.map', '.mjs', '.cjs', '.txt'])

function listTextArtifacts(path: string): string[] {
  const absolutePath = resolve(path)
  if (!existsSync(absolutePath)) throw new Error(`Production artifact path does not exist: ${absolutePath}`)
  const stats = lstatSync(absolutePath)
  if (stats.isSymbolicLink()) return []
  if (!stats.isDirectory()) return TEXT_EXTENSIONS.has(extname(absolutePath).toLowerCase()) ? [absolutePath] : []
  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) return []
    return listTextArtifacts(resolve(absolutePath, entry.name))
  })
}

function decodeAsciiEscape(codePoint: string): string {
  const value = Number.parseInt(codePoint, 16)
  return Number.isFinite(value) && value <= 0x7f ? String.fromCodePoint(value) : `\\u${codePoint}`
}

function normalizeBundledSource(source: string): string {
  let normalized = source
    .replace(/\\u\{([0-9a-f]{1,6})\}/gi, (_match, codePoint: string) => decodeAsciiEscape(codePoint))
    .replace(/\\u([0-9a-f]{4})/gi, (_match, codePoint: string) => decodeAsciiEscape(codePoint))
    .replace(/\\x([0-9a-f]{2})/gi, (_match, codePoint: string) => decodeAsciiEscape(codePoint))
    .replaceAll('\\/', '/')

  for (;;) {
    const folded = normalized.replace(
      /(["'])([^"']*)\1\s*\+\s*(["'])([^"']*)\3/g,
      (_match, quote: string, left: string, _rightQuote: string, right: string) => `${quote}${left}${right}${quote}`,
    )
    if (folded === normalized) return normalized
    normalized = folded
  }
}

function endpointReason(rawUrl: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }

  const hostname = parsed.hostname.toLowerCase()
  const path = parsed.pathname.toLowerCase()
  if (hostname === '10.0.2.2') return '10.0.2.2 Android emulator endpoint'
  if (hostname === 'localhost') {
    return parsed.port === '8080' ? 'localhost service endpoint' : null
  }
  if (hostname === '127.0.0.1' || hostname === '[::1]') return null
  if (parsed.protocol !== 'http:') return null
  if (
    hostname === 'kai.com' ||
    hostname.endsWith('.kai.com') ||
    path.startsWith('/api') ||
    path.includes('/wallet')
  ) {
    return 'cleartext HTTP service endpoint'
  }
  return null
}

function positionAt(text: string, index: number) {
  const before = text.slice(0, index)
  const lines = before.split('\n')
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 }
}

function inspectArtifact(file: string): ForbiddenProductionEndpoint[] {
  if (!TEXT_EXTENSIONS.has(extname(file).toLowerCase())) return []
  const original = readFileSync(file, 'utf8')
  if (original.includes('\0')) return []
  const text = normalizeBundledSource(original)
  const issues: ForbiddenProductionEndpoint[] = []
  for (const match of text.matchAll(/https?:\/\/[^\s"'<>`\\]+/gi)) {
    const index = match.index ?? 0
    const rawUrl = match[0].replace(/[),.;\]}]+$/g, '')
    const reason = endpointReason(rawUrl)
    if (!reason) continue
    const { line, column } = positionAt(text, index)
    issues.push({ file: resolve(file), line, column, url: rawUrl, reason })
  }
  return issues
}

function listScannableArtifacts(paths: string[]): string[] {
  if (paths.length === 0) throw new Error('At least one production artifact path is required')
  return paths.flatMap((path) => {
    const artifacts = listTextArtifacts(path)
    if (artifacts.length === 0) {
      throw new Error(`No scannable production artifact was found under: ${resolve(path)}`)
    }
    return artifacts
  })
}

export function findForbiddenProductionEndpoints(paths: string[]): ForbiddenProductionEndpoint[] {
  return listScannableArtifacts(paths).flatMap(inspectArtifact)
}

export function assertProductionEndpoints(paths: string[]): void {
  const issues = findForbiddenProductionEndpoints(paths)
  if (issues.length === 0) return
  const details = issues
    .map((issue) => `${issue.file}:${issue.line}:${issue.column} ${issue.reason}: ${issue.url}`)
    .join('\n')
  throw new Error(`Production artifacts contain forbidden service endpoints:\n${details}`)
}

export function findKodServiceOrigins(paths: string[]): string[] {
  const origins = listScannableArtifacts(paths).flatMap((file) => {
    const source = normalizeBundledSource(readFileSync(file, 'utf8'))
    return [...source.matchAll(/KOD_API_ORIGIN[\w$]*\s*=\s*["'](https?:\/\/[^"']+)["']/g)].map(
      (match) => match[1],
    )
  })
  return [...new Set(origins)].sort()
}

export function assertAndroidRendererServiceOrigin(
  paths: string[],
  environment: 'localtest' | 'production',
): void {
  const expected = environment === 'localtest' ? 'http://10.0.2.2:8080' : 'https://kod.kai.com'
  const origins = findKodServiceOrigins(paths)
  if (environment === 'localtest' && origins.includes('https://kod.kai.com')) {
    throw new Error('localtest renderer contains the production KOD origin')
  }
  if (origins.length !== 1 || origins[0] !== expected) {
    throw new Error(
      `${environment} renderer KOD service origin mismatch: expected only ${expected}, received ${origins.join(', ') || 'none'}`,
    )
  }
  if (environment === 'production') assertProductionEndpoints(paths)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  try {
    if (args[0] === '--expect-kod-origin') {
      const environment = args[1]
      if (environment !== 'localtest' && environment !== 'production') {
        throw new Error('--expect-kod-origin requires localtest or production')
      }
      const paths = args.slice(2)
      assertAndroidRendererServiceOrigin(paths, environment)
      process.stdout.write(`Android ${environment} renderer service-origin scan passed.\n`)
    } else {
      assertProductionEndpoints(args)
      process.stdout.write(`Production endpoint scan passed for ${args.length} artifact path(s).\n`)
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
