import { describe, expect, it } from 'vitest'
import {
  isSuanbaoRouteId,
  isValidSuanbaoDomainCommand,
  isValidSuanbaoPosition,
  MAX_SUANBAO_INPUT_LENGTH,
} from './suanbao'

describe('Suanbao shared contracts', () => {
  it('accepts controlled routes only', () => {
    expect(isSuanbaoRouteId('image-creator')).toBe(true)
    expect(isSuanbaoRouteId('/settings/provider')).toBe(false)
  })

  it('rejects invalid positions', () => {
    expect(isValidSuanbaoPosition({ x: 0.5, y: 1 })).toBe(true)
    expect(isValidSuanbaoPosition({ x: Number.NaN, y: 0 })).toBe(false)
    expect(isValidSuanbaoPosition({ x: -1, y: 0 })).toBe(false)
  })

  it('bounds message payloads and operation ids', () => {
    expect(isValidSuanbaoDomainCommand({ type: 'message', input: '你好', locale: 'zh-Hans' })).toBe(true)
    expect(
      isValidSuanbaoDomainCommand({ type: 'message', input: 'x'.repeat(MAX_SUANBAO_INPUT_LENGTH + 1), locale: 'en' })
    ).toBe(false)
    expect(isValidSuanbaoDomainCommand({ type: 'cancel', operationId: '../unsafe' })).toBe(false)
    expect(isValidSuanbaoDomainCommand({ type: 'cancel', operationId: 'operation_123' })).toBe(true)
  })
})
