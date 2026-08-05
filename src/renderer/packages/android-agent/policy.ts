export type AndroidAgentRisk = 'low' | 'medium' | 'high' | 'blocked'

export const blockedTerms = [
  '支付',
  '付款',
  '转账',
  '红包',
  '提现',
  '验证码',
  '密码',
  'payment',
  'transfer',
  'password',
  'verification code',
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
  if (['input_text', 'pick_file', 'pick_photo', 'write_clipboard', 'open_chat'].includes(action)) {
    return 'medium'
  }
  return 'low'
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
    approval.expiresAt >= now
  )
}
