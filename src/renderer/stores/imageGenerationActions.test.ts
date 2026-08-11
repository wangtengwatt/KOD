import { BaseError } from '@shared/models/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const paintMock = vi.fn()
const getModelMock = vi.fn(() => ({ paint: paintMock }))
const pollImageTaskMock = vi.fn()
const pollTaskUntilCompleteMock = vi.fn()
const submitImageGenerationMock = vi.fn()
const createRecordMock = vi.fn()
const updateRecordMock = vi.fn()
const addGeneratedImageMock = vi.fn()
const setQueryDataMock = vi.fn()
const invalidateQueriesMock = vi.fn()
const getImageMock = vi.fn()
const setBlobMock = vi.fn()
const getImageGenerationRecordMock = vi.fn()
const setCurrentGeneratingIdMock = vi.fn()
const setCurrentRecordIdMock = vi.fn()
const trackEventMock = vi.fn()

vi.mock('@shared/providers', () => ({
  getModel: getModelMock,
}))

vi.mock('@/adapters', () => ({
  createModelDependencies: vi.fn(async () => ({
    storage: {
      getImage: getImageMock,
    },
  })),
}))

vi.mock('@/packages/remote', () => ({
  submitImageGeneration: submitImageGenerationMock,
  pollTaskUntilComplete: pollTaskUntilCompleteMock,
  pollImageTask: pollImageTaskMock,
}))

vi.mock('./imageGenerationStore', () => ({
  IMAGE_GEN_LIST_QUERY_KEY: 'image-gen-list',
  IMAGE_GEN_QUERY_KEY: 'image-gen',
  createRecord: createRecordMock,
  updateRecord: updateRecordMock,
  addGeneratedImage: addGeneratedImageMock,
  imageGenerationStore: {
    getState: () => ({
      currentGeneratingId: null,
      currentRecordId: null,
      setCurrentGeneratingId: setCurrentGeneratingIdMock,
      setCurrentRecordId: setCurrentRecordIdMock,
    }),
  },
}))

vi.mock('./queryClient', () => ({
  queryClient: {
    setQueryData: setQueryDataMock,
    invalidateQueries: invalidateQueriesMock,
  },
}))

vi.mock('./settingsStore', () => ({
  settingsStore: {
    getState: () => ({
      licenseKey: 'license-key',
      getSettings: () => ({ providers: {} }),
    }),
  },
}))

vi.mock('@/utils/track', () => ({
  trackEvent: trackEventMock,
}))

vi.mock('@/lib/utils', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
}))

vi.mock('@/platform', () => ({
  default: {
    getConfig: vi.fn(async () => ({})),
    getImageGenerationStorage: () => ({
      getById: getImageGenerationRecordMock,
    }),
  },
}))

vi.mock('@/storage', () => ({
  default: {
    setBlob: setBlobMock,
  },
}))

vi.mock('@/storage/StoreStorage', () => ({
  StorageKeyGenerator: {
    picture: vi.fn(() => 'stored-output-key'),
  },
}))

describe('imageGenerationActions direct model path', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    createRecordMock.mockResolvedValue({ id: 'record-1' })
    updateRecordMock.mockImplementation(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch }))
    addGeneratedImageMock.mockImplementation(async (id: string, storageKey: string) => ({
      id,
      generatedImages: [storageKey],
    }))
    getImageGenerationRecordMock.mockResolvedValue({ id: 'record-1', generatedImages: ['stored-output-key'] })
    getImageMock.mockResolvedValue('data:image/png;base64,REFERENCE')
    paintMock.mockImplementation(async (_params, _signal, onImage) => {
      const image = 'data:image/png;base64,OUTPUT'
      await onImage(image)
      return [image]
    })
  })

  it('calls model.paint directly with URL and stored reference images', async () => {
    const { createAndGenerate } = await import('./imageGenerationActions')

    await createAndGenerate({
      prompt: 'make a variation',
      referenceImages: ['https://example.com/reference.png', 'storage-key-1'],
      model: {
        provider: 'chatbox-ai',
        modelId: 'gemini-2.5-flash-image',
      },
      imageGenerateNum: 1,
      aspectRatio: '16:9',
    })

    await vi.waitFor(() => {
      expect(paintMock).toHaveBeenCalledTimes(1)
    })

    expect(getModelMock).toHaveBeenCalledWith(
      { provider: 'chatbox-ai', modelId: 'gemini-2.5-flash-image' },
      { providers: {} },
      {},
      expect.objectContaining({ storage: expect.any(Object) })
    )
    expect(paintMock).toHaveBeenCalledWith(
      {
        prompt: 'make a variation',
        images: [{ imageUrl: 'https://example.com/reference.png' }, { imageUrl: 'data:image/png;base64,REFERENCE' }],
        num: 1,
        aspectRatio: '16:9',
      },
      expect.any(AbortSignal),
      expect.any(Function)
    )
    expect(submitImageGenerationMock).not.toHaveBeenCalled()
    expect(setBlobMock).toHaveBeenCalledWith('stored-output-key', 'data:image/png;base64,OUTPUT')
    expect(addGeneratedImageMock).toHaveBeenCalledWith('record-1', 'stored-output-key')
    expect(trackEventMock).toHaveBeenCalledWith(
      'generate_image',
      expect.objectContaining({ has_reference: true, path: 'direct' })
    )
  })

  it('stores structured error codes from direct model.paint failures', async () => {
    class StructuredImageGenerationError extends BaseError {
      public code = 20004
    }
    paintMock.mockRejectedValueOnce(new StructuredImageGenerationError('license not found'))

    const { createAndGenerate } = await import('./imageGenerationActions')

    await createAndGenerate({
      prompt: 'make an image',
      referenceImages: [],
      model: {
        provider: 'chatbox-ai',
        modelId: 'gemini-2.5-flash-image',
      },
      imageGenerateNum: 1,
    })

    await vi.waitFor(() => {
      expect(updateRecordMock).toHaveBeenCalledWith(
        'record-1',
        expect.objectContaining({
          status: 'error',
          error: 'license not found',
          errorCode: 20004,
        })
      )
    })
    expect(submitImageGenerationMock).not.toHaveBeenCalled()
  })

  it('resumes legacy taskId records through the async polling API', async () => {
    getImageGenerationRecordMock.mockResolvedValueOnce({
      id: 'legacy-record',
      taskId: 'legacy-task-1',
      imageGenerateNum: 1,
      generatedImages: [],
    })
    pollImageTaskMock.mockResolvedValueOnce({
      task_id: 'legacy-task-1',
      is_finished: true,
      items: [
        {
          uuid: 'legacy-item-1',
          status: 'completed',
          image_url: 'https://example.com/legacy-output.png',
        },
      ],
    })

    const { resumeGeneration } = await import('./imageGenerationActions')
    await resumeGeneration('legacy-record')

    expect(pollImageTaskMock).toHaveBeenCalledWith('legacy-task-1', 'license-key', expect.any(AbortSignal))
    expect(pollTaskUntilCompleteMock).not.toHaveBeenCalled()
    expect(updateRecordMock).toHaveBeenCalledWith('legacy-record', {
      generatedImages: ['https://example.com/legacy-output.png'],
      status: 'done',
      error: undefined,
      errorCode: undefined,
      errorItemUuid: undefined,
    })
  })
})
