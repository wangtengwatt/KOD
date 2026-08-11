import { describe, expect, it } from 'vitest'
import { canSelectRelayKey, getRelaySelection, getRelayStationChange } from './relaySelectorState'

const stations = [{ id: 2, url: 'https://relay.example/v1' }]
const keys = [{ id: 8, station_id: 2, api_key: 'sk-node', status: 0 }]

describe('relay selector state', () => {
  it('keeps a newly selected station pending before a key is selected', () => {
    expect(getRelayStationChange('2', stations)).toEqual({ stationId: 2, shouldClearRelay: false })
  })

  it('builds a relay selection only after the pending station and key both exist', () => {
    expect(getRelaySelection(2, null, stations, keys)).toBeNull()
    expect(getRelaySelection(2, '8', stations, keys)).toEqual({
      stationId: 2,
      stationUrl: 'https://relay.example/v1',
      apiKeyId: 8,
      apiKey: 'sk-node',
    })
  })

  it('allows key selection from a pending station before the parent selection is committed', () => {
    expect(canSelectRelayKey(2, false, false)).toBe(true)
    expect(canSelectRelayKey(null, false, false)).toBe(false)
    expect(canSelectRelayKey(2, true, false)).toBe(false)
    expect(canSelectRelayKey(2, false, true)).toBe(false)
  })
})
