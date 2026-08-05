import { describe, expect, it } from 'vitest'
import { classifyAndroidAction, containsBlockedTerm, validateApproval } from './policy'

describe('Android agent policy', () => {
  it('classifies allowed, confirmable, and blocked actions', () => {
    expect(classifyAndroidAction('read_ui_tree')).toBe('low')
    expect(classifyAndroidAction('input_text')).toBe('medium')
    expect(classifyAndroidAction('send_message')).toBe('high')
    expect(classifyAndroidAction('payment')).toBe('blocked')
  })

  it('detects sensitive content in Chinese and English', () => {
    expect(containsBlockedTerm('请帮我转账')).toBe(true)
    expect(containsBlockedTerm('enter verification code')).toBe(true)
    expect(containsBlockedTerm('搜索测试联系人')).toBe(false)
  })

  it('accepts only matching, unexpired one-time approvals', () => {
    const expected = {
      taskId: 'task-1',
      actionId: 'action-1',
      action: 'send_message',
      targetPackage: 'com.tencent.mm',
    }
    const approval = {
      ...expected,
      approvedAt: 100,
      expiresAt: 200,
    }
    expect(validateApproval(approval, expected, 150)).toBe(true)
    expect(validateApproval(approval, { ...expected, actionId: 'other' }, 150)).toBe(false)
    expect(validateApproval(approval, expected, 201)).toBe(false)
  })
})
