## Purpose

让 KOD 主侧边栏使用统一清晰的 KAI 矢量品牌标识，同时保留现有版本信息、关于页入口和跨尺寸布局行为。

## ADDED Requirements

### Requirement: Sidebar displays the supplied KAI wordmark
主侧边栏左上角 SHALL 显示用户提供的 KAI SVG 的仓库内副本，并替换当前小图标与“KOD”文字组合。

#### Scenario: Desktop sidebar
- **WHEN** 桌面端以常规宽度显示主侧边栏
- **THEN** KAI 标识按原始宽高比清晰呈现，版本号仍显示在标识右侧且不重叠

#### Scenario: Mobile sidebar
- **WHEN** Web、iOS 或 Android 以窄屏抽屉显示主侧边栏
- **THEN** KAI 标识在可用空间内等比缩放，且折叠按钮和版本号仍可操作与辨认

#### Scenario: Open About page
- **WHEN** 用户点击 KAI 标识区域
- **THEN** 客户端继续导航到现有关于页面

### Requirement: Branding scope is limited
本变更 SHALL 只替换主侧边栏左上角品牌位，不得隐式更换安装包图标、系统托盘图标、启动图、关于页或其他页面标识。

#### Scenario: Other brand assets
- **WHEN** 应用构建或运行
- **THEN** 除主侧边栏左上角外的现有品牌资源保持不变
