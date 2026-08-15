import type { MCPServerConfig } from './types'

export interface BuildinMCPServerConfig {
  id: string
  name: string
  description: string
  url: string
}

// KOD 去云化：移除全部指向 mcp.chatboxai.app 的内置 server。
// 原有 5 个（fetch/sequentialthinking/edgeone-pages/arxiv/context7）均为上游 Chatbox 云服务，
// kod 不再依赖。数组保留为空，UI 不渲染任何内置 server；如需恢复或替换为开源/自建 server，在此补充。
export const BUILTIN_MCP_SERVERS: BuildinMCPServerConfig[] = []

export function getBuiltinServerConfig(id: string, _legacyLicenseKey?: string): MCPServerConfig | null {
  const config = BUILTIN_MCP_SERVERS.find((s) => s.id === id)
  if (!config) {
    return null
  }
  return {
    id,
    name: config.name,
    enabled: true,
    transport: {
      type: 'http',
      url: config.url,
    },
  }
}
