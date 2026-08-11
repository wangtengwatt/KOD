import { describe, expect, it } from 'vitest'
import { parseLocalSuanbaoIntent } from './intent'

describe('parseLocalSuanbaoIntent', () => {
  it('creates confirmation drafts for side effects', () => {
    expect(parseLocalSuanbaoIntent('待办：提交周报')).toMatchObject({
      type: 'confirmation',
      confirmation: { kind: 'todo', title: '提交周报' },
    })
    expect(parseLocalSuanbaoIntent('开始 30 分钟番茄钟')).toMatchObject({
      type: 'confirmation',
      confirmation: { kind: 'pomodoro', action: { kind: 'start-pomodoro', durationMs: 1_800_000 } },
    })
  })

  it('uses a new idempotency key for a later identical draft', () => {
    const first = parseLocalSuanbaoIntent('待办：提交周报')
    const second = parseLocalSuanbaoIntent('待办：提交周报')
    if (first?.type !== 'confirmation' || second?.type !== 'confirmation') throw new Error('Expected confirmations')
    expect(first.confirmation.idempotencyKey).not.toBe(second.confirmation.idempotencyKey)
    expect(first.confirmation.action).toEqual({ kind: 'create-todo', title: '提交周报' })
  })

  it('parses controlled navigation and local settings', () => {
    expect(parseLocalSuanbaoIntent('打开图片生成')).toEqual({ type: 'navigate', route: 'image-creator' })
    expect(parseLocalSuanbaoIntent('锁定位置')).toEqual({ type: 'set-locked', locked: true })
  })

  it('turns a past clock time into the next day', () => {
    const result = parseLocalSuanbaoIntent('9点提醒我开会', new Date('2026-08-03T10:00:00+08:00'))
    expect(result).toMatchObject({ type: 'confirmation', confirmation: { kind: 'reminder', title: '开会' } })
    if (result?.type === 'confirmation') {
      expect(new Date(result.confirmation.fields[1].value).getTime()).toBeGreaterThan(
        new Date('2026-08-03T10:00:00+08:00').getTime()
      )
    }
  })
})
