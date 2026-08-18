type SafeAreaModule = typeof import('./mobile_safe_area')
type SafeAreaLoader = () => Promise<SafeAreaModule>

const loadSafeArea: SafeAreaLoader = () => import('./mobile_safe_area')

export async function initializeMobileRuntime(
  buildTarget: string,
  buildPlatform: string,
  loader: SafeAreaLoader = loadSafeArea
) {
  if (buildTarget !== 'mobile_app' || (buildPlatform !== 'android' && buildPlatform !== 'ios')) return

  const { initializeMobileSafeArea } = await loader()
  await initializeMobileSafeArea()
}
