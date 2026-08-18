# PRD：KOD 对话广告位 MVP

## 1. 背景

KOD 需要验证“免费智能体能力 + 对话内广告补贴”的商业模式。第一阶段不接入广告平台，也不根据用户提示词定向，仅在桌面客户端与 Web 端的智能体对话界面展示 KOD 自有文字广告。

广告必须是独立 UI，不得伪装成模型回复、写入会话消息、进入模型上下文或生成代码。

### 1.1 开源参考与产品取舍

- Freebuff 官方仓库：<https://github.com/CodebuffAI/freebuff>。其 CLI 同时提供输入框上方广告、回复内嵌广告和首页广告。
- 主要实现参考：`cli/src/components/ad-banner.tsx`、`cli/src/hooks/use-gravity-ad.ts` 与 `common/src/util/response-ad-positions.ts`。
- 另一个可参考实现是 OpenCode 分支 CodeWithAds：<https://github.com/griffincockfoster56/codewithads>，包含 spinner、输入框、回复后方和侧栏等多个广告位。

KOD MVP 不照搬 Freebuff 的回复中穿插和提示词定向：只在完整回复之后展示一条自有广告，不向广告服务发送提示词、回复或代码。这样先验证展示体验和技术隔离，再决定是否接入远程广告库存。

## 2. 目标

- 在桌面客户端和 Web 端共用一套广告模型、选择逻辑与展示组件。
- 覆盖普通 AI 对话和任务智能体对话。
- 在一轮完整的助手回复结束后展示一条紧凑文字广告。
- 明确标注“广告 · AD”，支持跳转和单次关闭。
- 为未来远程广告、轮播、频控和效果统计预留稳定边界。
- 不采集或上报提示词、回复内容、代码、文件名及仓库信息。

## 3. 非目标

- 本期不建设广告投放后台、竞价、计费、结算或广告主账户体系。
- 本期不基于提示词、代码或用户画像做定向。
- 本期不把广告插入模型输入、模型输出、Markdown 导出或会话持久化数据。
- 本期不覆盖移动端、图片生成、视频生成和引导页。
- 本期不提供全局永久关闭广告的设置；关闭只作用于当前这一次展示。

## 4. 用户体验

### 4.1 展示位置

- 普通对话：最新一条已完成的助手回复下方。
- 任务智能体：最新一条已完成的助手回复下方。
- 每个对话页面同时最多出现一条广告。

### 4.2 展示时机

满足以下全部条件才展示：

1. 运行平台为 `desktop` 或 `web`。
2. 当前最后一条消息来自助手。
3. 助手消息已经结束生成，并收到明确的成功 `finishReason`；MVP 仅接受 `stop`。
4. 助手消息包含可见内容。
5. 助手消息没有请求错误、工具错误或异常结束，且不是上下文压缩摘要。

当用户发送下一条消息后，旧广告随即隐藏；新一轮助手回复完成后展示新广告。这样广告只存在于“等待下一次输入”的自然停顿位置，不干扰生成过程。

### 4.3 卡片结构

- 固定披露标签：`广告 · AD`
- 广告主：`KOD`
- 标题和一行说明文字
- 可选 CTA：`了解 KOD`
- 关闭按钮，具备无障碍标签

点击 CTA 通过平台抽象层打开 HTTPS 地址：桌面端使用系统浏览器，Web 端以 `noopener,noreferrer` 打开新页面。

### 4.4 MVP 文案

中文：

- 标题：`让想法更快变成可运行的软件`
- 正文：`使用 KOD 智能体完成规划、编码与交付。`
- CTA：`了解 KOD`

英文：

- Title: `Turn ideas into working software faster`
- Body: `Plan, build, and ship with the KOD coding agent.`
- CTA: `Explore KOD`

## 5. 功能需求

### FR-1：统一广告领域模型

广告对象至少包含：

- `id`
- `advertiser`
- `title`
- `description`
- `ctaLabel`
- `destinationUrl`

UI 只消费规范化后的广告对象，不关心广告来自本地常量还是未来远程接口。

### FR-2：统一选择与资格判断

- 广告选择逻辑是无 UI 依赖的纯函数。
- 不支持的平台返回 `null`。
- 没有合格助手消息时返回 `null`。
- 中文语言使用中文文案，其他语言回退到英文。

### FR-3：独立渲染

- 广告不得添加到 `Session.messages` 或 `TaskSession.messages`。
- 广告不得被上下文构建器、Token 统计、复制回复、导出会话或标题生成读取。
- 广告组件错误不得影响正常对话。

### FR-4：交互

- CTA 点击打开广告地址。
- 关闭后，本次展示在本次应用运行期间不再出现，包括虚拟列表重新挂载。
- 下一轮新广告可重新展示。

### FR-5：最小效果事件

在用户允许产品分析的前提下记录：

- `conversation_ad_impression`
- `conversation_ad_click`
- `conversation_ad_dismiss`

事件参数仅包含 `ad_id`、`placement` 和 `platform`，不得包含任何对话内容或用户标识扩展字段。
`impression` 在卡片首次进入可视区时记录，并按会话、广告和锚点消息在本次应用运行期间去重。

## 6. 技术方案

```text
本地广告目录（MVP）
        ↓
广告资格与语言选择（纯函数）
        ↓
ConversationAdCard（共享 UI）
        ├── 普通 MessageList（desktop / web）
        └── TaskChat（desktop / web）
```

建议目录：

- `src/renderer/packages/advertising/conversationAds.ts`：类型、本地目录、资格判断与选择。
- `src/renderer/components/ads/ConversationAdCard.tsx`：共享展示组件。
- `src/renderer/packages/advertising/conversationAds.test.ts`：纯逻辑测试。

远程化时，只替换广告数据提供者，并继续返回相同的规范化对象；UI 和消息模型不需要变化。

## 7. 验收标准

- [x] 桌面客户端普通对话在完整助手回复后显示一条 KOD 广告。
- [x] Web 端普通对话在相同时机显示相同结构的广告。
- [x] 任务智能体对话在桌面与 Web 构建中支持同一广告位。
- [x] 生成中、空回复、错误回复、最后一条是用户消息或摘要消息时不显示。
- [x] 广告明确标记为“广告 · AD”。
- [x] CTA 使用平台链接能力打开 `https://kod.kai.com`。
- [x] 当前广告可关闭，下一轮完成后可再次出现。
- [x] 广告不进入消息存储、模型上下文、Token 统计和会话导出。
- [x] 移动端不展示。
- [x] 单元测试、TypeScript 检查与桌面生产构建通过；Web 核心打包通过，仓库既有 sourcemap 清理脚本缺失另行修复。

## 8. 后续迭代

1. 增加服务端广告配置、缓存、超时和 fail-open 策略。
2. 增加广告位级开关、频次上限、会话级冷却和用户长期关闭选项。
3. 增加广告素材审核、HTTPS 域名白名单、过期时间与紧急下线能力。
4. 在取得明确同意后研究上下文匹配；默认只发送抽象主题标签，不发送原始提示词或代码。
5. 对接可审计的展示、点击和转化统计，并定义去重口径。
