import { useEffect } from 'react'
import { settingsStore } from '@/stores/settingsStore'
import platform from '../platform'

export function useSystemLanguageWhenInit() {
  useEffect(() => {
    // 通过定时器延迟启动，防止处理状态底层存储的异步加载前错误的初始数据
    setTimeout(() => {
      ;(async () => {
        const { languageInited } = settingsStore.getState()
        if (!languageInited) {
          // KOD 移动端产品默认使用简体中文，不跟随设备系统语言。
          // 用户仍可在常规设置中主动切换语言，languageInited 会阻止后续启动再次覆盖。
          let locale = platform.type === 'mobile' ? 'zh-Hans' : await platform.getLocale()

          // 网页版暂时不自动更改简体中文，防止网址封禁
          if (platform.type === 'web') {
            if (locale === 'zh-Hans') {
              locale = 'en'
            }
          }

          settingsStore.setState({
            language: locale,
            languageInited: true,
          })
        }
        settingsStore.setState({
          languageInited: true,
        })
      })()
    }, 2000)
  }, [])
}
