import type { VideoGeneration } from '@shared/types'
import { useQuery } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import { createStore, useStore } from 'zustand'
import storage from '@/storage'
import { deriveAccountKey } from '@/storage/accountKey'
import { authInfoStore, useAuthInfoStore } from '@/stores/authInfoStore'
import { queryClient } from './queryClient'

export const VIDEO_GEN_QUERY_KEY = 'video-generation'
export const VIDEO_GEN_LIST_QUERY_KEY = 'video-generation-list'
const VIDEO_HISTORY_VERSION = 1

interface VideoGenerationUIState {
  currentGeneratingId: string | null
  currentRecordId: string | null
}

export const videoGenerationStore = createStore<VideoGenerationUIState>(() => ({
  currentGeneratingId: null,
  currentRecordId: null,
}))

function accountKey(ownerEmail: string | null = authInfoStore.getState().loginEmail) {
  const email = ownerEmail
  return email ? deriveAccountKey(email) : 'anonymous'
}

function historyKey(ownerEmail?: string | null) {
  return `kod-video-generation:v${VIDEO_HISTORY_VERSION}:${accountKey(ownerEmail)}`
}

function readRecords(ownerEmail?: string | null): VideoGeneration[] {
  try {
    const value = localStorage.getItem(historyKey(ownerEmail))
    if (!value) return []
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? (parsed as VideoGeneration[]) : []
  } catch {
    return []
  }
}

function writeRecords(records: VideoGeneration[], ownerEmail?: string | null) {
  localStorage.setItem(historyKey(ownerEmail), JSON.stringify(records))
}

export function listVideoRecords(ownerEmail?: string | null) {
  return readRecords(ownerEmail).sort((left, right) => right.createdAt - left.createdAt)
}

export function getVideoRecord(id: string, ownerEmail?: string | null) {
  return readRecords(ownerEmail).find((record) => record.id === id) ?? null
}

export function createVideoRecord(input: Omit<VideoGeneration, 'id' | 'createdAt' | 'status' | 'generatedVideos'>) {
  const record: VideoGeneration = {
    ...input,
    id: uuidv4(),
    createdAt: Date.now(),
    status: 'pending',
    generatedVideos: [],
  }
  writeRecords([record, ...readRecords()])
  return record
}

export function updateVideoRecord(id: string, updates: Partial<VideoGeneration>, ownerEmail?: string | null) {
  let updated: VideoGeneration | null = null
  const records = readRecords(ownerEmail).map((record) => {
    if (record.id !== id) return record
    updated = { ...record, ...updates }
    return updated
  })
  if (updated) writeRecords(records, ownerEmail)
  return updated
}

export async function deleteVideoRecord(id: string) {
  const records = readRecords()
  const record = records.find((item) => item.id === id)
  writeRecords(records.filter((item) => item.id !== id))
  if (record) {
    const keys = [...new Set([...record.referenceImages, ...record.generatedVideos])]
    await Promise.all(
      keys
        .filter((key) => key.startsWith('picture:video-creator-ref:') || key.startsWith('video:video-gen:'))
        .map((key) => storage.delBlob(key).catch(() => undefined))
    )
  }
  if (videoGenerationStore.getState().currentRecordId === id) {
    videoGenerationStore.setState({ currentRecordId: null })
  }
  await queryClient.invalidateQueries({ queryKey: [VIDEO_GEN_LIST_QUERY_KEY] })
}

export function useVideoGenerationHistory() {
  const loginEmail = useAuthInfoStore((state) => state.loginEmail)
  return useQuery({
    queryKey: [VIDEO_GEN_LIST_QUERY_KEY, loginEmail || 'anonymous'],
    queryFn: () => listVideoRecords(loginEmail),
  })
}

export function useVideoGenerationRecord(id: string | null) {
  const loginEmail = useAuthInfoStore((state) => state.loginEmail)
  return useQuery({
    queryKey: [VIDEO_GEN_QUERY_KEY, loginEmail || 'anonymous', id],
    queryFn: () => (id ? getVideoRecord(id, loginEmail) : null),
    enabled: Boolean(id),
  })
}

export function useCurrentGeneratingId() {
  return useStore(videoGenerationStore, (state) => state.currentGeneratingId)
}

export function useCurrentVideoRecordId() {
  return useStore(videoGenerationStore, (state) => state.currentRecordId)
}

export function selectVideoRecord(id: string | null) {
  videoGenerationStore.setState({ currentRecordId: id })
}
