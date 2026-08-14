import { ActionIcon, Box, Flex, Title } from '@mantine/core'
import { IconLayoutSidebarLeftExpand, IconMenu2 } from '@tabler/icons-react'
import clsx from 'clsx'
import type { FC } from 'react'
import useNeedRoomForWinControls from '@/hooks/useNeedRoomForWinControls'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { useUIStore } from '@/stores/uiStore'
import WindowControls from './WindowControls'

export type PageProps = {
  children?: React.ReactNode
  title: string | React.ReactNode
  left?: React.ReactNode
  right?: React.ReactNode
}

export const Page: FC<PageProps> = ({ children, title, left, right }) => {
  const showSidebar = useUIStore((s) => s.showSidebar)
  const setShowSidebar = useUIStore((s) => s.setShowSidebar)
  const isSmallScreen = useIsSmallScreen()
  const { needRoomForMacWindowControls } = useNeedRoomForWinControls()
  return (
    <div className="flex flex-col h-full">
      <Flex
        h={48}
        align="center"
        px="md"
        className={clsx('title-bar', isSmallScreen ? 'bg-kod-background-primary' : '')}
      >
        {isSmallScreen && !showSidebar && (
          <Flex align="center" className={needRoomForMacWindowControls ? 'pl-20' : ''}>
            <ActionIcon
              className="controls"
              aria-label="Open navigation"
              data-testid="page-menu-button"
              variant="subtle"
              size="lg"
              color="kod-secondary"
              mr="xs"
              onClick={() => setShowSidebar(true)}
            >
              <IconMenu2 />
            </ActionIcon>
          </Flex>
        )}
        {left}
        {!isSmallScreen && !showSidebar && (
          <Flex align="center" className={needRoomForMacWindowControls ? 'pl-20' : ''}>
            <ActionIcon
              className="controls"
              aria-label="Open navigation"
              data-testid="page-menu-button-desktop"
              variant="subtle"
              size={20}
              color="kod-tertiary"
              mr="xs"
              onClick={() => setShowSidebar(true)}
            >
              <IconLayoutSidebarLeftExpand />
            </ActionIcon>
          </Flex>
        )}

        <Flex align="center" gap={'xxs'} flex={1} {...(isSmallScreen ? { justify: 'center', px: 'sm' } : {})}>
          {typeof title === 'string' ? (
            <Title order={4} fz={!isSmallScreen ? 18 : undefined} lineClamp={1}>
              {title}
            </Title>
          ) : (
            title
          )}
        </Flex>
        {right}
        {!isSmallScreen && <WindowControls className="-mr-3 ml-2" />}
        {isSmallScreen && !right && <Box w={36} />}
      </Flex>

      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  )
}

export default Page
