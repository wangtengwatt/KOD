import { describe, expect, it } from 'vitest'
import electronViteConfig from '../../../electron.vite.config'
import { resolveComputeMarketFeatureFlags } from './feature-flags'

const COMPUTE_MARKET_BUILD_ENV_KEYS = [
  'NODE_ENV',
  'COMPUTE_MARKET_V2',
  'COMPUTE_MARKET_SIMULATION',
  'COMPUTE_MARKET_SIMULATION_API_BASE',
  'COMPUTE_MARKET_SIMULATION_ALLOWED_ORIGINS',
  'COMPUTE_MARKET_SIMULATION_REMOTE_REQUIRED',
] as const

type RendererDefines = Record<string, string>

function rendererDefines(
  mode: 'development' | 'production',
  overrides: Partial<Record<(typeof COMPUTE_MARKET_BUILD_ENV_KEYS)[number], string>>
) {
  const previous = new Map(computeMarketBuildEnvEntries())
  try {
    for (const key of COMPUTE_MARKET_BUILD_ENV_KEYS) delete process.env[key]
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) process.env[key] = value
    }
    const createConfig = electronViteConfig as unknown as (environment: { command: 'build'; mode: string }) => {
      renderer?: { define?: RendererDefines }
    }
    const defines = createConfig({ command: 'build', mode }).renderer?.define
    if (!defines) throw new Error('Renderer build defines are missing')
    return defines
  } finally {
    for (const key of COMPUTE_MARKET_BUILD_ENV_KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function computeMarketBuildEnvEntries() {
  return COMPUTE_MARKET_BUILD_ENV_KEYS.map((key) => [key, process.env[key]] as const)
}

describe('resolveComputeMarketFeatureFlags', () => {
  it('defaults production to the shared fail-closed simulation with loopback blocked', () => {
    expect(resolveComputeMarketFeatureFlags({ nodeEnv: 'production' })).toEqual({
      v2: true,
      simulation: true,
      simulationRemoteRequired: true,
      simulationAllowLoopback: false,
    })
  })

  it('enables the V2 panel and fail-closed remote feed for an explicit production demo build', () => {
    expect(
      resolveComputeMarketFeatureFlags({
        nodeEnv: 'production',
        simulation: 'true',
        remoteRequired: 'true',
      })
    ).toEqual({
      v2: true,
      simulation: true,
      simulationRemoteRequired: true,
      simulationAllowLoopback: false,
    })
  })

  it('keeps the shared feed fail-closed by default outside production while allowing explicit loopback URLs', () => {
    expect(resolveComputeMarketFeatureFlags({ nodeEnv: 'development' })).toEqual({
      v2: true,
      simulation: true,
      simulationRemoteRequired: true,
      simulationAllowLoopback: true,
    })
  })

  it('allows an explicit development override to use optional local fallback data', () => {
    expect(
      resolveComputeMarketFeatureFlags({
        nodeEnv: 'development',
        simulation: 'true',
        remoteRequired: 'false',
      })
    ).toMatchObject({
      simulation: true,
      simulationRemoteRequired: false,
      simulationAllowLoopback: true,
    })
  })

  it('cannot require a remote simulator while simulation itself is disabled', () => {
    expect(
      resolveComputeMarketFeatureFlags({
        nodeEnv: 'production',
        simulation: 'false',
        remoteRequired: 'true',
      }).simulationRemoteRequired
    ).toBe(false)
  })
})

describe('production compute-market build guards', () => {
  it('ships a fresh production build against the shared KOD feed by default', () => {
    const defines = rendererDefines('production', {})

    expect(defines).toMatchObject({
      'process.env.COMPUTE_MARKET_V2': '"true"',
      'process.env.COMPUTE_MARKET_SIMULATION': '"true"',
      'process.env.COMPUTE_MARKET_SIMULATION_API_BASE': '"https://kod.kai.com/api/v1"',
      'process.env.COMPUTE_MARKET_SIMULATION_ALLOWED_ORIGINS': '"https://kod.kai.com"',
      'process.env.COMPUTE_MARKET_SIMULATION_REMOTE_REQUIRED': '"true"',
    })
  })

  it('forces the shared feed to fail closed even when CI leaves remoteRequired=false', () => {
    const defines = rendererDefines('production', {
      COMPUTE_MARKET_SIMULATION: 'true',
      COMPUTE_MARKET_SIMULATION_REMOTE_REQUIRED: 'false',
    })

    expect(defines['process.env.COMPUTE_MARKET_SIMULATION_REMOTE_REQUIRED']).toBe('"true"')
  })

  it('forces production runtime semantics even when CI leaves NODE_ENV=development', () => {
    const defines = rendererDefines('production', {
      NODE_ENV: 'development',
      COMPUTE_MARKET_SIMULATION: 'true',
    })
    const flags = resolveComputeMarketFeatureFlags({
      nodeEnv: JSON.parse(defines['process.env.NODE_ENV']),
      simulation: JSON.parse(defines['process.env.COMPUTE_MARKET_SIMULATION']),
      remoteRequired: JSON.parse(defines['process.env.COMPUTE_MARKET_SIMULATION_REMOTE_REQUIRED']),
    })

    expect(defines['process.env.NODE_ENV']).toBe('"production"')
    expect(flags.simulationAllowLoopback).toBe(false)
    expect(flags.simulationRemoteRequired).toBe(true)
  })

  it('preserves explicit local-feed overrides for development', () => {
    const defines = rendererDefines('development', {
      COMPUTE_MARKET_SIMULATION_API_BASE: 'http://localhost:8088/api/v1',
      COMPUTE_MARKET_SIMULATION_ALLOWED_ORIGINS: 'http://localhost:8088',
      COMPUTE_MARKET_SIMULATION_REMOTE_REQUIRED: 'false',
    })

    expect(defines).toMatchObject({
      'process.env.COMPUTE_MARKET_SIMULATION_API_BASE': '"http://localhost:8088/api/v1"',
      'process.env.COMPUTE_MARKET_SIMULATION_ALLOWED_ORIGINS': '"http://localhost:8088"',
      'process.env.COMPUTE_MARKET_SIMULATION_REMOTE_REQUIRED': '"false"',
    })
  })
})
