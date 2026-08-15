import { atom, useAtomValue } from 'jotai'
import { debounce } from 'lodash'
import { getOS } from '@/packages/navigator'
import platform from '@/platform'

export const isFullscreenAtom = atom(false)

isFullscreenAtom.onMount = (set) => {
  const check = async () => {
    set(await platform.isFullscreen())
  }
  void check()
  const handleResize = debounce(check, 250)
  window.addEventListener('resize', handleResize)
  return () => {
    window.removeEventListener('resize', handleResize)
    handleResize.cancel?.()
  }
}

const inferPlatformType = () => {
  if (platform.type !== 'desktop') {
    return ''
  }

  const os = getOS()
  if (os === 'Windows') return 'win32'
  if (os === 'Mac') return 'darwin'
  if (os === 'Linux') return 'linux'
  return ''
}

export const platformTypeAtom = atom(inferPlatformType())

platformTypeAtom.onMount = (set) => {
  void platform
    .getPlatform()
    .then((p) => {
      set(p)
    })
    .catch(() => {
      set(inferPlatformType())
    })
}

const needRoomForWinControlsAtom = atom((get) => {
  const isFullscreen = get(isFullscreenAtom)
  const platformType = get(platformTypeAtom)

  return {
    needRoomForMacWindowControls: platformType === 'darwin' && !isFullscreen,
    needRoomForWindowsWindowControls: platformType === 'linux',
  }
})

const useNeedRoomForWinControls = () => {
  return useAtomValue(needRoomForWinControlsAtom)
}

export default useNeedRoomForWinControls
