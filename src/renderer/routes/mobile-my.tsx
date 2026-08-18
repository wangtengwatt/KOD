import { Button, Card, Group, SegmentedControl, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import type { Language } from '@shared/types'
import { IconLogout, IconSettings, IconSwitch, IconUserCircle, IconWallet } from '@tabler/icons-react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Page from '@/components/layout/Page'
import { languageNameMap, languages } from '@/i18n/locales'
import { EmailCodeLoginModal } from '@/routes/settings/provider/chatbox-ai/-components/EmailCodeLoginModal'
import type { AuthTokens } from '@/routes/settings/provider/chatbox-ai/-components/types'
import { useAuthTokens } from '@/routes/settings/provider/chatbox-ai/-components/useAuthTokens'
import { useAuthInfoStore } from '@/stores/authInfoStore'
import { useLanguage, useSettingsStore } from '@/stores/settingsStore'

export const Route = createFileRoute('/mobile-my')({ component: MobileMyPage })

function MobileMyPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const language = useLanguage()
  const setSettings = useSettingsStore((state) => state.setSettings)
  const email = useAuthInfoStore((state) => state.loginEmail)
  const { isLoggedIn, clearAuthTokens, saveAuthTokens } = useAuthTokens()
  const [switchAccountOpened, setSwitchAccountOpened] = useState(false)

  const switchAccount = async (tokens: AuthTokens) => {
    clearAuthTokens()
    await saveAuthTokens(tokens)
    setSwitchAccountOpened(false)
  }

  const logout = () => {
    if (!window.confirm(String(t('Are you sure you want to log out?')))) return
    clearAuthTokens()
  }

  return (
    <Page title={t('Mine')}>
      <Stack p="md" pb="calc(5.5rem + var(--mobile-safe-area-inset-bottom, 0px))" gap="md">
        <Card withBorder radius="lg" padding="lg">
          <Stack gap="md">
            <Group wrap="nowrap" align="flex-start">
              <ThemeIcon size={44} radius="xl" variant="light">
                <IconUserCircle size={26} />
              </ThemeIcon>
              <div>
                <Title order={4}>{email || t('Not logged in to KOD')}</Title>
                <Text size="sm" c="kod-tertiary">
                  {t('The Android app and desktop app use the same KOD account.')}
                </Text>
              </div>
            </Group>

            <Group justify="flex-end" gap="xs">
              <Button
                size="xs"
                variant="light"
                leftSection={<IconSwitch size={16} />}
                onClick={() => setSwitchAccountOpened(true)}
              >
                {isLoggedIn ? t('Switch account') : t('Login to KOD AI')}
              </Button>
              {isLoggedIn && (
                <Button size="xs" variant="light" color="red" leftSection={<IconLogout size={16} />} onClick={logout}>
                  {t('Log out')}
                </Button>
              )}
            </Group>
          </Stack>
        </Card>

        <Card withBorder radius="md" padding="md">
          <Text fw={700} mb="xs">
            {t('Language')}
          </Text>
          <SegmentedControl
            fullWidth
            value={language}
            onChange={(value) => setSettings({ language: value as Language })}
            data={languages.map((value) => ({ value, label: languageNameMap[value] }))}
          />
        </Card>

        <SimpleGrid cols={2} spacing="sm">
          <Button
            variant="light"
            leftSection={<IconWallet size={18} />}
            onClick={() => navigate({ to: '/settings/wallet' })}
          >
            {t('RMB Wallet')}
          </Button>
          <Button
            variant="light"
            leftSection={<IconSettings size={18} />}
            onClick={() => navigate({ to: '/settings' })}
          >
            {t('Settings')}
          </Button>
        </SimpleGrid>
      </Stack>

      <EmailCodeLoginModal
        opened={switchAccountOpened}
        onClose={() => setSwitchAccountOpened(false)}
        language={language}
        onLoginSuccess={switchAccount}
      />
    </Page>
  )
}
