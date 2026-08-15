import { compareVersions } from 'compare-versions'
import platform from '@/platform'
import { KOD_API_ORIGIN } from '@/variables'

export interface AndroidReleaseManifest {
  version: string
  versionCode: number
  apkUrl: string
  sha256: string
  minSdk: number
  publishedAt?: string
  notes?: string
}

const manifestUrl = new URL('/download/android/latest.json', KOD_API_ORIGIN).toString()

export async function checkAndroidUpdate(): Promise<{
  currentVersion: string
  updateAvailable: boolean
  release: AndroidReleaseManifest
}> {
  const currentVersion = await platform.getVersion()
  const response = await fetch(manifestUrl, { cache: 'no-store' })
  if (!response.ok) throw new Error(`检查更新失败（HTTP ${response.status}）`)
  const release = (await response.json()) as Partial<AndroidReleaseManifest>
  if (
    typeof release.version !== 'string' ||
    typeof release.versionCode !== 'number' ||
    typeof release.apkUrl !== 'string' ||
    typeof release.sha256 !== 'string' ||
    typeof release.minSdk !== 'number'
  ) {
    throw new Error('更新信息格式不正确')
  }
  return {
    currentVersion,
    updateAvailable: compareVersions(release.version, currentVersion) > 0,
    release: release as AndroidReleaseManifest,
  }
}

export async function openAndroidUpdate(release: AndroidReleaseManifest) {
  await platform.openLink(release.apkUrl)
}
