import type { SuanbaoAnimationLevel, SuanbaoPetState } from '@shared/types/suanbao'

export interface SuanbaoAssetVariants {
  full?: string
  reduced?: string
  off?: string
}

export type SuanbaoAssetTable = Partial<Record<SuanbaoPetState, SuanbaoAssetVariants>>

export interface LoadedSuanbaoAsset {
  source: string
  level: SuanbaoAnimationLevel
  url: string
}

export type SuanbaoAssetResolver = (source: string) => Promise<string>

const FALLBACK_ORDER: Record<SuanbaoAnimationLevel, SuanbaoAnimationLevel[]> = {
  full: ['full', 'reduced', 'off'],
  reduced: ['reduced', 'off'],
  off: ['off'],
}

export class SuanbaoAssetLoader {
  private readonly cache = new Map<string, Promise<string>>()

  constructor(
    private readonly assets: SuanbaoAssetTable,
    private readonly resolveAsset: SuanbaoAssetResolver
  ) {}

  async load(state: SuanbaoPetState, requestedLevel: SuanbaoAnimationLevel): Promise<LoadedSuanbaoAsset | null> {
    const variants = this.assets[state]
    if (!variants) return null

    for (const level of FALLBACK_ORDER[requestedLevel]) {
      const source = variants[level]
      if (!source) continue
      try {
        const url = await this.loadOnce(source)
        return { source, level, url }
      } catch {
        // Continue through the explicit fallback chain. The caller decides whether a total failure hides the pet.
      }
    }
    return null
  }

  clear(): void {
    this.cache.clear()
  }

  private loadOnce(source: string): Promise<string> {
    const cached = this.cache.get(source)
    if (cached) return cached

    const pending = this.resolveAsset(source).catch((error) => {
      this.cache.delete(source)
      throw error
    })
    this.cache.set(source, pending)
    return pending
  }
}
