import type { SuanbaoPosition } from '@shared/types/suanbao'

export type { SuanbaoPosition } from '@shared/types/suanbao'

export interface SuanbaoBounds {
  width: number
  height: number
  petWidth: number
  petHeight: number
  margin?: number
}

export const DEFAULT_SUANBAO_POSITION: SuanbaoPosition = { x: 0.9, y: 0.78 }

export function clampNormalizedPosition(position: SuanbaoPosition): SuanbaoPosition {
  return {
    x: Math.min(1, Math.max(0, Number.isFinite(position.x) ? position.x : DEFAULT_SUANBAO_POSITION.x)),
    y: Math.min(1, Math.max(0, Number.isFinite(position.y) ? position.y : DEFAULT_SUANBAO_POSITION.y)),
  }
}

export function normalizedToPixels(position: SuanbaoPosition, bounds: SuanbaoBounds): SuanbaoPosition {
  const margin = bounds.margin ?? 12
  const maxX = Math.max(margin, bounds.width - bounds.petWidth - margin)
  const maxY = Math.max(margin, bounds.height - bounds.petHeight - margin)
  const safe = clampNormalizedPosition(position)
  return {
    x: margin + safe.x * Math.max(0, maxX - margin),
    y: margin + safe.y * Math.max(0, maxY - margin),
  }
}

export function pixelsToNormalized(position: SuanbaoPosition, bounds: SuanbaoBounds): SuanbaoPosition {
  const margin = bounds.margin ?? 12
  const maxX = Math.max(margin, bounds.width - bounds.petWidth - margin)
  const maxY = Math.max(margin, bounds.height - bounds.petHeight - margin)
  return clampNormalizedPosition({
    x: maxX === margin ? 0 : (position.x - margin) / (maxX - margin),
    y: maxY === margin ? 0 : (position.y - margin) / (maxY - margin),
  })
}

export function shouldShowSuanbao(pathname: string, settingsModalOpen: boolean): boolean {
  return !settingsModalOpen && !pathname.startsWith('/settings')
}
