import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
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
  if (!statSync(absolutePath).isDirectory()) return [absolutePath]
  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) =>
    listTextArtifacts(resolve(absolutePath, entry.name)),
  )
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
  const text = original.replaceAll('\\/', '/')
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

export function findForbiddenProductionEndpoints(paths: string[]): ForbiddenProductionEndpoint[] {
  if (paths.length === 0) throw new Error('At least one production artifact path is required')
  return paths.flatMap(listTextArtifacts).flatMap(inspectArtifact)
}

export function assertProductionEndpoints(paths: string[]): void {
  const issues = findForbiddenProductionEndpoints(paths)
  if (issues.length === 0) return
  const details = issues
    .map((issue) => `${issue.file}:${issue.line}:${issue.column} ${issue.reason}: ${issue.url}`)
    .join('\n')
  throw new Error(`Production artifacts contain forbidden service endpoints:\n${details}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = process.argv.slice(2)
  try {
    assertProductionEndpoints(paths)
    process.stdout.write(`Production endpoint scan passed for ${paths.length} artifact path(s).\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
