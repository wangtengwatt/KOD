import type { SuanbaoWindowLanguage } from '@shared/types/suanbao'

export interface SuanbaoWindowCopy {
  offline: string
  hostUnavailable: string
  greeting: string
  openKod: string
  hide: string
  minimize: string
  online: string
  offlineMode: string
  failure: string
  hideSuanbao: string
  minimizeSuanbao: string
  windowControls: string
  confirm: string
  cancel: string
  stateLabel: string
}

const COPY: Record<SuanbaoWindowLanguage, SuanbaoWindowCopy> = {
  'zh-Hans': {
    offline: '蒜宝正在离线待命',
    hostUnavailable: 'KOD 主程序尚未就绪',
    greeting: '你好，我是蒜宝。',
    openKod: '打开 KOD',
    hide: '隐藏',
    minimize: '最小化',
    online: '在线',
    offlineMode: '离线模式',
    failure: '蒜宝正在休息，KOD 仍可正常使用。',
    hideSuanbao: '隐藏蒜宝',
    minimizeSuanbao: '最小化蒜宝',
    windowControls: '窗口控制',
    confirm: '确认',
    cancel: '取消',
    stateLabel: '蒜宝状态：',
  },
  en: {
    offline: 'Suanbao is standing by offline',
    hostUnavailable: 'KOD is not ready yet',
    greeting: "Hi, I'm Suanbao.",
    openKod: 'Open KOD',
    hide: 'Hide',
    minimize: 'Minimize',
    online: 'Online',
    offlineMode: 'Offline',
    failure: 'Suanbao is resting. KOD remains available.',
    hideSuanbao: 'Hide Suanbao',
    minimizeSuanbao: 'Minimize Suanbao',
    windowControls: 'Window controls',
    confirm: 'Confirm',
    cancel: 'Cancel',
    stateLabel: 'Suanbao status: ',
  },
}

export function getSuanbaoWindowCopy(language: SuanbaoWindowLanguage): SuanbaoWindowCopy {
  return COPY[language]
}

export const defaultSuanbaoWindowCopy = COPY['zh-Hans']
