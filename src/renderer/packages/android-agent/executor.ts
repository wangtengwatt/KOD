import { APPROVAL_TIMEOUT_MS, androidAgentApprovalStore } from './approval-store'
import { androidAgentController } from './controller'
import { androidAgentNative } from './native'
import { assertSafeAction, describeAction } from './policy'
import type { AndroidAgentAction, AndroidAgentActionResult } from './types'

let latestSnapshot: { taskId: string; generation: number; snapshotId: string } | undefined

export async function executeAndroidAgentAction(action: AndroidAgentAction): Promise<AndroidAgentActionResult> {
  assertSafeAction(action)
  const task = androidAgentController.getState().task
  if (task.state !== 'running' || !task.taskId || task.generation === undefined) throw new Error('TASK_NOT_RUNNING: Android agent task is not running')

  if (action.type === 'read') {
    const result = await androidAgentNative.readUiTree(task.taskId, task.generation, action.limit)
    if (!result.snapshotId || result.generation !== task.generation) throw new Error('SNAPSHOT_INVALID: Native snapshot binding is missing')
    latestSnapshot = { taskId: task.taskId, generation: task.generation, snapshotId: result.snapshotId }
    return result
  }

  if (!latestSnapshot || latestSnapshot.taskId !== task.taskId || latestSnapshot.generation !== task.generation) {
    throw new Error('SNAPSHOT_REQUIRED: Read the current UI immediately before requesting an action')
  }

  const actionId = crypto.randomUUID()
  const requestedAt = Date.now()
  const summary = describeAction(action)
  const decision = await androidAgentApprovalStore.getState().requestApproval({
    id: actionId,
    taskId: task.taskId,
    generation: task.generation,
    action,
    actionType: action.type,
    snapshotId: latestSnapshot.snapshotId,
    summary,
    requestedAt,
    expiresAt: requestedAt + APPROVAL_TIMEOUT_MS,
  })
  if (!decision.approved) throw new Error(`APPROVAL_${decision.status.toUpperCase()}: Android agent action was not approved`)

  const current = androidAgentController.getState().task
  if (current.taskId !== task.taskId || current.generation !== task.generation || current.state !== 'running') {
    throw new Error('GENERATION_STALE: Task changed while approval was pending')
  }
  const grant = await androidAgentNative.registerApproval(task.taskId, task.generation, actionId, action.type, latestSnapshot.snapshotId)
  if (grant.expiresAt < Date.now()) throw new Error('APPROVAL_EXPIRED: Native approval expired')

  let result: AndroidAgentActionResult
  try {
    switch (action.type) {
      case 'click':
        result = await androidAgentNative.clickElement(task.taskId, task.generation, grant.approvalToken, actionId, latestSnapshot.snapshotId, action)
        break
      case 'input':
        result = await androidAgentNative.inputText(task.taskId, task.generation, grant.approvalToken, actionId, latestSnapshot.snapshotId, action, action.value)
        break
      case 'scroll':
        result = await androidAgentNative.scroll(task.taskId, task.generation, grant.approvalToken, actionId, latestSnapshot.snapshotId, action.direction)
        break
      case 'back':
        result = await androidAgentNative.back(task.taskId, task.generation, grant.approvalToken, actionId, latestSnapshot.snapshotId)
        break
    }
    latestSnapshot = undefined
    androidAgentApprovalStore.getState().recordExecution({ id: actionId, taskId: task.taskId, generation: task.generation, actionType: action.type, summary, status: result.success ? 'executed' : 'failed', timestamp: Date.now(), errorCode: result.errorCode })
    void androidAgentController.getState().refresh()
    return result
  } catch (error) {
    latestSnapshot = undefined
    androidAgentApprovalStore.getState().recordExecution({ id: actionId, taskId: task.taskId, generation: task.generation, actionType: action.type, summary, status: 'failed', timestamp: Date.now(), errorCode: error instanceof Error ? error.message.split(':')[0] : 'UNKNOWN' })
    throw error
  }
}

export function clearAndroidAgentSnapshot() { latestSnapshot = undefined }
