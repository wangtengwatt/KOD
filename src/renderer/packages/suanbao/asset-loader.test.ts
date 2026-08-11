import { describe, expect, it, vi } from 'vitest'
import { SuanbaoAssetLoader } from './asset-loader'

describe('SuanbaoAssetLoader', () => {
  it('deduplicates concurrent requests and caches a successful result', async () => {
    const resolver = vi.fn(async (source: string) => `asset://${source}`)
    const loader = new SuanbaoAssetLoader({ idle: { full: 'idle.webp' } }, resolver)

    const [first, second] = await Promise.all([loader.load('idle', 'full'), loader.load('idle', 'full')])
    expect(first).toEqual(second)
    expect(resolver).toHaveBeenCalledTimes(1)
  })

  it('falls back from full to reduced and static assets', async () => {
    const resolver = vi.fn((source: string) => {
      if (source !== 'idle.png') return Promise.reject(new Error('missing animation'))
      return Promise.resolve(`asset://${source}`)
    })
    const loader = new SuanbaoAssetLoader(
      { idle: { full: 'idle-full.webp', reduced: 'idle-reduced.webp', off: 'idle.png' } },
      resolver
    )

    await expect(loader.load('idle', 'full')).resolves.toEqual({
      source: 'idle.png',
      level: 'off',
      url: 'asset://idle.png',
    })
  })

  it('returns null instead of throwing when every variant fails', async () => {
    const loader = new SuanbaoAssetLoader({ error: { off: 'error.png' } }, () => Promise.reject(new Error('missing')))
    await expect(loader.load('error', 'full')).resolves.toBeNull()
  })
})
