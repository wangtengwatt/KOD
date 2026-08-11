export type AndroidAgentAppId = 'wechat' | 'qq'
export type AndroidAgentTaskState = 'idle' | 'running' | 'paused' | 'stopped' | 'failed'

export interface AndroidAgentApp {
  id: AndroidAgentAppId
  packageName: string
  installed: boolean
}

export interface AndroidAgentTask {
  taskId?: string
  generation?: number
  appId?: AndroidAgentAppId
  packageName?: string
  goal?: string
  state: AndroidAgentTaskState
  startedAt?: number
  deadlineAt?: number
  budget?: number
  remainingBudget?: number
  terminalReason?: string
  protocolVersion?: string
}

export interface AndroidAgentSelector {
  text?: string
  description?: string
  viewId?: string
}

export interface AndroidAgentNode extends Required<AndroidAgentSelector> {
  className: string
  clickable: boolean
  editable: boolean
  scrollable: boolean
}

export type AndroidAgentAction =
  | { type: 'read'; limit?: number }
  | ({ type: 'click' } & AndroidAgentSelector)
  | ({ type: 'input'; value: string } & AndroidAgentSelector)
  | { type: 'scroll'; direction: 'forward' | 'backward' }
  | { type: 'back' }

export interface AndroidAgentActionResult {
  success?: boolean
  message?: string
  errorCode?: string
  matchCount?: number
  packageName?: string
  snapshotId?: string
  windowId?: number
  generation?: number
  remainingBudget?: number
  state?: AndroidAgentTaskState
  terminalReason?: string
  nodes?: AndroidAgentNode[]
}

export type AndroidAgentApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'timed_out' | 'superseded'

export interface AndroidAgentApprovalRequest {
  id: string
  taskId: string
  generation: number
  action: AndroidAgentAction
  actionType: Exclude<AndroidAgentAction['type'], 'read'>
  snapshotId: string
  summary: string
  requestedAt: number
  expiresAt: number
  status: AndroidAgentApprovalStatus
}

export interface AndroidAgentAuditEntry {
  id: string
  taskId: string
  generation: number
  actionType: string
  summary: string
  status: AndroidAgentApprovalStatus | 'executed' | 'failed'
  timestamp: number
  errorCode?: string
}
