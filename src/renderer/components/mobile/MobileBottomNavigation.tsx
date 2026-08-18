import { Box, Paper, Text, UnstyledButton } from '@mantine/core'
import { type Icon, IconCpu, IconMessageCircle2, IconPhoto, IconUserCircle, IconVideo } from '@tabler/icons-react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import platform from '@/platform'

type MobileNavItem = {
  labelKey: string
  zhHansLabel: string
  path: '/' | '/image-creator' | '/video-creator' | '/compute-center' | '/mobile-my'
  icon: Icon
  active: (pathname: string) => boolean
}

const items: MobileNavItem[] = [
  {
    labelKey: 'Chat',
    zhHansLabel: '对话',
    path: '/',
    icon: IconMessageCircle2,
    active: (pathname) => pathname === '/' || pathname.startsWith('/session/'),
  },
  {
    labelKey: 'Create Image',
    zhHansLabel: '生图',
    path: '/image-creator',
    icon: IconPhoto,
    active: (pathname) => pathname.startsWith('/image-creator'),
  },
  {
    labelKey: 'Create Video',
    zhHansLabel: '视频',
    path: '/video-creator',
    icon: IconVideo,
    active: (pathname) => pathname.startsWith('/video-creator'),
  },
  {
    labelKey: 'Compute',
    zhHansLabel: '算力',
    path: '/compute-center',
    icon: IconCpu,
    active: (pathname) => pathname.startsWith('/compute-center'),
  },
  {
    labelKey: 'Mine',
    zhHansLabel: '我的',
    path: '/mobile-my',
    icon: IconUserCircle,
    active: (pathname) => pathname.startsWith('/mobile-my') || pathname.startsWith('/settings'),
  },
]

export function MobileBottomNavigation() {
  const location = useLocation()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  if (platform.type !== 'mobile') return null

  const labelFor = (item: MobileNavItem) => {
    const translated = t(item.labelKey)
    return i18n?.resolvedLanguage === 'zh-Hans' ? item.zhHansLabel : translated
  }

  return (
    <Paper
      component="nav"
      aria-label={t('Mobile main navigation')}
      radius={0}
      withBorder
      className="fixed bottom-0 left-0 right-0 z-[1200]"
      style={{ paddingBottom: 'var(--mobile-safe-area-inset-bottom, 0px)' }}
    >
      <Box className="grid grid-cols-5 h-16">
        {items.map((item) => {
          const selected = item.active(location.pathname)
          const ItemIcon = item.icon
          const label = labelFor(item)

          return (
            <UnstyledButton
              key={item.path}
              aria-label={label}
              aria-current={selected ? 'page' : undefined}
              onClick={() => navigate({ to: item.path })}
              className="flex flex-col items-center justify-center gap-0.5"
              c={selected ? 'kod-brand' : 'kod-tertiary'}
            >
              <ItemIcon size={22} stroke={selected ? 2.2 : 1.7} />
              <Text size="xxs" fw={selected ? 700 : 500} c="inherit">
                {label}
              </Text>
            </UnstyledButton>
          )
        })}
      </Box>
    </Paper>
  )
}
