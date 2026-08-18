# KOD Linux 全功能客户端与官网发布设计

日期：2026-08-18
状态：已由用户逐节批准

## 1. 目标

以 `D:\watt\kod` 的 `suanlizhongxin_KOD` 分支为唯一功能源，在不复制业务代码的前提下交付 KOD Linux 0.1.0。首发同时提供 x64 与 arm64 的 AppImage、`.deb` 四个安装包，支持 Ubuntu 22.04、Ubuntu 24.04、Debian 12，以及 X11 与 Wayland。其他桌面发行版通过 AppImage 尽量兼容，但不列入逐一认证范围。

安装包发布到 `wangtengwatt/KOD` 的 GitHub Releases。官网 `kod.kai.com/download` 提供可直接下载的 Linux 入口；AppImage 支持应用内自动更新，`.deb` 在发现新版本后跳转官网下载。

## 2. 已确认的产品边界

Linux 版保留现有桌面端的全部业务能力：

- 账号登录、注册、验证码、账号切换、退出和角色入口。
- 对话、消息历史、模型选择、附件、联网搜索和导入导出。
- 生图、视频、知识库、Copilot、MCP、技能和任务沙箱。
- KAI 模型、零售站、节点、钱包、充值、卡时、算力市场、买卖双方流程、订单、通知和运营管理入口。
- 跨设备同步、设置、代理、快捷键、托盘、开机启动、深链、自动更新和本地日志。

Windows/macOS 专属窗口外观改为 Linux 交互，但不删除相应业务能力。StoreKit、Android 权限和移动端通知等 iOS/Android 专属能力不属于 Linux 范围。

本项目不建立 Linux 业务分支，不使用 WebView 包装官网，也不以“暂不支持”的占位入口代替现有桌面功能。

## 3. 总体架构

现有 Electron 主进程、preload、React renderer 和 shared 领域层继续作为 Linux 应用主体。Linux 差异只通过既有 `DesktopPlatform`、Electron IPC 和少量主进程适配实现。

需要覆盖的 Linux 适配边界包括：

- 系统密钥环与安全存储。
- XDG 应用菜单、开机启动和 `kod://` 深链。
- X11/Wayland 窗口控制、托盘与全局快捷键。
- 文件选择、外部浏览器、保存与导出。
- MCP 子进程的 shell 环境和 `PATH` 发现。
- 基于 `bubblewrap` 的任务沙箱。
- AppImage 与 `.deb` 的更新行为。

任何共享组件都不得直接添加散落的 Linux 条件分支；平台差异应进入平台接口、主进程服务或独立的纯函数模块，并有契约测试。

## 4. Linux 包与系统集成

版本号固定为 `0.1.0`，GitHub 标签固定为 `linux-v0.1.0`。公开资产名为：

- `KOD-0.1.0-x64.AppImage`
- `KOD-0.1.0-x64.deb`
- `KOD-0.1.0-arm64.AppImage`
- `KOD-0.1.0-arm64.deb`
- `SHA256SUMS`
- `latest-linux.yml`
- `latest-linux-arm64.yml`

`.deb` 的内部架构使用 Debian 标准名称 `amd64` 或 `arm64`；公开文件名使用 KOD 统一的 `x64` 或 `arm64`。包元数据补齐 maintainer、vendor、synopsis、description、分类、图标、桌面文件和协议注册。

任务沙箱在 Linux 依赖 `bubblewrap`、`socat` 和 `ripgrep`。`.deb` 声明这些运行时依赖；AppImage 启动时执行只读预检，缺少依赖时显示适用于 Ubuntu/Debian 的安装命令，但绝不自动执行 `sudo`。AppImage 使用 electron-builder 的静态 AppImage runtime，避免把 FUSE2 作为首发系统前提。

`.deb` 安装系统级 `.desktop` 文件和 `kod://` 处理器。AppImage 首次运行时在当前用户的 XDG 目录创建或更新 `.desktop` 文件和协议注册，不写系统目录。开机启动使用 XDG autostart。

## 5. 凭据与沙箱安全

密码、令牌和供应商密钥只允许使用 Electron `safeStorage` 在 Secret Service/KWallet 可用时持久化。Linux backend 为 `basic_text` 或密钥环不可用时，不保存密码和敏感令牌的明文或弱加密副本；用户仍可完成当前登录，但界面必须说明无法安全记住密码及修复方法。

Linux 任务沙箱继续使用 Anthropic Sandbox Runtime 的 `bubblewrap` 实现，保持敏感读取拒绝、工作区写入允许、其他位置写入拒绝、进程树终止和超时控制。启动前检查依赖和 user namespace 能力；检查失败时模块返回结构化原因，不降级为无隔离执行。

日志不得记录密码、Token、API Key、身份证信息、支付回调参数或完整私有路径。单个模块初始化失败只隔离该模块，不让账号、普通对话或其他功能崩溃。

## 6. 构建与 GitHub Release

GitHub Actions 新增 Linux 发布工作流。x64 使用原生 Ubuntu x64 runner，arm64 使用原生 `ubuntu-22.04-arm` runner。两个架构都在 Linux 上安装锁定依赖、重建原生模块、运行测试并分别生成 AppImage 与 `.deb`，禁止用 Windows 直接交叉打包最终产物。

选择 Ubuntu 22.04 作为构建基线，以降低 glibc 版本门槛。每个架构任务在上传前验证 Electron、libsql 和其他原生二进制的实际架构。汇总任务在发布前完成以下检查：

1. 四个包全部存在且版本一致。
2. `dpkg-deb` 元数据和依赖正确。
3. AppImage 可解包且主可执行文件架构正确。
4. `latest-linux.yml` 只指向 x64 AppImage，`latest-linux-arm64.yml` 只指向 arm64 AppImage。
5. YAML 中的 SHA-512 与实际文件一致。
6. `SHA256SUMS` 覆盖四个安装包并校验通过。

工作流仅在上述门禁全部通过后创建非草稿 GitHub Release。Release 说明包含系统要求、安装方法、AppImage 依赖预检说明、校验方法、已知限制、GPLv3 许可证和对应源码链接。Linux 发布配置独立指向 GitHub，不改变 Windows/macOS 的既有发布设置。

## 7. 官网下载与更新数据流

官网仓库为 `D:\watt\kod-ai-portal`。前端新增 `frontend/public/download/linux/latest.json`，记录版本、标签、发布日期、四个 GitHub 直链、文件大小和 SHA-256。下载页不在 React 组件中重复硬编码版本信息，而是读取这份清单。

Linux 卡片的主按钮直接下载 x64 AppImage。卡片同时提供 x64 `.deb`、arm64 AppImage 和 arm64 `.deb` 的明确入口，并显示版本、支持范围和 SHA-256 校验入口。键盘用户和窄屏用户可完成同样选择。

应用更新源统一改为 `https://kod.kai.com/api/auto_upgrade/`，不再访问 Chatbox 域名。官网镜像内提供：

- `/api/auto_upgrade/latest-linux.yml`
- `/api/auto_upgrade/latest-linux-arm64.yml`

Nginx 对这两个精确路径返回静态更新清单并禁止长期缓存；其他 `/api/` 请求仍代理到后端。清单中的相对 AppImage 地址由 Nginx 以 `302` 重定向到相应的 `linux-v<version>` GitHub Release 资产。因此更新发现由 KOD 官网控制，二进制仍由 GitHub 托管，Android 与 Linux 使用不同 Release 标签也不会互相覆盖更新清单。

AppImage 使用现有 electron-updater 状态机完成检查、下载、进度、重启和安装。`.deb` 检测到新版本时进入“外部安装”状态，打开官网对应下载入口，不尝试绕过系统包管理器或提权覆盖安装。

## 8. Linux 交互与错误处理

Linux 使用现有自绘最小化、最大化、恢复和关闭按钮，同时验证 X11 与 Wayland 的窗口状态。托盘创建失败时记录脱敏日志并继续运行；关闭、恢复和退出始终保留可见路径。

MCP stdio 启动前解析登录 shell 环境并检查命令是否存在。缺少 `node`、`npx` 或用户配置的命令时，界面展示命令名、查找范围和修复建议，而不是静默失败。HTTP/SSE MCP 不依赖本地 Node。

所有 Linux 系统能力返回稳定、可翻译的错误码。功能界面至少区分依赖缺失、权限拒绝、密钥环锁定、显示服务器不兼容、网络失败、更新清单损坏和架构不匹配。任何错误都给出可执行的恢复动作。

## 9. 测试与验收

建立机器可读的 Linux 功能矩阵。每个现有桌面功能必须映射到共享实现或 Linux 适配，并关联自动化测试或有记录的人工验收；未映射或仅占位的必需项阻止发布。

CI 门禁包括：

- TypeScript 检查、Biome lint、现有单元测试和集成测试。
- Linux 平台接口、密钥环降级、依赖预检、协议注册、更新模式和错误映射测试。
- Xvfb/X11 与无头 Wayland 下的 Electron 启动冒烟，覆盖首屏、路由、preload IPC、窗口操作、深链、MCP、沙箱和更新检查。
- Ubuntu 22.04、Ubuntu 24.04、Debian 12 的安装与启动检查。
- x64/arm64 包内容、原生模块、更新清单与校验和验证。
- 官网构建、清单解析、四个链接、响应式布局、键盘操作和下载可达性测试。

真实生产环境只执行只读或明确安全的冒烟测试。自动化测试不得修改真实人民币钱包、订单、提现、实名或 GPU 交付数据；这些流程使用契约测试、模拟账本和现有后端测试验证。外部模型调用需要有效账号时，记录为受凭据约束的人工冒烟，不把缺少生产密钥误报为 Linux 缺陷。

## 10. 生产部署与回滚

上线顺序固定为：

1. 发布并验证 GitHub Release。
2. 提交并推送官网 Linux 下载与更新清单变更。
3. SSH 登录 `ubuntu@18.166.72.200:22`。
4. 记录服务器当前官网提交、前端镜像 ID 和容器状态。
5. 拉取已验证的官网目标提交。
6. 执行 `docker compose build frontend`。
7. 仅重建前端服务，不重启数据库、Redis 或无关后端服务。
8. 检查容器健康、`/download`、两个更新清单、四个下载链接和 HTTPS 公网访问。

若任一健康检查失败，立即恢复部署前提交或前端镜像并重新启动原前端容器。失败版本的 GitHub Release 可保留用于诊断，但官网不得继续指向它。部署过程中不读取或输出服务器 `.env`、私钥和其他凭据。

## 11. 许可证与交付物

KOD 是 Chatbox Community Edition 的 GPLv3 衍生作品。每个 Linux 二进制必须包含现有 `LICENSE` 和 `NOTICE`；Release 必须提供完整对应源码入口，不得删改原始署名或使用与 GPLv3 冲突的附加限制。

最终交付物包括：

- 四个可下载 Linux 0.1.0 安装包。
- GitHub Release、校验和、更新清单和发行说明。
- Linux 功能矩阵与测试报告。
- 官网 Linux 下载入口和应用更新源。
- 生产部署验证结果和可执行回滚记录。

只有在构建、测试、链接检查、生产健康检查和实际下载复核全部通过后，任务才可标记完成。
