import type { DocumentParserType } from '../../../shared/types/settings'
import { LocalParser } from './local-parser'
import type { DocumentParser, ParserFileMeta } from './types'

/**
 * Legacy Chatbox AI parser entry.
 * Kept for backward compatibility, but now resolves to the local parser.
 */
export class ChatboxParser implements DocumentParser {
  readonly type: DocumentParserType = 'chatbox-ai'

  constructor(private kbId?: number) {}

  async parse(filePath: string, meta: ParserFileMeta): Promise<string> {
    const localParser = new LocalParser(this.kbId)
    return await localParser.parse(filePath, meta)
  }
}
