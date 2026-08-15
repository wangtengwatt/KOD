import type { SuanbaoPlacement } from '@shared/types/suanbao'
import { describe, expect, it } from 'vitest'
import { clampDesktopPlacement, selectDisplayForPlacement } from './placement'

const displays = [
  { id: 'primary', workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1, primary: true },
  { id: 'secondary', workArea: { x: 1920, y: 0, width: 1280, height: 984 }, scaleFactor: 1.5 },
]

const placement: SuanbaoPlacement = {
  mode: 'desktop',
  displayId: 'primary',
  x: 100,
  y: 100,
  anchor: 'free',
  locked: false,
}

describe('desktop placement', () => {
  it('keeps a valid free placement on its display', () => {
    expect(clampDesktopPlacement(placement, displays, { width: 360, height: 420 })).toMatchObject({
      displayId: 'primary',
      x: 100,
      y: 100,
    })
  })

  it('clamps invalid coordinates into the display work area', () => {
    expect(
      clampDesktopPlacement({ ...placement, x: Number.POSITIVE_INFINITY, y: -500 }, displays, {
        width: 360,
        height: 420,
      })
    ).toMatchObject({ x: 1548, y: 12 })
  })

  it('restores bottom-right anchors against the current work area', () => {
    expect(
      clampDesktopPlacement({ ...placement, anchor: 'bottom-right' }, displays, { width: 360, height: 420 })
    ).toMatchObject({ x: 1548, y: 608 })
  })

  it('moves a placement to the nearest display when its stored display was removed', () => {
    const removedDisplayPlacement = { ...placement, displayId: 'removed', x: 2500, y: 500 }
    expect(selectDisplayForPlacement(removedDisplayPlacement, displays)?.id).toBe('secondary')
    expect(clampDesktopPlacement(removedDisplayPlacement, displays, { width: 360, height: 420 }).displayId).toBe(
      'secondary'
    )
  })

  it('keeps oversized windows anchored inside the work area', () => {
    expect(clampDesktopPlacement(placement, displays.slice(0, 1), { width: 3000, height: 2000 })).toMatchObject({
      x: 12,
      y: 12,
    })
  })
})
