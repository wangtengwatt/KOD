import type { Language } from '../../shared/types'

export const languageNameMap: Record<Language, string> = {
  en: 'English',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  ja: '日本語',
  ko: '한국어',
  ru: 'Русский', // Russian
  de: 'Deutsch', // German
  fr: 'Français', // French
  'pt-PT': 'Português', // Portuguese
  es: 'Español', // Spanish
  ar: 'العربية', // Arabic
  'it-IT': 'Italiano', // Italian
  sv: 'Svenska', // Swedish 瑞典语
  'nb-NO': 'Norsk', // Norwegian 挪威语
}

export const languages = Array.from(Object.keys(languageNameMap)) as Language[]

// 移动端提供完整翻译维护的语言：简体中文 / English / 繁體中文。
// 其余语言保留在 languageNameMap 中（系统语言检测仍可用），但不在切换列表展示，
// 避免出现部分文本回退成中文的混杂体验。
export const availableLanguages: Language[] = ['zh-Hans', 'en', 'zh-Hant']
