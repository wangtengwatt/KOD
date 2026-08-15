import { enrichModelFromAnyRegistry } from '@shared/model-registry/enrich'
import { ModelProviderType, type ProviderBaseInfo, type ProviderModelInfo, type Settings } from '@shared/types'

export const KOD_RELAY_PROVIDER_ID = '__kod_relay_station__'
export const KOD_RELAY_STORAGE_KEY = 'kod_relay'
export const KOD_RELAY_FALLBACK_STORAGE_KEY = 'kod_relay_fallback'
export const KOD_STATIONS_STORAGE_KEY = 'kod_stations'

export interface KodRelayStation {
  id: number
  url: string
  create_time?: string
}

export interface KodRelayKey {
  id: number
  station_id: number
  api_key: string
  status: number
  create_time?: string
}

export interface KodRelaySelection {
  stationId: number
  stationUrl: string
  apiKeyId: number
  apiKey: string
  modelId?: string
}

export interface KodRelaySnapshot {
  selection: KodRelaySelection
  models: ProviderModelInfo[]
}

export interface KodRelayModelRequirement {
  capability?: NonNullable<ProviderModelInfo['capabilities']>[number]
  type?: NonNullable<ProviderModelInfo['type']>
  label: string
}

export interface KodRelayBalance {
  can_chat?: boolean
  connected_station_id?: number | null
  connected_station_url?: string | null
  connected_key_id?: number | null
  connected_api_key?: string | null
}

export interface KodRelayApiResult<T> {
  code: number
  message?: string
  data?: T | null
}

export class KodRelayConflictError extends Error {
  constructor(message = '所选节点已被占用，请重新选择') {
    super(message)
    this.name = 'KodRelayConflictError'
  }
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '')
}

async function parseKodRelayResponse<T>(response: Response): Promise<T> {
  const result = (await response.json()) as KodRelayApiResult<T>
  if (response.status === 409 || result.code === 409) {
    throw new KodRelayConflictError(result.message)
  }
  if (!response.ok || result.code !== 0) {
    throw new Error(result.message || `Kod API request failed (${response.status})`)
  }
  if (result.data == null) {
    throw new Error(result.message || 'Kod API response missing data')
  }
  return result.data
}

export async function listKodRelayStations(apiOrigin: string, signal?: AbortSignal) {
  const response = await fetch(`${normalizeBaseUrl(apiOrigin)}/api/relay-station/list`, { signal })
  return parseKodRelayResponse<KodRelayStation[]>(response)
}

export async function listKodRelayKeys(apiOrigin: string, stationId: number, signal?: AbortSignal) {
  const response = await fetch(`${normalizeBaseUrl(apiOrigin)}/api/relay-station/${stationId}/keys`, { signal })
  return parseKodRelayResponse<KodRelayKey[]>(response)
}

export async function selectKodRelayKey(apiOrigin: string, token: string, selection: KodRelaySelection) {
  const response = await fetch(`${normalizeBaseUrl(apiOrigin)}/api/session/select-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ station_id: selection.stationId, api_key_id: selection.apiKeyId }),
  })
  const result = (await response.json()) as KodRelayApiResult<unknown>
  if (response.status === 409 || result.code === 409) {
    throw new KodRelayConflictError(result.message)
  }
  if (!response.ok || result.code !== 0) {
    throw new Error(result.message || `Kod API request failed (${response.status})`)
  }
}

export async function releaseKodRelayKey(apiOrigin: string, token: string) {
  const response = await fetch(`${normalizeBaseUrl(apiOrigin)}/api/session/release-key`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const result = (await response.json()) as KodRelayApiResult<unknown>
  if (!response.ok || result.code !== 0) {
    throw new Error(result.message || `Kod API request failed (${response.status})`)
  }
}

export async function getKodRelayBalance(apiOrigin: string, token: string) {
  const response = await fetch(`${normalizeBaseUrl(apiOrigin)}/api/session/balance`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return parseKodRelayResponse<KodRelayBalance>(response)
}

export async function startKodRelayLogSync(apiOrigin: string, token: string) {
  const response = await fetch(`${normalizeBaseUrl(apiOrigin)}/api/log/sync/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error(`Kod log sync failed (${response.status})`)
  }
}

export async function fetchKodRelayModels(selection: KodRelaySelection, signal?: AbortSignal) {
  const response = await fetch(`${normalizeBaseUrl(selection.stationUrl)}/models`, {
    headers: { Authorization: `Bearer ${selection.apiKey}` },
    signal,
  })
  if (!response.ok) {
    throw new Error(`Relay models request failed (${response.status})`)
  }
  const result = (await response.json()) as { data?: Array<{ id?: unknown; name?: unknown }> }
  return (result.data || []).flatMap<ProviderModelInfo>((item) => {
    if (typeof item.id !== 'string') return []
    return [
      enrichModelFromAnyRegistry({
        modelId: item.id,
        nickname: typeof item.name === 'string' ? item.name : item.id,
        type: 'chat' as const,
      }),
    ]
  })
}

export function readKodRelaySelection(
  storage: Pick<Storage, 'getItem'>,
  key: string = KOD_RELAY_STORAGE_KEY
): KodRelaySelection | null {
  try {
    const value = storage.getItem(key)
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<KodRelaySelection>
    if (
      typeof parsed.stationId !== 'number' ||
      typeof parsed.stationUrl !== 'string' ||
      typeof parsed.apiKeyId !== 'number' ||
      typeof parsed.apiKey !== 'string' ||
      (parsed.modelId !== undefined && (typeof parsed.modelId !== 'string' || !parsed.modelId))
    ) {
      return null
    }
    return parsed as KodRelaySelection
  } catch {
    return null
  }
}

export function isKodRelayModelCompatible(model: ProviderModelInfo, requirement?: KodRelayModelRequirement) {
  if (!requirement) return model.type === undefined || model.type === 'chat'
  if (requirement.type && model.type !== requirement.type) return false
  if (requirement.capability && !model.capabilities?.includes(requirement.capability)) return false
  return true
}

export function getCompatibleKodRelayModels(models: ProviderModelInfo[], requirement?: KodRelayModelRequirement) {
  return models.filter((model) => isKodRelayModelCompatible(model, requirement))
}

export function pickKodRelayModel(
  models: ProviderModelInfo[],
  preferredModelId?: string,
  requirement?: KodRelayModelRequirement
): ProviderModelInfo | undefined {
  const compatible = getCompatibleKodRelayModels(models, requirement)
  return compatible.find((model) => model.modelId === preferredModelId) || compatible[0]
}

export function relaySelectionFromBalance(balance: KodRelayBalance): KodRelaySelection | null {
  if (
    typeof balance.connected_station_id !== 'number' ||
    typeof balance.connected_station_url !== 'string' ||
    typeof balance.connected_key_id !== 'number' ||
    typeof balance.connected_api_key !== 'string'
  ) {
    return null
  }
  return {
    stationId: balance.connected_station_id,
    stationUrl: balance.connected_station_url,
    apiKeyId: balance.connected_key_id,
    apiKey: balance.connected_api_key,
  }
}

export function applyKodRelayProvider(
  settings: Settings,
  selection: KodRelaySelection | null,
  models: ProviderModelInfo[]
): Partial<Settings> {
  const providers = { ...(settings.providers || {}) }
  const customProviders = (settings.customProviders || []).filter((provider) => provider.id !== KOD_RELAY_PROVIDER_ID)
  delete providers[KOD_RELAY_PROVIDER_ID]

  if (!selection) return { providers, customProviders }

  providers[KOD_RELAY_PROVIDER_ID] = {
    apiHost: selection.stationUrl,
    apiKey: selection.apiKey,
    models,
  }
  const provider: ProviderBaseInfo = {
    id: KOD_RELAY_PROVIDER_ID,
    name: 'KOD AI',
    type: ModelProviderType.OpenAI,
    isCustom: true,
    defaultSettings: {
      apiHost: selection.stationUrl,
      apiKey: selection.apiKey,
      models,
    },
  }
  return { providers, customProviders: [...customProviders, provider] }
}

export function isKodRelayModel(model: ProviderModelInfo, providerId?: string) {
  return providerId === KOD_RELAY_PROVIDER_ID && Boolean(model.modelId)
}
