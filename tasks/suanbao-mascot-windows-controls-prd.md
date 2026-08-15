# 蒜宝统一形象与 Windows 窗口控制修复 PRD

## 1. 背景与目标

当前应用内蒜宝和最小化 KOD 后出现的桌面浮窗仍使用两套 CSS 绘制的旧形象；同时 KOD 主窗口采用无边框 Electron 窗口，但部分页面没有显示 Windows 的最小化、最大化和关闭按钮，导致用户无法通过界面最小化客户端，也无法验证桌面蒜宝。

本次改动目标：

1. 以用户提供的 `512×597` 透明 PNG 为唯一蒜宝生产素材。
2. 应用内蒜宝与桌面独立浮窗共用同一组件和同一素材。
3. Windows 上的引导页、主界面、任务页和设置弹窗均提供可用的窗口控制。
4. 最小化主窗口后自动切换到桌面蒜宝；恢复主窗口后回到应用内蒜宝，避免重复显示。

## 2. 现状与根因定位

### 2.1 蒜宝形象不一致

- `SuanbaoPet.tsx` 使用 `.suanbao-garlic`、`.suanbao-bulb` 等 DOM/CSS 绘制应用内角色。
- `SuanbaoWindowApp.tsx` 使用 `.suanbao-body`、`.suanbao-sprout` 等另一套 DOM/CSS 绘制桌面角色。
- 两套实现没有共享品牌素材，造型和比例无法保持一致。

### 2.2 Windows 三按钮缺失

- Electron 主窗口配置为 `frame: false` 和 `titleBarStyle: 'hidden'`，系统不会提供原生标题栏；预览验证还发现 renderer 退化为 WebPlatform 时，自定义按钮虽可显示但点击会成为空操作。
- `WindowControls` 是否渲染依赖异步 `platform.getPlatform()`；`platformTypeAtom` 首帧初始值为空，导致 Windows 控制组件在首屏或热更新场景下不可见。
- 全屏设置弹窗使用独立标题栏，只提供“关闭设置”按钮，没有最小化入口，覆盖主页面控制后无法最小化 KOD。

## 3. 产品方案

### 3.1 统一蒜宝素材

- 新增唯一生产素材：`src/renderer/static/logos/suanbao-mascot.png`。
- 新增共享组件 `SuanbaoMascot`，由应用内蒜宝与独立浮窗共同引用。
- 删除两套旧 CSS 蒜头结构；保留容器、点击区域、拖动逻辑和状态同步。
- `<img>` 使用 `object-fit: contain`，禁止拖拽、拉伸和裁切。

### 3.2 状态与动画

| 状态 | 表现 |
| --- | --- |
| idle | 轻微整体浮动 |
| thinking / executing | 紫色光晕；executing 在完整动画档轻微整体缩放 |
| success | 绿色光晕 |
| error | 红色光晕 |
| reduced | 降低循环动画频率 |
| off / `prefers-reduced-motion` | 禁止循环位移和缩放，保留静态状态光晕 |

状态动画只作用于整张图片，不重绘脸部或改变品牌形象。

### 3.3 Windows 窗口控制

- 桌面 renderer 首帧同步根据 `platform.type` 与系统 UA 推断 `win32 / darwin / linux`，随后再用 IPC 结果校准。
- Windows 恢复 Electron 原生 frame，由系统提供最小化、最大化/还原、关闭按钮；Linux 继续使用共享 `WindowControls`。
- 设置弹窗标题栏增加独立最小化按钮；其圆形关闭按钮仍只关闭设置，不改变现有语义。
- 所有按钮继续调用现有 platform IPC，不新增高权限接口。

### 3.4 主窗口与桌面蒜宝切换

- 沿用主进程已有的 `minimize / restore / show / hide` 监听和 `syncMainWindowVisibility`。
- 主窗口可见且未最小化：显示应用内蒜宝，隐藏桌面浮窗。
- 主窗口最小化或隐藏：显示桌面浮窗。
- 主窗口恢复：隐藏桌面浮窗，避免双蒜宝。

## 4. 非目标

- 不修改蒜宝业务能力、对话、任务、日程或 IPC 数据模型。
- 不重新设计用户提供的角色，不生成其他表情位图。
- Windows 恢复 Electron 原生 frame，确保窗口控制不依赖 renderer、preload 或 IPC；其他平台保持现有标题栏策略。

## 5. 验收标准

1. 应用内和桌面浮窗均显示用户提供的新蒜宝，比例、KOD 胸标和透明边缘正确。
2. 生产代码不再包含旧 `.suanbao-garlic`、`.suanbao-bulb`、`.suanbao-body` 等角色结构。
3. Windows 引导页、主界面、任务页可见最小化、最大化/还原、关闭按钮。
4. 设置弹窗右上角可直接最小化 KOD。
5. 点击最小化后主窗口隐藏到任务栏，桌面蒜宝出现；恢复后桌面蒜宝消失、应用内蒜宝出现。
6. 拖动、单击气泡、双击打开会话、隐藏、锁定和位置保存无回归。
7. full、reduced、off 与系统减少动态效果均符合预期。
8. TypeScript、Biome、蒜宝专项测试和生产构建通过。
9. 生产构建只输出一份指纹化蒜宝 PNG；桌面浮窗 CSP 继续保持 `connect-src 'none'`。

## 6. 测试计划

- 单元测试：共享形象组件输出素材、状态和动画类名。
- 专项测试：运行现有蒜宝 main/renderer/platform 测试集。
- 构建验证：检查图片产物、两个 renderer 引用和浮窗 CSP。
- Windows 手测：依次验证引导页、主界面、设置弹窗的三个窗口控制，以及最小化/恢复时两种蒜宝的互斥切换。

## 7. 风险与回滚

- 风险：透明边缘在深色背景出现色边；需同时检查浅色、深色背景。
- 风险：固定浮窗尺寸内图片与气泡重叠；只在现有角色区域内缩放，不扩大 BrowserWindow。
- 风险：平台识别失败导致控制缺失；同步推断提供首帧兜底，IPC 保持最终权威。
- 回滚：恢复旧角色 DOM/CSS 和异步平台识别即可；不涉及数据迁移或用户配置变更。
