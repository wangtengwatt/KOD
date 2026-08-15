export const SUANBAO_IPC_CHANNELS = {
  getCapabilities: 'suanbao:get-capabilities',
  getBootstrap: 'suanbao:get-bootstrap',
  dispatchCommand: 'suanbao:dispatch-command',
  confirmOperation: 'suanbao:confirm-operation',
  cancelOperation: 'suanbao:cancel-operation',
  updatePlacement: 'suanbao:update-placement',
  setInteractiveRegion: 'suanbao:set-interactive-region',
  setEnabled: 'suanbao:set-enabled',
  show: 'suanbao:show',
  hide: 'suanbao:hide',
  minimize: 'suanbao:minimize',
  openMainWindow: 'suanbao:open-main-window',
  publishBootstrap: 'suanbao:publish-bootstrap',
  publishViewModel: 'suanbao:publish-view-model',
  hostCommand: 'suanbao:host-command',
  viewModelChanged: 'suanbao:view-model-changed',
  notificationClicked: 'suanbao:notification-clicked',
} as const

export type SuanbaoIpcChannel = (typeof SUANBAO_IPC_CHANNELS)[keyof typeof SUANBAO_IPC_CHANNELS]
