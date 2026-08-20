## Context

见 `proposal.md`。项目真实运行时约束来自 `package.json`：Node `>=22.12.0 <25.0.0`、pnpm `>=10.17.0`，并通过 `packageManager` 固定 pnpm 10.33.0。当前机器的 Node 22.23.2 合规，但 PowerShell 的 `pnpm` 命令解析到 `pnpm.ps1` 后被执行策略拒绝；同时 `node_modules` 目录存在但 Electron 和 `.bin` 入口缺失。

## Goals / Non-Goals

**Goals:**

- 在双击启动器时自动选择合规 Node 和可执行的 pnpm Windows 命令。
- 用锁文件恢复不完整依赖，并避免两个启动器同时安装或启动。
- 让环境错误在日志中可定位、可复现、可操作。
- 用独立测试覆盖版本、命令解析、依赖完整性和安装成功/失败路径。

**Non-Goals:**

- 不下载或安装系统级 Node，不修改 PowerShell 执行策略。
- 不升级项目依赖、不重写锁文件、不改变应用业务行为。
- 不结束无法证明属于当前项目的进程。

## Decisions

1. 将纯环境判断和依赖引导函数放入独立 PowerShell 核心脚本，`start-kod-dev.ps1` 保持为进程编排入口。这样测试可以执行真实函数和临时假命令，而无需打开 Electron 窗口。
2. Node 候选按项目内置目录、标准安装目录、当前 `PATH` 排序，并逐个执行 `--version`。只接受 `>=22.12.0 <25.0.0`，不再使用宽泛的主版本文案。
3. pnpm 候选只接受 `.cmd`：优先所选 Node 同目录的 `pnpm.cmd` 或 `corepack.cmd pnpm`，再检查 `PATH` 候选。这样既从根源上绕开 `pnpm.ps1` 的执行策略问题，也避免用 Node 22 选择器误调用绑定 Node 24 的外部 pnpm。
4. 依赖完整性使用多个运行必需哨兵判断；任一缺失就在项目互斥锁内运行 `install --frozen-lockfile`。安装后重新验证全部哨兵，失败则停止启动并保留明确日志。
5. 安装命令继承项目现有 registry 与认证配置，不在仓库写入令牌。日志记录命令类型和退出码，但不记录环境变量、认证头或配置文件内容。
6. 项目进程归属采用规范化根路径加边界字符判断，禁止将 `kod-ai-portal`、`kod-android` 等同前缀兄弟目录纳入终止范围。
7. renderer 健康检查依次探测 IPv4、IPv6 和 `localhost` 回环地址，适配 Vite 在不同 Windows 环境中的监听选择。

## Risks / Trade-offs

- [首次安装耗时较长] → 在控制台和日志显示当前阶段，且同一项目只允许一个引导进程。
- [包源不可用] → 保留 pnpm 原始输出与退出码，不尝试改写 registry 或绕过锁文件。
- [损坏目录看似存在] → 使用 Electron、`.bin` 命令和 `.modules.yaml` 多重哨兵，安装后再次验证。
- [项目内置 Node 陈旧] → 所有候选都执行版本校验，不因路径优先而跳过约束。
- [自动安装执行 postinstall] → 仅执行仓库已定义的标准 `pnpm install --frozen-lockfile`，不增加额外脚本。

## Migration Plan

1. 先运行自动化测试证明旧启动器无法满足新合同。
2. 引入核心脚本并接入现有入口。
3. 在当前项目执行冻结安装、类型检查、关键测试与实际启动健康检查。
4. 若启动器回归，可回滚本变更提交；已安装的 `node_modules` 为未跟踪本地产物，不影响源代码回滚。
