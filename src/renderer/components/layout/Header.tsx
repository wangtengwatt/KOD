import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Badge, Flex, Text, Tooltip } from '@mantine/core'
import type { Session } from '@shared/types'
import { IconLayoutSidebarLeftExpand, IconMenu2, IconPencil } from '@tabler/icons-react'
import clsx from 'clsx'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import useNeedRoomForWinControls from '@/hooks/useNeedRoomForWinControls'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { scheduleGenerateNameAndThreadName, scheduleGenerateThreadName } from '@/stores/sessionActions'
import * as settingActions from '@/stores/settingActions'
import { useUIStore } from '@/stores/uiStore'
import Divider from '../common/Divider'
import { ScalableIcon } from '../common/ScalableIcon'
import Toolbar from './Toolbar'
import WindowControls from './WindowControls'

export default function Header(props: { session: Session }) {
  const { t } = useTranslation()
  const showSidebar = useUIStore((s) => s.showSidebar)
  const setShowSidebar = useUIStore((s) => s.setShowSidebar)

  const isSmallScreen = useIsSmallScreen()
  const { needRoomForMacWindowControls } = useNeedRoomForWinControls()

  const { session: currentSession } = props

  useEffect(() => {
    const autoGenerateTitle = settingActions.getAutoGenerateTitle()
    if (!autoGenerateTitle) {
      return
    }

    const hasGeneratingMessage = currentSession.messages.some((msg) => msg.generating)

    if (hasGeneratingMessage || currentSession.messages.length < 2) {
      return
    }

    if (currentSession.name === 'Untitled') {
      scheduleGenerateNameAndThreadName(currentSession.id)
    } else if (!currentSession.threadName) {
      scheduleGenerateThreadName(currentSession.id)
    }
  }, [currentSession])

  const editCurrentSession = () => {
    if (!currentSession) {
      return
    }
    NiceModal.show('session-settings', { session: currentSession })
  }

  return (
    <>
      <Flex
        h={48}
        align="center"
        px="md"
        className={clsx('flex-none title-bar', isSmallScreen ? 'bg-kod-background-primary' : '')}
      >
        {(!showSidebar || isSmallScreen) && (
          <Flex align="center" className={needRoomForMacWindowControls ? 'pl-20' : ''}>
            <ActionIcon
              className="controls"
              aria-label="Open navigation"
              data-testid="header-menu-button"
              variant="subtle"
              size={isSmallScreen ? 'lg' : 20}
              color={isSmallScreen ? 'kod-secondary' : 'kod-tertiary'}
              mr="xs"
              onClick={() => setShowSidebar(!showSidebar)}
            >
              {isSmallScreen ? <IconMenu2 /> : <IconLayoutSidebarLeftExpand />}
            </ActionIcon>
          </Flex>
        )}

        <Flex align="center" flex={1} className="min-w-0" justify={isSmallScreen ? 'center' : 'flex-start'}>
          <Text fw={600} size={isSmallScreen ? '17px' : '18px'} lineClamp={1}>
            {currentSession?.name}
          </Text>
          {!isSmallScreen && currentSession?.threadName && currentSession.threadName !== currentSession.name && (
            <Badge
              size="xs"
              variant="light"
              color="gray"
              ml={6}
              maw={180}
              className="flex-shrink-0"
              classNames={{ label: 'truncate' }}
            >
              {currentSession.threadName}
            </Badge>
          )}
          <Tooltip label={t('Customize settings for the current conversation')}>
            <ActionIcon
              className="controls"
              variant="subtle"
              color="kod-tertiary"
              size={isSmallScreen ? 'md' : 16}
              ml={4}
              onClick={editCurrentSession}
            >
              <ScalableIcon icon={IconPencil} size={14} />
            </ActionIcon>
          </Tooltip>
        </Flex>

        <Toolbar sessionId={currentSession.id} />

        {!isSmallScreen && <WindowControls className="-mr-3 ml-2" />}
      </Flex>

      <Divider />
    </>
  )
}
