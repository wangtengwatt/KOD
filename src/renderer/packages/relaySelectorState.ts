import type { KodRelayKey, KodRelaySelection, KodRelayStation } from './kodRelay'

export function getRelayStationChange(
  value: string | null,
  stations: KodRelayStation[]
): { stationId: number | null; shouldClearRelay: boolean } {
  if (!value) return { stationId: null, shouldClearRelay: true }
  const stationId = Number(value)
  return {
    stationId: stations.some((station) => station.id === stationId) ? stationId : null,
    shouldClearRelay: false,
  }
}

export function canSelectRelayKey(stationId: number | null, loadingKeys: boolean, loading: boolean) {
  return Boolean(stationId) && !loadingKeys && !loading
}

export function getRelaySelection(
  stationId: number | null,
  keyId: string | null,
  stations: KodRelayStation[],
  keys: KodRelayKey[]
): KodRelaySelection | null {
  if (!stationId || !keyId) return null
  const station = stations.find((item) => item.id === stationId)
  const key = keys.find((item) => item.id === Number(keyId))
  if (!station || !key) return null
  return {
    stationId: station.id,
    stationUrl: station.url,
    apiKeyId: key.id,
    apiKey: key.api_key,
  }
}
