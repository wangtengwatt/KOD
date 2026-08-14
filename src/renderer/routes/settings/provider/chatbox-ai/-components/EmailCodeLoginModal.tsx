import { Alert, Anchor, Button, Checkbox, Flex, PasswordInput, Select, Stack, Text, TextInput } from '@mantine/core'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/layout/Overlay'
import { loginWithKod, sendKodEmailCode } from '@/packages/remote'
import {
  deleteSavedLoginAccount,
  listSavedLoginAccounts,
  type SavedLoginAccount,
  saveLoginAccount,
} from '@/packages/savedLoginAccounts'
import type { AuthTokens } from './types'

interface EmailCodeLoginModalProps {
  opened: boolean
  onClose: () => void
  language: string
  onLoginSuccess: (tokens: AuthTokens) => Promise<void>
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

export function EmailCodeLoginModal({ opened, onClose, onLoginSuccess }: EmailCodeLoginModalProps) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [isFirstLogin, setIsFirstLogin] = useState(true)
  const [emailCode, setEmailCode] = useState('')
  const [codeSending, setCodeSending] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [savedAccounts, setSavedAccounts] = useState<SavedLoginAccount[]>([])
  const [selectedSavedEmail, setSelectedSavedEmail] = useState<string | null>(null)
  const [rememberCredentials, setRememberCredentials] = useState(false)
  const [passwordStorageAvailable, setPasswordStorageAvailable] = useState(false)
  const [savedAccountsLoading, setSavedAccountsLoading] = useState(false)

  const applySavedAccount = useCallback((account: SavedLoginAccount | undefined) => {
    if (!account) {
      setSelectedSavedEmail(null)
      setEmail('')
      setPassword('')
      setRememberCredentials(false)
      return
    }
    setSelectedSavedEmail(account.email)
    setEmail(account.email)
    setPassword(account.password || '')
    setIsFirstLogin(false)
    setInvitationCode('')
    setEmailCode('')
    setRememberCredentials(true)
  }, [])

  useEffect(() => {
    if (!opened) return
    let active = true
    setSavedAccountsLoading(true)
    void listSavedLoginAccounts()
      .then((result) => {
        if (!active) return
        setSavedAccounts(result.accounts)
        setPasswordStorageAvailable(result.passwordStorageAvailable)
        applySavedAccount(result.accounts[0])
      })
      .catch(() => {
        if (!active) return
        setSavedAccounts([])
        setPasswordStorageAvailable(false)
      })
      .finally(() => {
        if (active) setSavedAccountsLoading(false)
      })
    return () => {
      active = false
    }
  }, [applySavedAccount, opened])

  const handleClose = useCallback(() => {
    setEmail('')
    setPassword('')
    setInvitationCode('')
    setEmailCode('')
    setIsFirstLogin(true)
    setCodeSent(false)
    setError('')
    setIsSubmitting(false)
    setSelectedSavedEmail(null)
    setRememberCredentials(false)
    onClose()
  }, [onClose])

  const handleSavedAccountChange = useCallback(
    (nextEmail: string | null) => {
      applySavedAccount(savedAccounts.find((item) => item.email === nextEmail))
      setError('')
    },
    [applySavedAccount, savedAccounts]
  )

  const handleDeleteSavedAccount = useCallback(async () => {
    if (!selectedSavedEmail || isSubmitting) return
    const confirmed = window.confirm(
      t('Delete saved login for {{email}}?', { email: selectedSavedEmail }) ||
        `Delete saved login for ${selectedSavedEmail}?`
    )
    if (!confirmed) return
    try {
      const result = await deleteSavedLoginAccount(selectedSavedEmail)
      setSavedAccounts(result.accounts)
      setPasswordStorageAvailable(result.passwordStorageAvailable)
      applySavedAccount(result.accounts[0])
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, t('Failed to update saved accounts') || 'Failed to update saved accounts'))
    }
  }, [applySavedAccount, isSubmitting, selectedSavedEmail, t])

  const handleRememberChange = useCallback(
    async (checked: boolean) => {
      if (!checked && selectedSavedEmail) {
        const confirmed = window.confirm(
          t('Turning this off will delete the saved login for {{email}}. Continue?', {
            email: selectedSavedEmail,
          }) || `Turning this off will delete the saved login for ${selectedSavedEmail}. Continue?`
        )
        if (!confirmed) return
        try {
          const result = await deleteSavedLoginAccount(selectedSavedEmail)
          setSavedAccounts(result.accounts)
          setPasswordStorageAvailable(result.passwordStorageAvailable)
          setSelectedSavedEmail(null)
        } catch (deleteError) {
          setError(
            getErrorMessage(deleteError, t('Failed to update saved accounts') || 'Failed to update saved accounts')
          )
          return
        }
      }
      setRememberCredentials(checked)
    },
    [selectedSavedEmail, t]
  )

  const handleSendCode = useCallback(async () => {
    if (!email.trim()) {
      setError(t('Please enter your email address') || 'Please enter your email address')
      return
    }
    setCodeSending(true)
    setError('')
    try {
      await sendKodEmailCode(email.trim())
      setCodeSent(true)
    } catch (error) {
      setError(getErrorMessage(error, t('Failed to send verification code') || '发送验证码失败'))
    } finally {
      setCodeSending(false)
    }
  }, [email, t])

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return

    if (!email.trim()) {
      setError(t('Please enter your email address') || 'Please enter your email address')
      return
    }
    if (!password) {
      setError(t('Please enter password') || 'Please enter password')
      return
    }
    if (isFirstLogin && !invitationCode.trim()) {
      setError(t('Invitation code is required for first login') || 'Invitation code is required for first login')
      return
    }
    if (isFirstLogin && !emailCode.trim()) {
      setError(t('Please enter verification code') || '请输入邮箱验证码')
      return
    }

    setError('')
    setIsSubmitting(true)
    try {
      const tokens = await loginWithKod({
        email: email.trim(),
        password,
        inviteCode: isFirstLogin ? invitationCode.trim() : undefined,
        emailCode: isFirstLogin ? emailCode.trim() : undefined,
      })
      await onLoginSuccess({ ...tokens, email: email.trim() })
      try {
        if (rememberCredentials) {
          await saveLoginAccount(email, password)
        } else {
          await deleteSavedLoginAccount(email)
        }
      } catch (storageError) {
        console.warn('[KOD Login] Failed to update saved login accounts', storageError)
      }
      handleClose()
    } catch (error) {
      setError(getErrorMessage(error, t('Login failed') || 'Login failed'))
    } finally {
      setIsSubmitting(false)
    }
  }, [
    email,
    emailCode,
    handleClose,
    invitationCode,
    isFirstLogin,
    isSubmitting,
    onLoginSuccess,
    password,
    rememberCredentials,
    t,
  ])

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      centered
      size="md"
      title={t('Login to KOD AI')}
      closeOnClickOutside={false}
      closeOnEscape={false}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void handleSubmit()
        }}
      >
        <Stack gap="md">
          <Text size="sm" c="chatbox-secondary">
            {t('Login requires email and password. Invitation code is required for first login.')}
          </Text>

          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}

          {savedAccounts.length > 0 && (
            <Flex gap="sm" align="flex-end">
              <Select
                style={{ flex: 1 }}
                label={t('Saved accounts')}
                placeholder={t('Select a saved account') || 'Select a saved account'}
                data={savedAccounts.map((item) => ({ value: item.email, label: item.email }))}
                value={selectedSavedEmail}
                onChange={handleSavedAccountChange}
                allowDeselect={false}
                searchable
                disabled={isSubmitting || savedAccountsLoading}
              />
              <Button
                type="button"
                color="red"
                variant="light"
                onClick={() => void handleDeleteSavedAccount()}
                disabled={!selectedSavedEmail || isSubmitting}
              >
                {t('Delete')}
              </Button>
            </Flex>
          )}

          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t('Email')}
            </Text>
            <TextInput
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(event) => {
                setEmail(event.currentTarget.value)
                if (event.currentTarget.value.trim().toLowerCase() !== selectedSavedEmail) {
                  setSelectedSavedEmail(null)
                }
              }}
              name="email"
              autoComplete="username"
              disabled={isSubmitting}
            />
          </Stack>

          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t('Password')}
            </Text>
            <PasswordInput
              placeholder={t('Enter password') || 'Enter password'}
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              name="password"
              autoComplete={isFirstLogin ? 'new-password' : 'current-password'}
              disabled={isSubmitting}
            />
          </Stack>

          <Stack gap={4}>
            <Checkbox
              label={
                passwordStorageAvailable
                  ? t('Remember account and password')
                  : t('Remember email (password managed by your browser or system)')
              }
              checked={rememberCredentials}
              onChange={(event) => void handleRememberChange(event.currentTarget.checked)}
              disabled={isSubmitting || savedAccountsLoading}
            />
            <Text size="xs" c="chatbox-tertiary">
              {passwordStorageAvailable
                ? t('The password is encrypted by the operating system and is never stored as plaintext.')
                : t('This platform stores email addresses only and never stores your password.')}
            </Text>
          </Stack>

          <Checkbox
            label={t('First login / create account')}
            checked={isFirstLogin}
            onChange={(event) => setIsFirstLogin(event.currentTarget.checked)}
            disabled={isSubmitting}
          />

          <Stack gap="xs" style={{ opacity: isFirstLogin ? 1 : 0.65 }}>
            <Text size="sm" fw={500}>
              {t('Invitation code')}
            </Text>
            <TextInput
              placeholder={t('Enter invitation code') || 'Enter invitation code'}
              value={invitationCode}
              onChange={(event) => setInvitationCode(event.currentTarget.value)}
              autoComplete="one-time-code"
              disabled={!isFirstLogin || isSubmitting}
            />
            <Text size="xs" c="chatbox-tertiary">
              {t('Invitation code is required for first login')}
            </Text>
          </Stack>

          {isFirstLogin && (
            <Stack gap="xs">
              <Flex align="flex-end" gap="sm">
                <Stack gap={4} style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>
                    {t('Verification code')}
                  </Text>
                  <TextInput
                    placeholder="123456"
                    value={emailCode}
                    onChange={(event) => setEmailCode(event.currentTarget.value)}
                    maxLength={6}
                    disabled={isSubmitting}
                  />
                </Stack>
                <Button
                  type="button"
                  size="sm"
                  variant="light"
                  onClick={() => void handleSendCode()}
                  loading={codeSending}
                  disabled={isSubmitting || codeSending || !email.trim()}
                >
                  {codeSent ? t('Resend') : t('Send code')}
                </Button>
              </Flex>
              {codeSent && (
                <Text size="xs" c="chatbox-tertiary">
                  {t('Verification code sent, valid for 5 minutes')}
                </Text>
              )}
            </Stack>
          )}

          <Text size="xs" c="chatbox-tertiary">
            {t('By continuing, you agree to our')}{' '}
            <Anchor size="xs" href="https://kod.kai.com/terms" target="_blank" underline="hover">
              {t('Terms of Service')}
            </Anchor>
            . {t('Read our')}{' '}
            <Anchor size="xs" href="https://kod.kai.com/privacy" target="_blank" underline="hover">
              {t('Privacy Policy')}
            </Anchor>
            .
          </Text>

          <Flex gap="sm" justify="flex-end" align="center">
            <Button type="button" color="chatbox-gray" variant="light" onClick={handleClose} disabled={isSubmitting}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {t('Login to KOD AI')}
            </Button>
          </Flex>
        </Stack>
      </form>
    </Modal>
  )
}
