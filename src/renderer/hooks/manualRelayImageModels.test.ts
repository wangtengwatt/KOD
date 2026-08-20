import type { ProviderModelInfo } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { KOD_RELAY_PROVIDER_ID, type KodRelaySelection } from '@/packages/kodRelay'
import { buildManualRelayImageGroup } from './manualRelayImageModels'

const selection: KodRelaySelection = {
  stationId: 2,
  stationUrl: 'https://retail.kai.com/v1',
  apiKeyId: 3,
  apiKey: 'placeholder-only',
}

const models: ProviderModelInfo[] = [
  { modelId: 'chat-model', nickname: '聊天模型', type: 'chat' },
  { modelId: 'gemini-2.5-flash-image', nickname: '图片模型', type: 'image' },
  { modelId: 'flux-image', nickname: '已排除图片模型', type: 'image' },
]

describe('manual relay image group', () => {
  it('exposes only allowed image models under the relay provider id', () => {
    expect(buildManualRelayImageGroup(selection, models, ['flux-image'])).toEqual({
      label: '当前零售站 · retail.kai.com',
      providerId: KOD_RELAY_PROVIDER_ID,
      models: [{ modelId: 'gemini-2.5-flash-image', displayName: '图片模型' }],
    })
  })

  it('returns null for an image-less active relay instead of falling back', () => {
    expect(
      buildManualRelayImageGroup(
        selection,
        models.filter((model) => model.type !== 'image'),
        []
      )
    ).toBeNull()
  })

  it('returns null when manual relay mode is not active', () => {
    expect(buildManualRelayImageGroup(null, models, [])).toBeNull()
  })
})
