// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  marketPanel: vi.fn(({ identity }: { identity: string | null }) => (
    <div data-testid="market-intelligence-identity">{identity ?? 'signed-out'}</div>
  )),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ ...(options as object), useSearch: () => ({}) }),
  useNavigate: () => vi.fn(),
}))

vi.mock('@/components/compute-market', () => ({
  MarketIntelligencePanel: mocks.marketPanel,
}))

vi.mock('@/utils/feature-flags', () => ({
  featureFlags: {
    computeMarketV2: true,
    computeMarketSimulation: false,
    computeMarketSimulationRemoteRequired: false,
    computeMarketSimulationAllowLoopback: false,
    computeMarketFullscreen: true,
    computeMarketAdvanced: false,
  },
}))

import { MarketPricePanel } from '../compute-center'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('compute center realtime market route', () => {
  it('passes the stable wallet identity into the real market inference panel', () => {
    render(<MarketPricePanel identity="email:user@example.com" />)

    expect(screen.getByTestId('market-intelligence-identity').textContent).toBe('email:user@example.com')
    expect(mocks.marketPanel).toHaveBeenCalledWith(
      expect.objectContaining({ identity: 'email:user@example.com', simulationMode: false }),
      expect.anything()
    )
  })
})
