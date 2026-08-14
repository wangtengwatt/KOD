import { describe, expect, it } from 'vitest'
import {
  buildOpenAIVideosBody,
  buildVolcengineTasksBody,
  getVideoServiceErrorMessage,
  normalizeOpenAIVideosResponse,
  normalizeVolcengineTasksResponse,
} from './generate-video'

const params = {
  model: 'seedance-2.0-asset-fast',
  prompt: '云海日出',
  images: ['data:image/png;base64,abc'],
  duration: 5 as const,
  resolution: '720p' as const,
  ratio: '16:9' as const,
}

describe('official video request compatibility', () => {
  it('builds the OpenAI videos request used by the source commit', () => {
    expect(buildOpenAIVideosBody(params)).toMatchObject({
      model: params.model,
      prompt: params.prompt,
      image: params.images[0],
      images: params.images,
      seconds: '5',
      metadata: { duration: 5, resolution: '720p', ratio: '16:9', watermark: false },
    })
  })

  it('builds the Volcengine fallback request with optional images', () => {
    expect(buildVolcengineTasksBody(params)).toMatchObject({
      model: params.model,
      duration: 5,
      resolution: '720p',
      content: [
        { type: 'image_url', image_url: { url: params.images[0] } },
        { type: 'text', text: params.prompt },
      ],
    })
  })

  it('normalizes both supported response protocols', () => {
    expect(
      normalizeOpenAIVideosResponse({ id: 'a', status: 'completed', metadata: { url: 'https://v/a.mp4' } })
    ).toMatchObject({ id: 'a', status: 'completed', videoUrl: 'https://v/a.mp4' })
    expect(
      normalizeVolcengineTasksResponse({
        id: 'b',
        status: 'succeeded',
        content: { video_url: 'https://v/b.mp4' },
        usage: { total_tokens: 12 },
      })
    ).toMatchObject({ id: 'b', status: 'completed', videoUrl: 'https://v/b.mp4', usage: { totalTokens: 12 } })
  })

  it('turns service failures into an isolated actionable reason', () => {
    expect(getVideoServiceErrorMessage(new Error('Status Code 401'))).toContain('认证失败')
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
