# KOD Seedance 工作进度与恢复说明

更新时间：2026-08-04
负责人：许嘉豪

## 一、当前任务范围

当前主任务：

1. 完成 Kod 桌面客户端前端的 Seedance 视频创作能力；
2. 完成必要的 Seedance 模型识别和 kai-new-api 接口接入；
3. 在功能完整的基础上继续优化视频创作页视觉。

明确不属于当前范围：

- Web 蒜宝降级方案；
- Web 蒜宝静态/精简降级组件；
- Portal 浏览器版 Seedance 创作端；
- 通用 BYOK 视频 Provider；
- 视频编辑时间线和高级视频编辑。

## 二、项目位置

原始只读源码包：

`/Users/kai/Desktop/kod-projects/原项目/kod-main`

当前开发副本：

`/Users/kai/Developer/KOD/kod-seedance`

开发副本已初始化本地 Git，基线提交：

`12fcfe7 chore: import Kod source baseline`

本轮改动尚未提交或推送。

## 三、已完成的 Seedance MVP

### 1. 页面和导航

- 新增侧栏 `Create Video`；
- 新增独立路由 `/video-creator`；
- 页面文件：
  - `src/renderer/routes/video-creator/index.tsx`

### 2. 视频模型识别

已扩展模型类型 `video`，并将 Seedance/video 模型从 Kod AI 模型清单独立分组，防止混入 chat/image。

修改文件：

- `src/shared/types/settings.ts`
- `src/shared/model-registry/types.ts`
- `src/renderer/packages/remote.ts`
- `src/renderer/hooks/useChatboxAIModels.ts`

### 3. Seedance API

使用现有 kai-new-api OpenAI Video 风格接口：

- `POST /v1/videos`
- `GET /v1/videos/{taskId}`
- `GET /v1/videos/{taskId}/content`

已实现：

- JSON 请求；
- `seconds` 字符串；
- `metadata.ratio/resolution/watermark`；
- 单首帧图片转换为 Data URL 并放入 `images[]`；
- Bearer 使用中转站 API Key；
- `id/task_id` 兼容；
- 防止 `/v1/v1/videos` URL 重复；
- 两种错误 Envelope 兼容；
- 30 秒单请求超时；
- 7 秒任务轮询。

服务文件：

- `src/renderer/features/video-creator/videoService.ts`
- `src/renderer/features/video-creator/videoService.test.ts`

### 4. 状态映射

后端到前端：

- `queued` → `queued`
- `in_progress` → `processing`
- `completed` → `succeeded`
- `failed` → `failed`
- `unknown` → `queued` 并继续轮询

### 5. 历史和恢复

已实现：

- IndexedDB 保存任务；
- 保存首帧 Data URL；
- 任务历史排序；
- 应用重新进入后恢复未完成任务；
- 停止等待和继续等待；
- 失败重试；
- 删除历史任务。

### 6. 视频预览与下载

已实现：

- 带 Bearer 请求 `/content`；
- 视频响应转 Blob URL；
- 原生 video 播放；
- MP4 下载；
- 页面卸载时释放 Blob URL。

## 四、已完成验证

### TypeScript

`pnpm exec tsc --noEmit`

结果：通过。

### 单元测试

`src/renderer/features/video-creator/videoService.test.ts`

结果：11/11 通过。

覆盖：

- URL join；
- JSON 请求；
- seconds；
- 首帧 images；
- 状态映射；
- id/task_id；
- 错误格式；
- Bearer 内容下载；
- IndexedDB 排序和删除。

### 构建

`pnpm run build`

结果：通过，主进程、preload、renderer 均成功。

### Lint

全项目 Lint 未通过，属于原项目基线问题：

- 12 errors；
- 979 warnings。

本次 Seedance 新增文件没有发现新增 Lint 错误。

### 环境

- Node：`/Users/kai/.local/node-22.12.0/bin/node`
- pnpm：10.33.0

依赖安装时旧依赖 `zipfile@0.5.12` 原生编译失败，但依赖安装整体完成，且 TypeScript、测试和生产构建均通过。

## 五、正在进行的视觉优化

用户已批准视觉优化计划，但尚未开始写入视觉改动。当前代码仍是功能版页面。

待实施内容：

1. 去掉 Page 内部重复大标题；
2. 页面改为中央稳定视频画布＋底部创作器＋可折叠历史侧栏；
3. 增加无任务、排队、生成中、加载视频、失败、成功画布状态；
4. 根据 16:9、9:16、1:1 稳定视频画布比例；
5. 状态 Badge 使用 Kod `chatbox-*` 语义色；
6. Prompt 和任务 ID 降低视觉权重；
7. 增加模型、时长、比例、分辨率参数摘要；
8. 参数区三等分并改善响应式；
9. Watermark 改为 Switch；
10. 首帧增加 64×64 缩略图、文件名和移除按钮；
11. 桌面历史侧栏支持展开/收起；
12. 移动端历史改 Bottom Drawer；
13. 历史增加空态、选中态、时间和参数摘要；
14. 删除历史前增加确认；
15. 只使用现有轻量过渡和 Shimmer，不引入新动画库。

计划中的组件：

- `src/renderer/routes/video-creator/-components/VideoCanvas.tsx`
- `VideoComposer.tsx`
- `VideoHistoryPanel.tsx`
- `VideoHistoryItem.tsx`
- `FirstFramePreview.tsx`
- `VideoEmptyState.tsx`

## 六、真实后端联调待办

前端已按代码契约实现，但尚未使用真实 Seedance 渠道生成视频。后续需要：

1. kai-new-api 测试地址；
2. 用户级测试 Token；
3. 已启用的豆包 Seedance 渠道；
4. 确认服务端任务轮询开启；
5. 确认真实可用模型名；
6. 验证首帧 Data URL；
7. 验证 5/10 秒；
8. 验证 480p/720p/1080p；
9. 验证失败退款；
10. 验证 `/content` 大文件播放和 Range/206；
11. 验证视频结果 URL 生命周期；
12. 验证 429、余额不足和上游错误文案。

## 七、恢复工作命令

进入项目：

```bash
cd /Users/kai/Developer/KOD/kod-seedance
export PATH="$HOME/.local/node-22.12.0/bin:$PATH"
```

查看改动：

```bash
git status --short
git diff --check
git diff --stat
```

运行测试：

```bash
pnpm exec vitest run src/renderer/features/video-creator/videoService.test.ts
pnpm exec tsc --noEmit
pnpm run build
```

启动开发应用：

```bash
pnpm dev
```

## 八、下一步

恢复后直接执行视觉优化计划，从以下文件开始：

`/Users/kai/Developer/KOD/kod-seedance/src/renderer/routes/video-creator/index.tsx`

优先完成：

1. VideoCanvas；
2. VideoComposer；
3. FirstFramePreview；
4. VideoHistoryPanel；
5. 移动历史抽屉；
6. TypeScript、测试、定向 Lint和构建；
7. 启动应用做GUI视觉检查。
