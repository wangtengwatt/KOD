// 第 4 周设置联调（arch §10.5 V1 偏好迁移，最安全方式）。
// 约束：不动 suanbaoStore 的读路径（runtime 仍同步读 localStorage），不动 settingsStore 内部；
// 仅在 settingsStore hydrate 后，一次性把当前账户的 V1 localStorage 偏好（去 position）写到
// Settings.suanbao，并记迁移标记保证幂等。position 不迁移（arch §10.1 设备态）。
// 完整「运行时改读 Settings + OS-user 单一偏好模型」是风险更高的子任务，留后续单独做。
import type { SuanbaoPreferences } from '@shared/types/suanbao'
import { suanbaoStore } from '@/components/suanbao/suanbaoStore'
import { settingsStore } from '@/stores/settingsStore'

const MIGRATED_FLAG = 'suanbao-v1-migrated'

function isHydrated(): boolean {
  try {
    return settingsStore.persist.hasHydrated()
  } catch {
    return false
  }
}

function hasMigratedFlag(): boolean {
  try {
    return !!window.localStorage.getItem(MIGRATED_FLAG)
  } catch {
    return false
  }
}

function setMigratedFlag(): void {
  try {
    window.localStorage.setItem(MIGRATED_FLAG, '1')
  } catch {
    // localStorage 不可用时静默跳过（迁移不阻塞）
  }
}

/** 从 suanbaoStore 当前状态提取 SuanbaoPreferences（排除 position/accountKey/方法）。 */
function currentPrefs(): SuanbaoPreferences {
  const s = suanbaoStore.getState()
  return {
    schemaVersion: s.schemaVersion,
    enabled: s.enabled,
    hidden: s.hidden,
    activeMode: s.activeMode,
    soundEnabled: s.soundEnabled,
    animation: s.animation,
    locked: s.locked,
    desktopOverlayEnabled: s.desktopOverlayEnabled,
    notificationsEnabled: s.notificationsEnabled,
    locationMode: s.locationMode,
    calendarEnabled: s.calendarEnabled,
    doNotDisturb: s.doNotDisturb,
  }
}

/**
 * 一次性把当前账户的 V1 偏好（localStorage）迁到 Settings.suanbao（去 position）。
 * 幂等（迁移标记）+ hydration 门控。读路径不变，runtime 安全。
 */
export function migrateSuanbaoV1PrefsToSettings(): void {
  if (!isHydrated()) return
  if (hasMigratedFlag()) return
  settingsStore.setState((state) => ({
    ...state,
    suanbao: currentPrefs(),
  }) as typeof state)
  setMigratedFlag()
}

// 激活：settingsStore hydrate 后跑一次迁移（若已 hydrate 立即跑）。
// 仅副作用注册；实际调用由 hydration 触发。
try {
  settingsStore.persist.onFinishHydration(migrateSuanbaoV1PrefsToSettings)
  if (isHydrated()) migrateSuanbaoV1PrefsToSettings()
} catch {
  // settingsStore.persist 不可用时静默跳过
}
