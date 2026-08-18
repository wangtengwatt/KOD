// 这个库解决了移动端异形屏的显示安全区域的问题，比如iPhoneX，iPhone11等
// 这个库引入后，将设置全局的css变量 --mobile-safe-area-inset-top, --mobile-safe-area-inset-bottom, --mobile-safe-area-inset-left, --mobile-safe-area-inset-right
// 通过这些变量，可以在css中设置安全区域的padding，margin等，来规避异形屏的显示问题
// 为了达到最好的效果，在 html 的 meta 标签中设置 viewport-fit=cover

import { Keyboard } from '@capacitor/keyboard'
import { SafeArea } from 'capacitor-plugin-safe-area'

let initialization: Promise<void> | undefined
type SafeAreaInsets = Awaited<ReturnType<typeof SafeArea.getSafeAreaInsets>>['insets']

function applyInsets(insets: SafeAreaInsets) {
  for (const [key, value] of Object.entries(insets) as Array<[keyof SafeAreaInsets, number]>) {
    document.documentElement.style.setProperty(`--mobile-safe-area-inset-${key}`, `${value}px`)
  }
}

export function initializeMobileSafeArea() {
  if (initialization) return initialization

  initialization = (async () => {
    const { insets } = await SafeArea.getSafeAreaInsets()
    applyInsets(insets)
    await SafeArea.getStatusBarHeight()

    await Promise.all([
      SafeArea.addListener('safeAreaChanged', ({ insets: changedInsets }) => applyInsets(changedInsets)),
      Keyboard.addListener('keyboardWillShow', () => {
        document.documentElement.style.setProperty('--mobile-safe-area-inset-bottom', '0px')
      }),
      Keyboard.addListener('keyboardWillHide', async () => {
        const { insets: restoredInsets } = await SafeArea.getSafeAreaInsets()
        applyInsets(restoredInsets)
      }),
    ])
  })()

  return initialization
}
