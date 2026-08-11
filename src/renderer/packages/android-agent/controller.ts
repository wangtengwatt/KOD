import { create } from 'zustand'
import { androidAgentNative } from './native'
import { assertSafeGoal } from './policy'
import type { AndroidAgentApp, AndroidAgentAppId, AndroidAgentTask } from './types'

interface AndroidAgentState {
  apps: AndroidAgentApp[]
  accessibilityEnabled: boolean
  task: AndroidAgentTask
  refresh: () => Promise<void>
  start: (appId: AndroidAgentAppId, goal: string, budget?: number, durationMs?: number) => Promise<AndroidAgentTask>
  pause: () => Promise<void>
  resume: () => Promise<void>
  stop: () => Promise<void>
}

function taskIdentity(task: AndroidAgentTask): [string, number] {
  if (!task.taskId || task.generation === undefined) throw new Error('No active Android agent task generation')
  return [task.taskId, task.generation]
}

export const useAndroidAgentStore = create<AndroidAgentState>((set, get) => ({
  apps: [],
  accessibilityEnabled: false,
  task: { state: 'idle' },
  refresh: async () => {
    const [apps, accessibility, task] = await Promise.all([
      androidAgentNative.listAllowedApps(),
      androidAgentNative.getAccessibilityStatus(),
      androidAgentNative.getTaskStatus(),
    ])
    set({ apps: apps.apps, accessibilityEnabled: accessibility.enabled, task })
  },
  start: async (appId, goal, budget, durationMs) => {
    assertSafeGoal(goal)
    const task = await androidAgentNative.startTask(appId, goal, budget, durationMs)
    set({ task })
    return task
  },
  pause: async () => {
    const [id, generation] = taskIdentity(get().task)
    set({ task: await androidAgentNative.pauseTask(id, generation) })
  },
  resume: async () => {
    const [id, generation] = taskIdentity(get().task)
    set({ task: await androidAgentNative.resumeTask(id, generation) })
  },
  stop: async () => {
    const [id, generation] = taskIdentity(get().task)
    set({ task: await androidAgentNative.stopTask(id, generation) })
  },
}))

export const androidAgentController = useAndroidAgentStore
