import platform from '@/platform'

export function resolveComputeMarketFeatureFlags(settings: {
  nodeEnv?: string
  v2?: string
  simulation?: string
  remoteRequired?: string
}) {
  const isProduction = settings.nodeEnv === 'production'
  const simulation = settings.simulation !== 'false'
  const v2 = simulation || settings.v2 !== 'false'

  return {
    v2,
    simulation,
    simulationRemoteRequired: simulation && settings.remoteRequired !== 'false',
    simulationAllowLoopback: !isProduction,
  }
}

const computeMarketFlags = resolveComputeMarketFeatureFlags({
  nodeEnv: process.env.NODE_ENV,
  v2: process.env.COMPUTE_MARKET_V2,
  simulation: process.env.COMPUTE_MARKET_SIMULATION,
  remoteRequired: process.env.COMPUTE_MARKET_SIMULATION_REMOTE_REQUIRED,
})

export const featureFlags = {
  mcp: platform.type === 'desktop',
  knowledgeBase: platform.type === 'desktop',
  skills: false,
  taskMode: false,
  // The shared server feed is the default for source checkouts and release builds.
  computeMarketV2: computeMarketFlags.v2,
  computeMarketSimulation: computeMarketFlags.simulation,
  computeMarketSimulationRemoteRequired: computeMarketFlags.simulationRemoteRequired,
  computeMarketSimulationAllowLoopback: computeMarketFlags.simulationAllowLoopback,
  computeMarketRealtime: false,
  computeMarketAdvanced: computeMarketFlags.simulation,
  computeMarketFullscreen: true,
  computeMarketAgentExplain: false,
}
