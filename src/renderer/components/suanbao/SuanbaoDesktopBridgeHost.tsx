import type { SuanbaoBootstrap, SuanbaoHostRequest, SuanbaoViewModel } from '@shared/types/suanbao'
import { useEffect, useMemo, useRef } from 'react'
import { createSuanbaoHostBridge, type SuanbaoHostBridge } from '@/packages/suanbao/host-bridge'

export interface SuanbaoDesktopBridgeHostProps {
  bootstrap: SuanbaoBootstrap
  viewModel: SuanbaoViewModel
  onCommand(request: SuanbaoHostRequest): void
  onIntegrationError?(error: Error): void
  bridge?: SuanbaoHostBridge | null
}

/**
 * Connects the main renderer business host to the isolated Electron pet window.
 * It intentionally renders no UI and does not know about chat stores or task orchestration.
 */
export function SuanbaoDesktopBridgeHost({
  bootstrap,
  viewModel,
  onCommand,
  onIntegrationError,
  bridge: suppliedBridge,
}: SuanbaoDesktopBridgeHostProps) {
  const bridge = useMemo(
    () => suppliedBridge ?? createSuanbaoHostBridge(typeof window === 'undefined' ? undefined : window.electronAPI),
    [suppliedBridge]
  )
  const commandHandler = useRef(onCommand)
  const errorHandler = useRef(onIntegrationError)
  commandHandler.current = onCommand
  errorHandler.current = onIntegrationError

  useEffect(() => {
    if (!bridge) return
    return bridge.subscribe((request) => commandHandler.current(request))
  }, [bridge])

  useEffect(() => {
    if (!bridge) return
    void bridge.publishBootstrap(bootstrap).catch((error: unknown) => {
      errorHandler.current?.(error instanceof Error ? error : new Error(String(error)))
    })
  }, [bridge, bootstrap])

  useEffect(() => {
    if (!bridge) return
    void bridge.publishViewModel(viewModel).catch((error: unknown) => {
      errorHandler.current?.(error instanceof Error ? error : new Error(String(error)))
    })
  }, [bridge, viewModel])

  return null
}
