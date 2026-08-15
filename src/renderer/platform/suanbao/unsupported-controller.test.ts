import { describe, expect, it } from 'vitest'
import { UnsupportedSuanbaoPlatformController } from './unsupported-controller'

describe('UnsupportedSuanbaoPlatformController', () => {
  it('returns an honest in-app downgrade and keeps control methods safe', async () => {
    const controller = new UnsupportedSuanbaoPlatformController('desktop overlay is unavailable')
    await expect(controller.getCapabilities()).resolves.toMatchObject({
      overlay: 'in-app',
      backgroundScheduling: 'foreground-only',
      systemCalendarRead: false,
      reason: 'desktop overlay is unavailable',
    })
    await expect(controller.setEnabled(true)).resolves.toBeUndefined()
    await expect(controller.show()).resolves.toBeUndefined()
    await expect(controller.hide()).resolves.toBeUndefined()
  })
})
