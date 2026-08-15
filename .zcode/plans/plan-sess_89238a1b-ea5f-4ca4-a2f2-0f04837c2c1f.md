# 整理、提交并上传蒜宝分支

## 第一性原理审视

- `docs.zip` 是 TapX 网络项目资料，不属于 KOD。把它全部导入会污染仓库语义；本次只借鉴分类思想，不解压到工作区、不提交附件内容。
- 当前源码只是应用内蒜宝原型，不是架构文档描述的完整第一阶段。MR 必须使用 Draft，并把“已实现”与“规划中”分开写，避免评审者误判完成度。
- 当前分支相对 `main` 已携带两个前置提交及约 88 个文件。既然你确认保留，MR 将明确列出这两个依赖；不会把它包装成纯蒜宝 MR。
- `.zcode/` 是本地会话产物且尚未被忽略。为避免擅自改变全项目 ignore 规则，本次采用精确路径暂存，绝不使用 `git add .`。
- 推送和创建 MR 是对外操作。你已经逐项明确授权目标远端、分支、目标分支、Draft 状态和提交身份，因此可按下列步骤执行。

## 执行步骤

1. **整理文档目录**
   - 将 `docs/suanbao-architecture.md` 移动为：
     `docs/plans/2026-08-03-suanbao-phase1-product-technical-architecture.md`
   - 新增 `docs/README.md`，建立 KOD 工程文档索引，分类链接现有主要技术文档、产品文档、开发指南和阶段计划。
   - 蒜宝文档链接指向新的 `docs/plans/` 路径。
   - 不修改根 `README.md`，不导入 TapX 文档、`__MACOSX/` 或 `.DS_Store`。

2. **验证当前原型与文档**
   - 运行蒜宝定向单元测试：`pnpm exec vitest run src/renderer/components/suanbao`。
   - 运行 `pnpm run check`，验证 TypeScript。
   - 运行 Biome 针对本次源文件的检查；若只存在可安全自动修复的格式问题，按仓库规则修复后重新测试。
   - 运行 `git diff --check`。
   - 检查最终状态和 diff，确认 `.zcode/`、附件及其他无关文件均未进入暂存范围。

3. **提交一：蒜宝应用内原型**
   - 只暂存以下路径：
     - `src/renderer/components/suanbao/`
     - `src/renderer/routes/settings/suanbao.tsx`
     - `src/renderer/modals/Settings.tsx`
     - `src/renderer/routes/__root.tsx`
     - `src/renderer/routes/settings/route.tsx`
     - 中英文蒜宝 i18n 文件
   - 审查 staged diff 和 staged 文件清单。
   - 以 `watt <watt@kod.dev>` 创建提交：
     `feat(suanbao): add in-app assistant prototype`

4. **提交二：架构文档与索引**
   - 只暂存：
     - `docs/README.md`
     - `docs/plans/2026-08-03-suanbao-phase1-product-technical-architecture.md`
   - 审查 staged diff 和 staged 文件清单。
   - 创建提交：
     `docs(suanbao): add phase-one product and architecture design`

5. **推送现有分支**
   - 再次确认本地分支是 `suanbao_KOD`，远端为 `origin`。
   - 确认提交历史为：两个既有前置提交 + 两个新提交。
   - 推送到 `origin/suanbao_KOD`，不 force push、不改写历史。

6. **创建 Draft GitLab MR**
   - source：`suanbao_KOD`
   - target：`main`
   - 建议标题：`Draft: feat(suanbao): add in-app assistant prototype and phase-one architecture`
   - 描述明确包含：
     - **前置依赖**：`556489a` KOD 蒜粒品牌/账户隔离、`b3a2cf3` 停止旧远程配置请求；
     - **本次已实现**：应用内根级原型、有限页面可见、拖拽、状态、快捷动作、偏好、设置、i18n、埋点和逻辑测试；
     - **尚未实现**：全页面覆盖、独立蒜宝会话、Electron 透明窗口/托盘 broker、提醒、番茄、天气、日历、移动通知和正式素材系统；
     - 文档路径和验证结果；
     - Draft 原因与后续实施里程碑。
   - 不自动指定 reviewer、assignee、label 或 milestone，避免猜测 GitLab 项目配置。

7. **结果核验与报告**
   - 获取远端分支状态和 MR URL。
   - 报告两个新提交 SHA、测试结果、MR 地址和仍留在本地但未提交的 `.zcode/`。
   - 如果测试、认证、推送或 MR 创建失败，停止在失败步骤并如实报告，不伪称完成，也不通过 force push 或绕过测试解决。