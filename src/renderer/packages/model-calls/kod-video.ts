export const KOD_VIDEO_PROVIDER_ID = 'kod-official-video'
export const KOD_VIDEO_PROVIDER_NAME = 'KOD AI'

export const KOD_VIDEO_UPSTREAM = {
  apiHost: process.env.KOD_VIDEO_API_HOST || 'https://api.tokenstar.world',
  apiKey: process.env.KOD_VIDEO_API_KEY || '',
} as const

export const KOD_VIDEO_MODELS = [
  { value: 'seedance-2.0-asset-fast', label: 'Seedance 2.0 Fast（快速）' },
  { value: 'seedance-2.0-asset', label: 'Seedance 2.0（高质）' },
  { value: 'volc-asset-video', label: 'Volc Asset Video' },
] as const
