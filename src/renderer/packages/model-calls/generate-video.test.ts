import { beforeEach, describe, expect, it, vi } from 'vitest'

const { submitMock, statusMock } = vi.hoisted(() => ({
  submitMock: vi.fn(),
  statusMock: vi.fn(),
}))

vi.mock('@/api/videoGeneration', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api/videoGeneration')>()
  return {
    ...original,
    videoGenerationApi: {
      availability: vi.fn(),
      submit: submitMock,
      status: statusMock,
      content: vi.fn(),
    },
  }
})

import { fetchVideoTask, getVideoServiceErrorMessage, submitVideoTask } from './generate-video'

const TASK_ID = '11111111-1111-4111-8111-111111111111'

describe('KOD video proxy compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits generation-only parameters to the authenticated KOD backend', async () => {
    submitMock.mockResolvedValue(task('QUEUED'))

    await expect(
      submitVideoTask({
        model: 'seedance-2.0-asset-fast',
        prompt: '云海日出',
        images: ['data:image/png;base64,abc'],
        duration: 5,
        resolution: '720p',
        ratio: '16:9',
      })
    ).resolves.toMatchObject({ id: TASK_ID, status: 'queued' })

    expect(submitMock).toHaveBeenCalledWith(
      {
        model: 'seedance-2.0-asset-fast',
        prompt: '云海日出',
        referenceImages: ['data:image/png;base64,abc'],
        durationSeconds: 5,
        resolution: '720p',
        ratio: '16:9',
      },
      undefined
    )
  })

  it('normalizes server task states without exposing an upstream URL', async () => {
    statusMock.mockResolvedValue(task('SUCCEEDED'))

    await expect(fetchVideoTask(TASK_ID)).resolves.toEqual({
      id: TASK_ID,
      status: 'completed',
      progress: 100,
      errorCode: undefined,
      errorMessage: undefined,
    })
  })

  it('turns service failures into an isolated actionable reason', () => {
    expect(getVideoServiceErrorMessage(new Error('fetch failed'))).toContain('无法连接')
    expect(
      getVideoServiceErrorMessage(
        new Error(
          '[SY_ERR:wechat_75] The request failed because the output video may be related to copyright restrictions. Request id: 02178669818298'
        )
      )
    ).toBe(
      '内容未通过版权检查：描述或参考图可能包含受版权保护的影视、动漫、游戏角色。请改用原创角色和原创场景后重新生成。（请求编号：02178669818298）'
    )
  })
})

function task(status: 'QUEUED' | 'SUCCEEDED') {
  return {
    publicTaskId: TASK_ID,
    model: 'seedance-2.0-asset-fast',
    durationSeconds: 5,
    resolution: '720p',
    ratio: '16:9',
    price: 1.25,
    status,
    progress: status === 'SUCCEEDED' ? 100 : 0,
    errorCode: null,
    errorMessage: null,
    billed: status === 'SUCCEEDED',
    createdAt: 1,
    updatedAt: 2,
  }
}
