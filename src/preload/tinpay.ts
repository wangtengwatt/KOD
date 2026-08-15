import { TINPAY_IPC_CHANNELS, type TinpayHostApi } from '@shared/tinpay'
import { contextBridge, ipcRenderer } from 'electron'

const api: TinpayHostApi = {
  postMessage(message: unknown) {
    ipcRenderer.send(TINPAY_IPC_CHANNELS.event, message)
  },
}

contextBridge.exposeInMainWorld('tinpayHost', api)
