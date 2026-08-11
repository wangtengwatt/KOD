import type { AndroidAgentAction, AndroidAgentAppId } from './types'

export type AndroidAgentRisk = 'low' | 'medium' | 'high' | 'blocked'

export const ANDROID_AGENT_APPS: Record<AndroidAgentAppId, string> = {
  wechat: 'com.tencent.mm',
  qq: 'com.tencent.mobileqq',
}

export const blockedTerms = [
  '支付',
  '付款',
  '收款',
  '转账',
  '红包',
  '提现',
  '银行卡',
  '验证码',
  '密码',
  '口令',
  'payment',
  'pay now',
  'transfer',
  'bank card',
  'verification code',
  'otp',
  'password',
  'passcode',
]

export function containsBlockedTerm(value: string) {
  const normalized = value.toLowerCase()
  return blockedTerms.some((term) => normalized.includes(term))
}

export function classifyAndroidAction(action: string): AndroidAgentRisk {
  if (['payment', 'transfer', 'read_password', 'enter_verification_code', 'bulk_send'].includes(action)) {
    return 'blocked'
  }
  if (['send_message', 'share_file', 'upload_file', 'delete', 'logout', 'change_permission'].includes(action)) {
    return 'high'
  }
  if (
    ['input_text', 'pick_file', 'pick_photo', 'write_clipboard', 'open_chat', 'click', 'scroll', 'back'].includes(
      action
    )
  ) {
    return 'medium'
  }
  return 'low'
}

export function assertSafeGoal(goal: string): void {
  if (!goal.trim() || goal.length > 500 || containsBlockedTerm(goal)) {
    throw new Error('Android agent goal is empty, too long, or sensitive')
  }
}

export function assertSafeAction(action: AndroidAgentAction): void {
  if (action.type === 'input') {
    const target = [action.text, action.description, action.viewId].filter(Boolean).join(' ')
    if (!action.value || action.value.length > 500 || containsBlockedTerm(action.value)) {
      throw new Error('Sensitive or invalid text input is blocked')
    }
    if (/password|passcode|pin|密码|口令/i.test(target)) throw new Error('Password input targets are blocked')
  }
  if (action.type === 'click') {
    const target = [action.text, action.description, action.viewId].filter(Boolean).join(' ')
    if (!target || containsBlockedTerm(target)) throw new Error('Sensitive or empty click target is blocked')
  }
}

export function describeAction(action: AndroidAgentAction): string {
  switch (action.type) {
    case 'read':
      return '读取当前应用界面'
    case 'click':
      return `点击：${action.text || action.description || action.viewId}`
    case 'input':
      return `输入文本到：${action.text || action.description || action.viewId || '当前输入框'}`
    case 'scroll':
      return action.direction === 'forward' ? '向前滚动' : '向后滚动'
    case 'back':
      return '返回上一页'
  }
}

export type AndroidAgentApproval = {
  taskId: string
  actionId: string
  action: string
  targetPackage: string
  approvedAt: number
  expiresAt: number
}

export function validateApproval(
  approval: AndroidAgentApproval | undefined,
  expected: Pick<AndroidAgentApproval, 'taskId' | 'actionId' | 'action' | 'targetPackage'>,
  now = Date.now()
) {
  if (!approval) return false
  return (
    approval.taskId === expected.taskId &&
    approval.actionId === expected.actionId &&
    approval.action === expected.action &&
    approval.targetPackage === expected.targetPackage &&
    approval.approvedAt <= now &&
    approval.expiresAt > now
  )
}

export function matchesSelector(
  node: { text?: string; description?: string; viewId?: string },
  selector: { text?: string; description?: string; viewId?: string }
) {
  const hasSelector = Boolean(selector.text || selector.description || selector.viewId)
  return hasSelector && (!selector.text || selector.text === node.text) &&
    (!selector.description || selector.description === node.description) &&
    (!selector.viewId || selector.viewId === node.viewId)
}
