import { Box, Paper, Text, UnstyledButton } from '@mantine/core'
import { type Icon, IconCpu, IconMessageCircle2, IconPhoto, IconUserCircle, IconVideo } from '@tabler/icons-react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import platform from '@/platform'

type MobileNavItem = {
  label: string
  path: '/' | '/image-creator' | '/video-creator' | '/compute-center' | '/mobile-my'
  icon: Icon
  active: (pathname: string) => boolean
}

const items: MobileNavItem[] = [
  {
    label: '对话',
    path: '/',
    icon: IconMessageCircle2,
    active: (pathname) => pathname === '/' || pathname.startsWith('/session/'),
  },
  {
    label: '生图',
    path: '/image-creator',
    icon: IconPhoto,
    active: (pathname) => pathname.startsWith('/image-creator'),
  },
  {
    label: '视频',
    path: '/video-creator',
    icon: IconVideo,
    active: (pathname) => pathname.startsWith('/video-creator'),
  },
  {
    label: '算力',
    path: '/compute-center',
    icon: IconCpu,
    active: (pathname) => pathname.startsWith('/compute-center'),
  },
  {
    label: '我的',
    path: '/mobile-my',
    icon: IconUserCircle,
    active: (pathname) => pathname.startsWith('/mobile-my') || pathname.startsWith('/settings'),
  },
]

export function MobileBottomNavigation() {
  const location = useLocation()
  const navigate = useNavigate()
  if (platform.type !== 'mobile') return null

  return (
    <Paper
      component="nav"
      aria-label="移动端主导航"
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
              aria-label={item.label}
              aria-current={selected ? 'page' : undefined}
              onClick={() => navigate({ to: item.path })}
              className="flex flex-col items-center justify-center gap-0.5"
              c={selected ? 'kod-brand' : 'kod-tertiary'}
            >
              <Icon size={22} stroke={selected ? 2.2 : 1.7} />
              <Text size="xxs" fw={selected ? 700 : 500} c="inherit">
                {item.label}
              </Text>
            </UnstyledButton>
          )
        })}
      </Box>
    </Paper>
  )
}
