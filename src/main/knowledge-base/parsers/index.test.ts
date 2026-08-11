import { beforeEach, describe, expect, it, vi } from 'vitest'

const localParseMock = vi.fn()

vi.mock('./local-parser', () => ({
  LocalParser: class LocalParser {
    readonly type = 'local'

    constructor(readonly kbId?: number) {}

    parse(filePath: string, meta: unknown) {
      return localParseMock(this.kbId, filePath, meta)
    }
  },
}))

vi.mock('./mineru-parser', () => ({
  MineruParser: class MineruParser {
    readonly type = 'mineru'

    constructor(readonly apiToken: string) {}
  },
  testMineruConnection: vi.fn(),
}))

vi.mock('../../util', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}))

describe('legacy Chatbox AI knowledge parser compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localParseMock.mockResolvedValue('locally parsed content')
  })

  it('delegates legacy chatbox-ai configurations to LocalParser with the knowledge-base ID', async () => {
    const { createParser } = await import('./index')
    const parser = createParser({ type: 'chatbox-ai' }, 42)
    const meta = { fileId: 7, filename: 'report.pdf', mimeType: 'application/pdf' }

    await expect(parser.parse('/tmp/report.pdf', meta)).resolves.toBe('locally parsed content')
    expect(localParseMock).toHaveBeenCalledWith(42, '/tmp/report.pdf', meta)
  })

  it('reports local as the parser used for legacy chatbox-ai configurations', async () => {
    const { getParserDisplayName, parseFileWithRouter } = await import('./index')
    const meta = { fileId: 7, filename: 'report.pdf', mimeType: 'application/pdf' }

    await expect(parseFileWithRouter('/tmp/report.pdf', meta, { type: 'chatbox-ai' }, 42)).resolves.toEqual({
      content: 'locally parsed content',
      parserUsed: 'local',
    })
    expect(getParserDisplayName('chatbox-ai')).toBe('Local')
  })
})
