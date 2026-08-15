import type { SuanbaoPlacement } from '@shared/types/suanbao'

export interface SuanbaoRect {
  x: number
  y: number
  width: number
  height: number
}

export interface SuanbaoDisplaySnapshot {
  id: string
  workArea: SuanbaoRect
  scaleFactor: number
  primary?: boolean
}

export interface SuanbaoWindowSize {
  width: number
  height: number
}

const DEFAULT_PADDING = 12

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

function distanceToRect(point: { x: number; y: number }, rect: SuanbaoRect): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width))
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height))
  return dx * dx + dy * dy
}

export function selectDisplayForPlacement(
  placement: SuanbaoPlacement,
  displays: SuanbaoDisplaySnapshot[]
): SuanbaoDisplaySnapshot | undefined {
  if (displays.length === 0) return undefined

  const storedDisplay = placement.displayId && displays.find((display) => display.id === placement.displayId)
  if (storedDisplay) return storedDisplay

  const point = { x: finiteOr(placement.x, 0), y: finiteOr(placement.y, 0) }
  return (
    [...displays].sort(
      (left, right) => distanceToRect(point, left.workArea) - distanceToRect(point, right.workArea)
    )[0] ??
    displays.find((display) => display.primary) ??
    displays[0]
  )
}

export function clampDesktopPlacement(
  placement: SuanbaoPlacement,
  displays: SuanbaoDisplaySnapshot[],
  windowSize: SuanbaoWindowSize,
  padding = DEFAULT_PADDING
): SuanbaoPlacement {
  const display = selectDisplayForPlacement(placement, displays)
  if (!display) {
    return { ...placement, x: finiteOr(placement.x, 0), y: finiteOr(placement.y, 0) }
  }

  const safePadding = Math.max(0, finiteOr(padding, DEFAULT_PADDING))
  const safeWidth = Math.max(1, finiteOr(windowSize.width, 1))
  const safeHeight = Math.max(1, finiteOr(windowSize.height, 1))
  const { workArea } = display
  const minX = workArea.x + safePadding
  const minY = workArea.y + safePadding
  const maxX = workArea.x + workArea.width - safeWidth - safePadding
  const maxY = workArea.y + workArea.height - safeHeight - safePadding

  const anchoredX =
    placement.anchor === 'bottom-left'
      ? minX
      : placement.anchor === 'bottom-right'
        ? Math.max(minX, maxX)
        : finiteOr(placement.x, maxX)
  const anchoredY = placement.anchor === 'free' ? finiteOr(placement.y, maxY) : Math.max(minY, maxY)

  return {
    ...placement,
    mode: 'desktop',
    displayId: display.id,
    x: Math.round(clamp(anchoredX, minX, Math.max(minX, maxX))),
    y: Math.round(clamp(anchoredY, minY, Math.max(minY, maxY))),
    scaleFactor: display.scaleFactor,
  }
}

export function defaultDesktopPlacement(): SuanbaoPlacement {
  return {
    mode: 'desktop',
    x: 0,
    y: 0,
    anchor: 'bottom-right',
    locked: false,
  }
}
