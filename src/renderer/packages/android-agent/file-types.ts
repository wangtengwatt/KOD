export interface MobileFileLimits {
  maxFiles: 1
  maxBytes: number
  contentUriOnly: true
  tokenTtlMs: number
}

export interface MobileFile {
  token: string
  name: string
  mimeType: string
  size: number
}

export type MobileFilePickerKind = 'image' | 'document'

export interface MobileFilePickResult {
  cancelled: boolean
  files: MobileFile[]
}
