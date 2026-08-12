import { registerPlugin } from '@capacitor/core'
import { CHATBOX_BUILD_PLATFORM, CHATBOX_BUILD_TARGET } from '@/variables'
import type {
  AndroidAgentActionResult,
  AndroidAgentApp,
  AndroidAgentAppId,
  AndroidAgentSelector,
  AndroidAgentTask,
} from './types'

interface AndroidAgentNative {
  listAllowedApps(): Promise<{ apps: AndroidAgentApp[]; protocolVersion?: string }>
  startTask(options: { appId: AndroidAgentAppId; goal: string; budget?: number; durationMs?: number }): Promise<AndroidAgentTask>
  getTaskStatus(): Promise<AndroidAgentTask>
  pauseTask(options: { taskId: string; generation: number }): Promise<AndroidAgentTask>
  resumeTask(options: { taskId: string; generation: number }): Promise<AndroidAgentTask>
  stopTask(options: { taskId: string; generation: number }): Promise<AndroidAgentTask>
  registerApproval(options: {
    taskId: string
    generation: number
    actionId: string
    action: string
    snapshotId: string
  }): Promise<{ approvalToken: string; expiresAt: number }>
  getAccessibilityStatus(): Promise<{ enabled: boolean }>
  openAccessibilitySettings(): Promise<void>
  getOverlayStatus(): Promise<{ permissionGranted: boolean; running: boolean }>
  openOverlaySettings(): Promise<void>
  startOverlayPet(): Promise<{ permissionGranted: boolean; running: boolean }>
  stopOverlayPet(): Promise<{ permissionGranted: boolean; running: boolean }>
  getForegroundApp(): Promise<{ packageName?: string; allowed: boolean }>
  readUiTree(options: { taskId: string; generation: number; limit?: number }): Promise<AndroidAgentActionResult>
  clickElement(options: { taskId: string; generation: number; approvalToken: string; actionId: string; snapshotId: string } & AndroidAgentSelector): Promise<AndroidAgentActionResult>
  inputText(options: { taskId: string; generation: number; approvalToken: string; actionId: string; snapshotId: string; value: string } & AndroidAgentSelector): Promise<AndroidAgentActionResult>
  scroll(options: { taskId: string; generation: number; approvalToken: string; actionId: string; snapshotId: string; direction: 'forward' | 'backward' }): Promise<AndroidAgentActionResult>
  back(options: { taskId: string; generation: number; approvalToken: string; actionId: string; snapshotId: string }): Promise<AndroidAgentActionResult>
}

const nativeAgent = registerPlugin<AndroidAgentNative>('AndroidAgent')
export function isAndroidAgentAvailable() { return CHATBOX_BUILD_TARGET === 'mobile_app' && CHATBOX_BUILD_PLATFORM === 'android' }
function requireAndroid() { if (!isAndroidAgentAvailable()) throw new Error('Android agent is only available in the Android app'); return nativeAgent }

export const androidAgentNative = {
  listAllowedApps: () => requireAndroid().listAllowedApps(),
  startTask: (appId: AndroidAgentAppId, goal: string, budget?: number, durationMs?: number) => requireAndroid().startTask({ appId, goal, budget, durationMs }),
  getTaskStatus: () => requireAndroid().getTaskStatus(),
  pauseTask: (taskId: string, generation: number) => requireAndroid().pauseTask({ taskId, generation }),
  resumeTask: (taskId: string, generation: number) => requireAndroid().resumeTask({ taskId, generation }),
  stopTask: (taskId: string, generation: number) => requireAndroid().stopTask({ taskId, generation }),
  registerApproval: (taskId: string, generation: number, actionId: string, action: string, snapshotId: string) =>
    requireAndroid().registerApproval({ taskId, generation, actionId, action, snapshotId }),
  getAccessibilityStatus: () => requireAndroid().getAccessibilityStatus(),
  openAccessibilitySettings: () => requireAndroid().openAccessibilitySettings(),
  getOverlayStatus: () => requireAndroid().getOverlayStatus(),
  openOverlaySettings: () => requireAndroid().openOverlaySettings(),
  startOverlayPet: () => requireAndroid().startOverlayPet(),
  stopOverlayPet: () => requireAndroid().stopOverlayPet(),
  getForegroundApp: () => requireAndroid().getForegroundApp(),
  readUiTree: (taskId: string, generation: number, limit = 80) => requireAndroid().readUiTree({ taskId, generation, limit }),
  clickElement: (taskId: string, generation: number, approvalToken: string, actionId: string, snapshotId: string, selector: AndroidAgentSelector) =>
    requireAndroid().clickElement({ taskId, generation, approvalToken, actionId, snapshotId, ...selector }),
  inputText: (taskId: string, generation: number, approvalToken: string, actionId: string, snapshotId: string, selector: AndroidAgentSelector, value: string) =>
    requireAndroid().inputText({ taskId, generation, approvalToken, actionId, snapshotId, ...selector, value }),
  scroll: (taskId: string, generation: number, approvalToken: string, actionId: string, snapshotId: string, direction: 'forward' | 'backward') =>
    requireAndroid().scroll({ taskId, generation, approvalToken, actionId, snapshotId, direction }),
  back: (taskId: string, generation: number, approvalToken: string, actionId: string, snapshotId: string) =>
    requireAndroid().back({ taskId, generation, approvalToken, actionId, snapshotId }),
}
