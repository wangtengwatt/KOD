## Why

KOD 图片生成在用户手动选择零售站后会丢失可用模型，视频生成又依赖客户端构建时注入的上游密钥，当前环境因此分别表现为“没有可用模型”和“视频服务尚未配置”。同时，主侧边栏左上角仍使用旧图标与文字组合，需要采用用户提供的 KAI 矢量标识。

## What Changes

- 让图片模型选择器识别当前手动零售站中的生图模型，并让生成请求继续使用该零售站及节点，而不是错误回落到其他提供方。
- 将视频提交、查询和内容下载从客户端直连上游改为调用 KOD 官网后端的受保护视频代理；客户端不再编译或保存上游视频密钥。
- 保留现有视频本地历史、重试、取消、进度和钱包刷新体验，并适配后端规范化的任务响应。
- 在侧边栏左上角使用 `C:/Users/Microsoft/Downloads/KAI.svg` 的仓库内副本替换当前小图标与“KOD”文字组合；版本号与关于页入口保持不变。
- 为图片模型来源、视频鉴权/错误处理和 Logo 呈现增加回归测试，覆盖共享的桌面、Web、iOS 与 Android 渲染代码。

## Capabilities

### New Capabilities

- `kod-media-generation-client`: 规定客户端在自动与手动零售站模式下发现并调用图片模型，以及通过 KOD 后端安全完成视频任务的行为。
- `kod-sidebar-branding`: 规定主侧边栏左上角 KAI 标识、版本号和交互行为。

### Modified Capabilities

无。

## Impact

- 影响 `src/renderer/hooks/useImageModelGroups.ts`、零售站状态读取、图片生成相关测试、`src/renderer/packages/model-calls/generate-video.ts`、视频 store/action、侧边栏与静态资源。
- 依赖 `D:/watt/kod-ai-portal` 中配套 OpenSpec 变更 `add-kod-video-generation-proxy` 提供视频代理和计费接口。
- 不改变 KOD 对话、生图实际的手动零售站/节点切换规则，不改安装包图标、启动图和其他页面 Logo。
- 不允许任何上游视频 API 密钥进入客户端源码、构建产物、日志或版本库。
