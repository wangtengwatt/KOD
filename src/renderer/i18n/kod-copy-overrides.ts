const detectingLanguageKey = 'Detecting your language...'

export const kodCopyOverrides = {
  en: {
    [detectingLanguageKey]: detectingLanguageKey,
  },
  'zh-Hans': {
    [detectingLanguageKey]: '正在检测你的语言…',
  },
  'zh-Hant': {
    [detectingLanguageKey]: '正在偵測你的語言…',
  },
} as const
