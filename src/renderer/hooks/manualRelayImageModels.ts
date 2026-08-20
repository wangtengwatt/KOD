import type { ProviderModelInfo } from '@shared/types'
import { KOD_RELAY_PROVIDER_ID, type KodRelaySelection } from '@/packages/kodRelay'
import type { ImageModelGroup } from './useImageModelGroups'

const PREFERRED_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
  'gemini-3.1-flash-image-preview',
  'gemini-2.0-flash-exp-image-generation',
]

export function buildManualRelayImageGroup(
  selection: KodRelaySelection | null,
  relayModels: ProviderModelInfo[],
  excludedModels: string[]
): ImageModelGroup | null {
  if (!selection) return null
  const excluded = new Set(excludedModels)
  const models = relayModels
    .filter((model) => model.type === 'image' && !excluded.has(model.modelId))
    .map((model) => ({ modelId: model.modelId, displayName: model.nickname || model.modelId }))
    .sort((left, right) => preference(left.modelId) - preference(right.modelId))
  if (models.length === 0) return null
  return {
    label: `当前零售站 · ${stationLabel(selection.stationUrl)}`,
    providerId: KOD_RELAY_PROVIDER_ID,
    models,
  }
}

function preference(modelId: string) {
  const exact = PREFERRED_IMAGE_MODELS.indexOf(modelId)
  if (exact >= 0) return exact
  return PREFERRED_IMAGE_MODELS.length
}

function stationLabel(stationUrl: string) {
  try {
    return new URL(stationUrl).host || stationUrl
  } catch {
    return stationUrl
  }
}
