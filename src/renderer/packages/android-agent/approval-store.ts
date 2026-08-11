import { create } from 'zustand'
import type { AndroidAgentApprovalRequest, AndroidAgentApprovalStatus, AndroidAgentAuditEntry } from './types'

export const APPROVAL_TIMEOUT_MS = 30_000
interface ApprovalDecision { approved: boolean; status: AndroidAgentApprovalStatus }
interface ApprovalStoreState {
  request?: AndroidAgentApprovalRequest
  audit: AndroidAgentAuditEntry[]
  resolve?: (decision: ApprovalDecision) => void
  timer?: ReturnType<typeof setTimeout>
  requestApproval: (request: Omit<AndroidAgentApprovalRequest, 'status'>) => Promise<ApprovalDecision>
  decide: (approved: boolean) => void
  cancelForGeneration: (taskId?: string, generation?: number) => void
  recordExecution: (entry: AndroidAgentAuditEntry) => void
}

function auditFrom(request: AndroidAgentApprovalRequest, status: AndroidAgentAuditEntry['status'], errorCode?: string): AndroidAgentAuditEntry {
  return { id: request.id, taskId: request.taskId, generation: request.generation, actionType: request.actionType, summary: request.summary, status, timestamp: Date.now(), errorCode }
}

export const useAndroidAgentApprovalStore = create<ApprovalStoreState>((set, get) => ({
  audit: [],
  requestApproval: (incoming) =>
    new Promise<ApprovalDecision>((resolve) => {
      const previous = get().request
      if (previous) {
        if (get().timer) clearTimeout(get().timer)
        get().resolve?.({ approved: false, status: 'superseded' })
        set((state) => ({ audit: [...state.audit.slice(-49), auditFrom(previous, 'superseded')] }))
      }
      const request: AndroidAgentApprovalRequest = { ...incoming, status: 'pending' }
      const timer = setTimeout(() => {
        const current = get().request
        if (!current || current.id !== request.id) return
        set((state) => ({ request: undefined, resolve: undefined, timer: undefined, audit: [...state.audit.slice(-49), auditFrom(request, 'timed_out')] }))
        resolve({ approved: false, status: 'timed_out' })
      }, Math.max(0, request.expiresAt - Date.now()))
      set({ request, resolve, timer })
    }),
  decide: (approved) => {
    const { request, resolve, timer } = get()
    if (!request || !resolve) return
    if (timer) clearTimeout(timer)
    const status: AndroidAgentApprovalStatus = approved ? 'approved' : 'rejected'
    set((state) => ({ request: undefined, resolve: undefined, timer: undefined, audit: [...state.audit.slice(-49), auditFrom(request, status)] }))
    resolve({ approved, status })
  },
  cancelForGeneration: (taskId, generation) => {
    const { request, resolve, timer } = get()
    if (!request || (taskId && request.taskId !== taskId) || (generation !== undefined && request.generation !== generation)) return
    if (timer) clearTimeout(timer)
    set((state) => ({ request: undefined, resolve: undefined, timer: undefined, audit: [...state.audit.slice(-49), auditFrom(request, 'cancelled')] }))
    resolve?.({ approved: false, status: 'cancelled' })
  },
  recordExecution: (entry) => set((state) => ({ audit: [...state.audit.slice(-49), entry] })),
}))

export const androidAgentApprovalStore = useAndroidAgentApprovalStore
