import { describe, expect, it } from 'vitest'
import {
  COMPUTE_MARKET_SIMULATION_ALLOWED_ORIGINS,
  COMPUTE_MARKET_SIMULATION_API_BASE,
  COMPUTE_MARKET_SIMULATION_REMOTE_REQUIRED,
  parseComputeMarketSimulationAllowedOrigins,
} from './variables'

describe('shared compute-market defaults', () => {
  it('points a fresh checkout at the fail-closed KOD server feed', () => {
    expect(COMPUTE_MARKET_SIMULATION_API_BASE).toBe('https://kod.kai.com/api/v1')
    expect(COMPUTE_MARKET_SIMULATION_ALLOWED_ORIGINS).toBe('https://kod.kai.com')
    expect(COMPUTE_MARKET_SIMULATION_REMOTE_REQUIRED).toBe(true)
  })
})

describe('parseComputeMarketSimulationAllowedOrigins', () => {
  it('trims, removes empty entries, and de-duplicates configured origins', () => {
    expect(
      parseComputeMarketSimulationAllowedOrigins(
        ' https://market.example.com, http://localhost:8088,https://market.example.com, '
      )
    ).toEqual(['https://market.example.com', 'http://localhost:8088'])
  })

  it('returns an empty allowlist for an explicit empty override', () => {
    expect(parseComputeMarketSimulationAllowedOrigins('')).toEqual([])
  })
})
