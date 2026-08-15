import { Box, Paper, Text, UnstyledButton } from '@mantine/core'
import { type Icon, IconCpu, IconMessageCircle2, IconPhoto, IconUserCircle, IconVideo } from '@tabler/icons-react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import platform from '@/platform'

type MobileNavItem = {
  labelKey: string
  path: '/' | '/image-creator' | '/video-creator' | '/compute-center' | '/mobile-my'
  icon: Icon
  active: (pathname: string) => boolean
}

const items: MobileNavItem[] = [
  {
    labelKey: 'Chat',
    path: '/',
    icon: IconMessageCircle2,
    active: (pathname) => pathname === '/' || pathname.startsWith('/session/'),
  },
  {
    labelKey: 'Create Image',
    path: '/image-creator',
    icon: IconPhoto,
    active: (pathname) => pathname.startsWith('/image-creator'),
  },
  {
    labelKey: 'Create Video',
    path: '/video-creator',
    icon: IconVideo,
    active: (pathname) => pathname.startsWith('/video-creator'),
  },
  {
    labelKey: 'Compute',
    path: '/compute-center',
    icon: IconCpu,
    active: (pathname) => pathname.startsWith('/compute-center'),
  },
  {
    labelKey: 'Mine',
    path: '/mobile-my',
    icon: IconUserCircle,
    active: (pathname) => pathname.startsWith('/mobile-my') || pathname.startsWith('/settings'),
  },
]

export function MobileBottomNavigation() {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  if (platform.type !== 'mobile') return null

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
          const Icon = item.icon
          return (
            <UnstyledButton
              key={item.path}
              aria-label={t(item.labelKey)}
              aria-current={selected ? 'page' : undefined}
              onClick={() => navigate({ to: item.path })}
              className="flex flex-col items-center justify-center gap-0.5"
              c={selected ? 'kod-brand' : 'kod-tertiary'}
            >
              <Icon size={22} stroke={selected ? 2.2 : 1.7} />
              <Text size="xxs" fw={selected ? 700 : 500} c="inherit">
                {t(item.labelKey)}
              </Text>
            </UnstyledButton>
          )
        })}
      </Box>
    </Paper>
  )
}
