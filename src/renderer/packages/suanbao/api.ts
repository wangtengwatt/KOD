// 蒜宝（suanbao）数据层公共面：埋点入口 + 一键清除。
// 见架构.md §15.3（埋点门控）与 §16/§19.1（删除全部本机蒜宝数据）。
// 实际事件埋点的调用点（pet_show/pet_hide 等）留给后续 pet 交互 UI，不在数据层本轮范围。
import { suanbaoStore } from '@/components/suanbao/suanbaoStore'
import platform from '@/platform'
import { getSuanbaoRepository } from './repositories/createSuanbaoRepository'

/**
 * 将标量 props 统一转为 string，供 platform.trackingEvent 使用
 * （trackingEvent 的 params 值要求 string，desktop 端经 IPC JSON 序列化）。
 */
export function stringifyProps(props: Record<string, string | number | boolean>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of Object.keys(props)) {
    result[key] = String(props[key])
  }
  return result
}

// arch §15.3 禁止记录的敏感字段（受控 prop 名精确匹配，防御性剔除）。
// 用精确匹配避免误伤合法字段（如 'error_code' 不被 'code' 误删；'entry' 入口合法保留）。
// 禁止清单：prompt/reply/message/content（正文）、code/stack（代码/错误内容）、
// latitude/lat/longitude/lng/city（定位）、title/notes（待办/提醒/日程标题）、
// filepath/path/meetinglink/url（文件路径/会议链接）、secret/token/password/apikey/authorization（凭据）。
const SUANBAO_SENSITIVE_PROP_KEYS = new Set<string>([
  'prompt',
  'reply',
  'message',
  'content',
  'code',
  'stack',
  'latitude',
  'lat',
  'longitude',
  'lng',
  'city',
  'title',
  'notes',
  'filepath',
  'path',
  'meetinglink',
  'url',
  'secret',
  'token',
  'password',
  'apikey',
  'authorization',
])

function sanitizeSuanbaoProps(props: Record<string, string | number | boolean>): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {}
  for (const key of Object.keys(props)) {
    if (SUANBAO_SENSITIVE_PROP_KEYS.has(key)) continue
    result[key] = props[key]
  }
  return result
}

/**
 * 蒜宝埋点事件词汇表（arch §15.3，受控枚举）。pet 交互 UI 落地后补充 pet_show/pet_hide/
 * pet_interact/reminder_fired/reminder_dismissed 等事件；新增事件须先小组评审
 * （任务书「埋点口径」——与姚铭洲/王腾核对）。当前仅含数据层已使用的事件。
 */
export const SUANBAO_TRACKED_EVENTS = ['data_cleared'] as const
export type SuanbaoEventName = (typeof SUANBAO_TRACKED_EVENTS)[number]

/**
 * 蒜宝埋点统一入口。门控：全局开关 allowReportingAndTracking === false 时不上报
 * （arch §15.3「继续遵循应用统计同意开关」；A 区偏好无单独的 per-suanbao 埋点开关）。
 * 数据最小化：props 仅含标量（动作ID/平台/错误码/耗时/入口），
 * 不含 prompt、消息正文、文件内容、经纬度、城市、待办/提醒/日程标题、日历详情、文件路径、会议链接。
 */
export async function trackSuanbao(name: SuanbaoEventName, props: Record<string, string | number | boolean>): Promise<void> {
  const settings = await platform.getSettings()
  if (settings.allowReportingAndTracking === false) return
  platform.trackingEvent(name, stringifyProps(sanitizeSuanbaoProps(props)))
}

/**
 * 删除全部本机蒜宝数据（arch §16 / §19.1）：清当前账户 repository 的全部业务实体
 * （Todo/Reminder/Pomodoro/Calendar/Operation）。accountKey 取自 suanbaoStore（runtime 同源）。
 * 审计埋点 data_cleared 仅记录「清除发生」这一事实，不含被清内容，受门控。
 * 不动 A 区偏好（用户偏好保留），不动平台文件。
 */
export async function clearSuanbaoData(): Promise<void> {
  const accountKey = suanbaoStore.getState().accountKey
  await getSuanbaoRepository(accountKey).clearAll()
  await trackSuanbao('data_cleared', { cleared_at: String(Date.now()) })
}
