import type { MenuItemConstructorOptions } from 'electron'
import type { SuanbaoWindowManager } from './window'

export interface SuanbaoTrayLabels {
  toggle: string
  toggleAnimation: string
}

export function createSuanbaoTrayItems(
  windowManager: SuanbaoWindowManager,
  labels: SuanbaoTrayLabels
): MenuItemConstructorOptions[] {
  return [
    { type: 'separator' },
    {
      label: labels.toggle,
      click: () => void windowManager.toggleFromTray(),
    },
    {
      label: labels.toggleAnimation,
      type: 'checkbox',
      checked: windowManager.getAnimation() === 'off',
      click: (item) => windowManager.setAnimation(item.checked ? 'off' : 'full'),
    },
  ]
}
