import type { ProviderModelInfo } from '@shared/types'
import { useCallback, useEffect, useMemo } from 'react'
import { createStore, useStore } from 'zustand'
import {
  applyKodRelayProvider,
  fetchKodRelayModels,
  getCompatibleKodRelayModels,
  getKodRelayBalance,
  isKodRelayModel,
  KOD_RELAY_FALLBACK_STORAGE_KEY,
  KOD_RELAY_PROVIDER_ID,
  KOD_RELAY_STORAGE_KEY,
  KodRelayConflictError,
  type KodRelayModelRequirement,
  type KodRelaySelection,
  type KodRelaySnapshot,
  pickKodRelayModel,
  readKodRelaySelection,
  relaySelectionFromBalance,
  releaseKodRelayKey,
  selectKodRelayKey,
  startKodRelayLogSync,
} from '@/packages/kodRelay'
import { getKodApiOrigin } from '@/packages/remote'
import { authInfoStore, useAuthInfoStore } from '@/stores/authInfoStore'
import { settingsStore } from '@/stores/settingsStore'

export type KodRelayNotice = 'conflict' | 'balance' | 'package' | 'unavailable' | null

export interface KodRelayRecommendation {
  requirement: KodRelayModelRequirement
  target: KodRelaySnapshot
  models: ProviderModelInfo[]
}

interface KodRelayState {
  selection: KodRelaySelection | null
  models: ProviderModelInfo[]
  loading: boolean
  notice: KodRelayNotice
  initializedToken: string | null
  fallback: KodRelaySnapshot | null
  recommendation: KodRelayRecommendation | null
}

export const kodRelayStore = createStore<KodRelayState>(() => ({
  selection: null,
  models: [],
  loading: false,
  notice: null,
  initializedToken: null,
  fallback: null,
  recommendation: null,
}))

let operationId = 0
let restorePromise: Promise<void> | null = null

function persistStoredSelection(key: string, selection: KodRelaySelection | null) {
  try {
    if (selection) localStorage.setItem(key, JSON.stringify(selection))
    else localStorage.removeItem(key)
  } catch {
    // Storage can be unavailable in restricted webviews.
  }
}

function commit(snapshot: KodRelaySnapshot | null, fallback: KodRelaySnapshot | null = null) {
  const selection = snapshot?.selection || null
  const models = snapshot?.models || []
  kodRelayStore.setState({ selection, models, fallback })
  persistStoredSelection(KOD_RELAY_STORAGE_KEY, selection)
  persistStoredSelection(KOD_RELAY_FALLBACK_STORAGE_KEY, fallback?.selection || null)
  settingsStore.setState((settings) => applyKodRelayProvider(settings, selection, models))
}

function setNotice(notice: KodRelayNotice) {
  kodRelayStore.setState({ notice })
}

function createSnapshot(
  selection: KodRelaySelection,
  models: ProviderModelInfo[],
  preferredModelId?: string,
  requirement?: KodRelayModelRequirement
): KodRelaySnapshot {
  const model = pickKodRelayModel(models, preferredModelId, requirement)
  if (!model) throw new Error(`Relay station has no model available for ${requirement?.label || 'chat'}`)
  return {
    selection: { ...selection, modelId: model.modelId },
    models,
  }
}

async function restoreSnapshot(
  snapshot: KodRelaySnapshot | null,
  fallback: KodRelaySnapshot | null,
  token: string | null,
  apiOrigin: string
) {
  if (!snapshot) {
    commit(null)
    return false
  }
  try {
    if (token) await selectKodRelayKey(apiOrigin, token, snapshot.selection)
    commit(snapshot, fallback)
    return true
  } catch (error) {
    console.warn('[Kod relay] failed to restore previous key', error)
    commit(null)
    return false
  }
}

export function clearKodRelayLocalState() {
  operationId += 1
  restorePromise = null
  kodRelayStore.setState({ initializedToken: null, loading: false, notice: null, recommendation: null })
  commit(null)
}

export async function clearKodRelay(release = true) {
  const currentOperation = ++operationId
  const token = authInfoStore.getState().accessToken
  commit(null)
  if (release && token) {
    try {
      await releaseKodRelayKey(getKodApiOrigin(), token)
    } catch (error) {
      console.warn('[Kod relay] failed to release key', error)
    }
  }
  return currentOperation === operationId
}

export async function selectKodRelay(selection: KodRelaySelection | null) {
  if (!selection) {
    await clearKodRelay()
    return
  }

  const token = authInfoStore.getState().accessToken
  const apiOrigin = getKodApiOrigin()
  const currentOperation = ++operationId
  const previousState = kodRelayStore.getState()
  const previous = previousState.selection ? { selection: previousState.selection, models: previousState.models } : null
  const previousFallback = previousState.fallback
  kodRelayStore.setState({ loading: true, notice: null, recommendation: null })

  try {
    if (token && previous) await releaseKodRelayKey(apiOrigin, token)
    if (currentOperation !== operationId) return

    let selectedOnServer = false
    try {
      if (token) {
        await selectKodRelayKey(apiOrigin, token, selection)
        selectedOnServer = true
      }
      const models = await fetchKodRelayModels(selection)
      if (currentOperation !== operationId) {
        if (selectedOnServer && token) await releaseKodRelayKey(apiOrigin, token).catch(() => undefined)
        return
      }
      const next = createSnapshot(selection, models, selection.modelId || previous?.selection.modelId)
      commit(next, previous)
    } catch (error) {
      if (selectedOnServer && token) {
        await releaseKodRelayKey(apiOrigin, token).catch((releaseError) =>
          console.warn('[Kod relay] failed to compensate selected key', releaseError)
        )
      }
      throw error
    }
  } catch (error) {
    if (currentOperation !== operationId) return
    await restoreSnapshot(previous, previousFallback, token, apiOrigin)
    if (error instanceof KodRelayConflictError) setNotice('conflict')
    else {
      setNotice('unavailable')
      console.warn('[Kod relay] failed to select key', error)
    }
  } finally {
    if (currentOperation === operationId) kodRelayStore.setState({ loading: false })
  }
}

export function selectKodRelayModel(modelId: string) {
  const state = kodRelayStore.getState()
  if (!state.selection || !state.models.some((model) => model.modelId === modelId)) return false
  commit(
    {
      selection: { ...state.selection, modelId },
      models: state.models,
    },
    state.fallback
  )
  kodRelayStore.setState({ recommendation: null })
  return true
}

export function clearKodRelayRecommendation() {
  kodRelayStore.setState({ recommendation: null })
}

export async function ensureKodRelayRequirement(requirement: KodRelayModelRequirement) {
  const state = kodRelayStore.getState()
  if (!state.selection) return

  const active = { selection: state.selection, models: state.models }
  const activeModel = pickKodRelayModel(state.models, state.selection.modelId)
  if (activeModel && getCompatibleKodRelayModels([activeModel], requirement).length > 0) return

  const recommendations = getCompatibleKodRelayModels(state.models, requirement)
  const recommendation: KodRelayRecommendation = {
    requirement,
    target: active,
    models: recommendations,
  }
  const token = authInfoStore.getState().accessToken
  const apiOrigin = getKodApiOrigin()
  const currentOperation = ++operationId
  kodRelayStore.setState({ loading: true, recommendation })

  try {
    if (token) await releaseKodRelayKey(apiOrigin, token)
    if (currentOperation !== operationId) return

    let fallback = state.fallback
    if (!fallback) {
      const storedFallback = readKodRelaySelection(localStorage, KOD_RELAY_FALLBACK_STORAGE_KEY)
      if (storedFallback) {
        const models = await fetchKodRelayModels(storedFallback)
        fallback = createSnapshot(storedFallback, models, storedFallback.modelId)
      }
    }

    if (fallback) {
      const fallbackModel = pickKodRelayModel(fallback.models, fallback.selection.modelId, requirement)
      if (fallbackModel) {
        const compatibleFallback: KodRelaySnapshot = {
          selection: { ...fallback.selection, modelId: fallbackModel.modelId },
          models: fallback.models,
        }
        if (token) await selectKodRelayKey(apiOrigin, token, compatibleFallback.selection)
        if (currentOperation !== operationId) return
        commit(compatibleFallback)
        kodRelayStore.setState({ recommendation })
        return
      }
    }

    commit(null)
    kodRelayStore.setState({ recommendation })
  } catch (error) {
    console.warn('[Kod relay] capability fallback failed', error)
    commit(null)
    kodRelayStore.setState({ recommendation })
  } finally {
    if (currentOperation === operationId) kodRelayStore.setState({ loading: false })
  }
}

export function ensureKodRelayRestored(token: string) {
  const state = kodRelayStore.getState()
  if (state.initializedToken === token && (state.selection === null || state.models.length > 0))
    return Promise.resolve()
  if (restorePromise && state.initializedToken === token) return restorePromise

  const currentOperation = ++operationId
  const apiOrigin = getKodApiOrigin()
  kodRelayStore.setState({ initializedToken: token, loading: true })
  restorePromise = (async () => {
    try {
      const stored = readKodRelaySelection(localStorage)
      const restored = stored || relaySelectionFromBalance(await getKodRelayBalance(apiOrigin, token))
      if (!restored) {
        if (currentOperation === operationId) commit(null)
        return
      }
      const models = await fetchKodRelayModels(restored)
      const fallbackSelection = readKodRelaySelection(localStorage, KOD_RELAY_FALLBACK_STORAGE_KEY)
      const fallbackModels = fallbackSelection ? await fetchKodRelayModels(fallbackSelection).catch(() => []) : []
      const fallback =
        fallbackSelection && fallbackModels.length > 0
          ? createSnapshot(fallbackSelection, fallbackModels, fallbackSelection.modelId)
          : null
      if (currentOperation === operationId) commit(createSnapshot(restored, models, restored.modelId), fallback)
    } catch (error) {
      if (currentOperation === operationId) {
        console.warn('[Kod relay] failed to restore selection', error)
        commit(null)
      }
    } finally {
      if (currentOperation === operationId) kodRelayStore.setState({ loading: false })
      restorePromise = null
    }
  })()
  return restorePromise
}

export function useKodRelay() {
  const accessToken = useAuthInfoStore((state) => state.accessToken)
  const state = useStore(kodRelayStore)
  const apiOrigin = getKodApiOrigin()

  useEffect(() => {
    if (accessToken) void ensureKodRelayRestored(accessToken)
    else clearKodRelayLocalState()
  }, [accessToken])

  const checkReadyAndStartSync = useCallback(async () => {
    const { selection, models } = kodRelayStore.getState()
    const token = authInfoStore.getState().accessToken
    if (!token || !selection || models.length === 0) {
      setNotice('unavailable')
      return false
    }
    try {
      const balance = await getKodRelayBalance(apiOrigin, token)
      if (balance.can_chat === false) {
        setNotice('balance')
        return false
      }
    } catch (error) {
      console.warn('[Kod relay] entitlement check failed', error)
      setNotice('unavailable')
      return false
    }
    void startKodRelayLogSync(apiOrigin, token).catch((error) =>
      console.warn('[Kod relay] failed to start log sync', error)
    )
    return true
  }, [apiOrigin])

  const modelFilter = useMemo(
    () => (model: ProviderModelInfo, providerId?: string) =>
      !state.selection || (state.models.length > 0 && isKodRelayModel(model, providerId)),
    [state.models.length, state.selection]
  )

  return {
    apiOrigin,
    ...state,
    setNotice,
    select: selectKodRelay,
    selectModel: selectKodRelayModel,
    clear: clearKodRelay,
    checkBalanceAndStartSync: checkReadyAndStartSync,
    modelFilter,
    providerId: KOD_RELAY_PROVIDER_ID,
  }
}
