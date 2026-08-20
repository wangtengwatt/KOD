## Purpose

为 KOD Windows 开发环境提供可重复的一键启动能力，在不修改系统执行策略和项目锁文件的前提下选择受支持工具链、恢复依赖并输出可操作故障信息。

## ADDED Requirements

### Requirement: 选择受支持的 Node 运行时

Windows 开发启动器 SHALL 从项目内置和系统安装候选中选择满足 `package.json` Node 约束的 `node.exe`，并 SHALL 拒绝所有不满足约束的候选。

#### Scenario: 系统 Node 符合要求

- **WHEN** 系统存在 Node 22.12.0 或更高且低于 25.0.0
- **THEN** 启动器使用该运行时并在日志中记录其路径和版本

#### Scenario: 所有 Node 候选均不符合要求

- **WHEN** 所有候选缺失或版本不满足 `>=22.12.0 <25.0.0`
- **THEN** 启动器停止且显示项目真实版本约束与已检查位置

### Requirement: 避免 PowerShell pnpm 脚本策略

Windows 开发启动器 MUST 使用 `pnpm.cmd` 或 `corepack.cmd pnpm`，MUST NOT 通过 `pnpm.ps1` 执行安装或开发命令，并 SHALL 验证 pnpm 满足项目最低版本要求。

#### Scenario: pnpm.ps1 被系统策略禁用

- **WHEN** PowerShell 的裸 `pnpm` 命令会解析为不可执行的 `pnpm.ps1`，但存在 `pnpm.cmd` 或 `corepack.cmd`
- **THEN** 启动器仍能获取 pnpm 版本并继续引导

#### Scenario: pnpm 版本过低

- **WHEN** 可执行 pnpm 的版本低于 10.17.0
- **THEN** 启动器停止并记录检测到的版本和最低要求

### Requirement: 自动恢复锁定依赖

Windows 开发启动器 SHALL 在运行必需依赖不完整时，在项目互斥锁内自动执行 `pnpm install --frozen-lockfile`，且 MUST NOT 更新 `pnpm-lock.yaml`。

#### Scenario: node_modules 目录存在但运行依赖缺失

- **WHEN** Electron、`electron-vite`、`cross-env` 或 pnpm 模块元数据任一缺失
- **THEN** 启动器执行一次冻结安装，并仅在安装后全部依赖哨兵存在时继续启动

#### Scenario: 依赖已经完整

- **WHEN** 全部运行依赖哨兵存在
- **THEN** 启动器不执行安装并直接进入实例检测与开发启动流程

#### Scenario: 冻结安装失败

- **WHEN** pnpm 安装返回非零退出码或安装后依赖仍不完整
- **THEN** 启动器停止，不启动 Electron，并记录失败阶段、退出码和缺失项

### Requirement: 安全且可操作的启动日志

Windows 开发启动器 SHALL 记录所选 Node 与 pnpm 版本、依赖引导阶段、开发进程退出码和日志位置，同时 MUST NOT 记录认证令牌、私钥、数据库密码或完整环境变量。

#### Scenario: 开发服务成功就绪

- **WHEN** 依赖完整且 renderer 健康检查在宽限期内成功
- **THEN** 启动器保持开发进程运行或聚焦现有窗口，且日志包含成功阶段信息

#### Scenario: 环境或启动失败

- **WHEN** 工具链、依赖安装或开发进程失败
- **THEN** 用户看到简体中文原因、日志路径和下一步操作，日志包含可诊断退出码但不包含敏感配置内容
### Requirement: Isolate sibling projects and support all loopback bindings

The Windows development launcher MUST treat only paths at the current KOD project-root boundary as owned processes, MUST NOT classify sibling directories that merely share the `kod` prefix as owned, and SHALL consider the renderer healthy when any supported local loopback address returns an HTTP status below 500.

#### Scenario: Sibling project shares the KOD path prefix

- **WHEN** a process command line points to `kod-ai-portal`, `kod-android`, or another sibling path that begins with the text of the KOD client root
- **THEN** the launcher excludes that process from restart and termination operations

#### Scenario: Renderer binds IPv6 loopback

- **WHEN** IPv4 loopback is unavailable but the renderer responds on `::1`
- **THEN** the launcher recognizes the existing healthy instance instead of reporting a startup failure or requesting a restart
