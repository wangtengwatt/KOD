// @vitest-environment jsdom

import type { VideoGeneration } from '@shared/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { deriveAccountKey } from '@/storage/accountKey'

vi.mock('@/stores/authInfoStore', () => ({
  authInfoStore: {
    getState: () => ({ loginEmail: 'account-b@example.com' }),
  },
  useAuthInfoStore: (selector: (state: { loginEmail: string }) => unknown) =>
    selector({ loginEmail: 'account-a@example.com' }),
}))

import { useVideoGenerationHistory, VIDEO_GEN_LIST_QUERY_KEY } from './videoGenerationStore'

function record(id: string, createdAt: number): VideoGeneration {
  return {
    id,
    createdAt,
    status: 'done',
    prompt: id,
    referenceImages: [],
    generatedVideos: [],
    model: { provider: 'kod', modelId: 'server-video' },
    duration: 5,
    resolution: '720p',
    ratio: '16:9',
  }
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(
    `kod-video-generation:v1:${deriveAccountKey('account-a@example.com')}`,
    JSON.stringify([record('video-a', 1)])
  )
  localStorage.setItem(
    `kod-video-generation:v1:${deriveAccountKey('account-b@example.com')}`,
    JSON.stringify([record('video-b', 2)])
  )
})

it('binds a video-history query function to the account embedded in its query key', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  const { result } = renderHook(() => useVideoGenerationHistory(), { wrapper })

  await waitFor(() => expect(result.current.data).toEqual([expect.objectContaining({ id: 'video-a' })]))
  expect(queryClient.getQueryData([VIDEO_GEN_LIST_QUERY_KEY, 'account-a@example.com'])).toEqual([
    expect.objectContaining({ id: 'video-a' }),
  ])
})
