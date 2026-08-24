import { beforeEach, describe, expect, it, vi } from 'vitest'

const { ofetchMock } = vi.hoisted(() => ({
  ofetchMock: vi.fn(),
}))

vi.mock('ofetch', () => ({
  ofetch: ofetchMock,
}))

vi.mock('@/packages/remote', () => ({
  getKodApiOrigin: () => 'https://kod.example',
}))

vi.mock('@/stores/authInfoStore', () => ({
  authInfoStore: {
    getState: () => ({ accessToken: null }),
  },
}))

vi.mock('@/variables', () => ({
  KOD_MARKET_API_ORIGIN: 'http://127.0.0.1:8787/',
}))

import {
  getComputeConfig,
  getComputeMarketPriceHistory,
  getComputeMarketPrices,
  resolveComputeMarketApiOrigin,
} from './computeCenter'

describe('compute market API origin', () => {
  beforeEach(() => {
    ofetchMock.mockReset()
    ofetchMock.mockResolvedValue({ code: 0, data: {} })
  })

  it('uses the dedicated origin only for market price requests', async () => {
    await getComputeMarketPrices()
    await getComputeMarketPriceHistory('nvidia-a100-pcie-40gb', '24h')
    await getComputeConfig()

    expect(ofetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://127.0.0.1:8787/api/compute/market-prices/latest',
      'http://127.0.0.1:8787/api/compute/market-prices/history?model=nvidia-a100-pcie-40gb&range=24h',
      'https://kod.example/api/compute/config',
    ])
  })

  it('falls back to the KOD origin when the dedicated origin is blank', () => {
    expect(resolveComputeMarketApiOrigin('  ', 'https://kod.example/')).toBe('https://kod.example')
  })
})
