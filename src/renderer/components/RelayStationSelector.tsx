import { Loader, Select, Text } from '@mantine/core'
import { IconKey, IconServer } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  KOD_STATIONS_STORAGE_KEY,
  type KodRelayKey,
  type KodRelaySelection,
  type KodRelayStation,
  listKodRelayKeys,
  listKodRelayStations,
} from '@/packages/kodRelay'
import { canSelectRelayKey, getRelaySelection, getRelayStationChange } from '@/packages/relaySelectorState'

interface RelayStationSelectorProps {
  apiBaseUrl: string
  onSelect: (selection: KodRelaySelection | null) => void | Promise<void>
  selectedStationId?: number | null
  selectedApiKeyId?: number | null
  loading?: boolean
}

interface DisplayKey extends KodRelayKey {
  displayIndex: number
}

function readCachedStations(): KodRelayStation[] {
  try {
    const value = localStorage.getItem(KOD_STATIONS_STORAGE_KEY)
    const parsed = value ? JSON.parse(value) : null
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function RelayStationSelector({
  apiBaseUrl,
  onSelect,
  selectedStationId,
  selectedApiKeyId,
  loading = false,
}: RelayStationSelectorProps) {
  const { t } = useTranslation()
  const [stations, setStations] = useState<KodRelayStation[]>(readCachedStations)
  const [keys, setKeys] = useState<DisplayKey[]>([])
  const [pendingStationId, setPendingStationId] = useState<number | null>(selectedStationId || null)
  const [pendingKeyId, setPendingKeyId] = useState<number | null>(selectedApiKeyId || null)
  const [loadingStations, setLoadingStations] = useState(false)
  const [loadingKeys, setLoadingKeys] = useState(false)
  const keysRequest = useRef(0)
  const wasSelecting = useRef(false)

  useEffect(() => setPendingStationId(selectedStationId || null), [selectedStationId])
  useEffect(() => setPendingKeyId(selectedApiKeyId || null), [selectedApiKeyId])
  useEffect(() => {
    if (wasSelecting.current && !loading) {
      setPendingStationId(selectedStationId || null)
      setPendingKeyId(selectedApiKeyId || null)
    }
    wasSelecting.current = loading
  }, [loading, selectedApiKeyId, selectedStationId])

  useEffect(() => {
    const controller = new AbortController()
    setLoadingStations(true)
    void listKodRelayStations(apiBaseUrl, controller.signal)
      .then((items) => {
        setStations(items)
        try {
          localStorage.setItem(KOD_STATIONS_STORAGE_KEY, JSON.stringify(items))
        } catch {
          // The selector still works when local storage is unavailable.
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.warn('[Kod relay] failed to load stations', error)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingStations(false)
      })
    return () => controller.abort()
  }, [apiBaseUrl])

  useEffect(() => {
    const request = ++keysRequest.current
    if (!pendingStationId) {
      setKeys([])
      setLoadingKeys(false)
      return
    }
    const controller = new AbortController()
    setLoadingKeys(true)
    void listKodRelayKeys(apiBaseUrl, pendingStationId, controller.signal)
      .then((items) => {
        if (request !== keysRequest.current) return
        const sorted = [...items].sort((a, b) => a.id - b.id)
        const indexes = new Map(sorted.map((item, index) => [item.id, index + 1]))
        setKeys(
          sorted
            .sort((a, b) => a.status - b.status || a.id - b.id)
            .map((item) => ({ ...item, displayIndex: indexes.get(item.id) || 0 }))
        )
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.warn('[Kod relay] failed to load keys', error)
      })
      .finally(() => {
        if (!controller.signal.aborted && request === keysRequest.current) setLoadingKeys(false)
      })
    return () => controller.abort()
  }, [apiBaseUrl, pendingStationId])

  const handleStationChange = useCallback(
    (value: string | null) => {
      const change = getRelayStationChange(value, stations)
      setPendingStationId(change.stationId)
      setPendingKeyId(null)
      setKeys([])
      if (change.shouldClearRelay) void onSelect(null)
    },
    [onSelect, stations]
  )

  const handleKeyChange = useCallback(
    (value: string | null) => {
      setPendingKeyId(value ? Number(value) : null)
      void onSelect(getRelaySelection(pendingStationId, value, stations, keys))
    },
    [keys, onSelect, pendingStationId, stations]
  )

  const stationOptions = useMemo(
    () => stations.map((station) => ({ value: String(station.id), label: station.url })),
    [stations]
  )

  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto sm:flex-nowrap">
      <Select
        placeholder={t('Switch Relay Station') || undefined}
        leftSection={loadingStations ? <Loader size={14} /> : <IconServer size={16} />}
        data={stationOptions}
        value={pendingStationId ? String(pendingStationId) : null}
        onChange={handleStationChange}
        disabled={loadingStations || loading}
        searchable
        clearable
        size="xs"
        className="min-w-[180px] flex-1 sm:flex-none"
      />
      <Select
        placeholder={t('Switch Node') || undefined}
        leftSection={loadingKeys || loading ? <Loader size={14} /> : <IconKey size={16} />}
        data={keys.map((key) => ({
          value: String(key.id),
          label: `${t('Node')}${key.displayIndex}`,
          disabled: key.status === 1 && key.id !== selectedApiKeyId,
        }))}
        value={pendingKeyId ? String(pendingKeyId) : null}
        onChange={handleKeyChange}
        disabled={!canSelectRelayKey(pendingStationId, loadingKeys, loading)}
        clearable
        size="xs"
        className="min-w-[130px] flex-1 sm:flex-none"
        renderOption={({ option }) => {
          const key = keys.find((item) => String(item.id) === option.value)
          const selected = key?.id === selectedApiKeyId
          const occupied = key?.status === 1 && !selected
          return (
            <div className="flex items-center gap-1.5" style={{ opacity: occupied ? 0.4 : 1 }}>
              <span
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ backgroundColor: key?.status === 0 ? '#22c55e' : '#ef4444' }}
              />
              <Text size="xs">
                {t('Node')}
                {key?.displayIndex}
                {selected && <span className="ml-1 font-semibold text-indigo-600">{t('Selected')}</span>}
                {occupied && <span className="ml-1 text-gray-500">{t('Occupied')}</span>}
              </Text>
            </div>
          )
        }}
      />
    </div>
  )
}
