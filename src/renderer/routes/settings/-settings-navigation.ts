export function getSettingsParentPath(pathname: string): '/settings' | '/settings/provider' | undefined {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/'
  if (normalizedPath.startsWith('/settings/provider/')) {
    return '/settings/provider'
  }
  if (normalizedPath !== '/settings' && normalizedPath.startsWith('/settings/')) {
    return '/settings'
  }
  return undefined
}
