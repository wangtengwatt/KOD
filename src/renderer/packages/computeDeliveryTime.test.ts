import { describe, expect, it } from 'vitest'
import { addHoursToLocalDateTime, resolvePackageDurationHours } from './computeDeliveryTime'

describe('compute delivery time', () => {
  it('prefers the duration snapshot returned with the order', () => {
    expect(resolvePackageDurationHours({ packageDurationHours: 24 }, 48)).toBe(24)
  })

  it('uses the matching product duration when the order has no duration field', () => {
    expect(resolvePackageDurationHours({}, 72)).toBe(72)
  })

  it('falls back to the original order interval for older responses', () => {
    expect(
      resolvePackageDurationHours({
        startTime: '2026-08-15T10:00:00+08:00',
        endTime: '2026-08-16T10:00:00+08:00',
      })
    ).toBe(24)
  })

  it('returns null when no valid package duration is available', () => {
    expect(resolvePackageDurationHours({ startTime: '', endTime: '' })).toBeNull()
  })

  it('automatically calculates expiry from the agreed start', () => {
    expect(addHoursToLocalDateTime('2026-08-15T15:57', 24)).toBe('2026-08-16T15:57')
    expect(addHoursToLocalDateTime('2026-08-15T15:57', 168)).toBe('2026-08-22T15:57')
  })

  it('does not generate an expiry from invalid input', () => {
    expect(addHoursToLocalDateTime('', 24)).toBe('')
    expect(addHoursToLocalDateTime('invalid', 24)).toBe('')
    expect(addHoursToLocalDateTime('2026-08-15T15:57', null)).toBe('')
  })
})
