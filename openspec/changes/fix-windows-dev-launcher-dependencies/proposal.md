## Why

KOD Windows 开发启动器在系统 Node 已符合项目要求时，仍可能因为 PowerShell 命中被执行策略拦截的 `pnpm.ps1`，或因为 `node_modules` 不完整而直接退出。当前错误提示还错误地宣称 Node 18、20 或 22 都可用，与 `package.json` 的 `>=22.12.0 <25.0.0` 约束不一致，导致开发者无法依靠启动器恢复项目。

## What Changes

- 启动器从项目内置位置和系统安装位置选择符合 `package.json` 约束的 Node 运行时。
- 启动器仅调用 Windows 可执行入口 `pnpm.cmd` 或 `corepack.cmd pnpm`，不依赖 PowerShell 脚本执行策略。
- 发现 Electron、`electron-vite`、`cross-env` 或 pnpm 模块元数据缺失时，启动器自动执行 `pnpm install --frozen-lockfile`。
- 依赖安装、版本检测和开发进程失败时，日志记录可执行命令、版本、退出码和可执行修复建议。
- 增加启动器核心逻辑的自动化回归测试，并完成真实依赖安装与桌面开发启动冒烟。

## Capabilities

### New Capabilities

- `windows-dev-launcher`: 定义 Windows 开发启动器选择受支持工具链、自动恢复锁定依赖并安全启动 KOD 的行为。

### Modified Capabilities

无。

## Impact

- 影响 `start-kod-dev.ps1`、Windows 启动器核心脚本、启动器测试和开发说明。
- 不修改生产后端、数据库、官网钱包、业务 API、用户数据或发行版自动更新流程。
- 本地首次恢复依赖需要访问 pnpm 包源，并可能执行项目现有的 `postinstall`。
