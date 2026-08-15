## 第一性原理结论

“重复双击时聚焦已有应用”和“应用卡死时自动重启”是两个不同问题：

- 正常实例复用应由 Electron 的单实例锁处理，不能靠杀进程。
- 主进程真正卡死时，单实例事件无法执行，才需要外部启动器做有限、严格限定范围的恢复。

当前代码已经对开发环境启用了 `app.requestSingleInstanceLock()`，但普通第二实例调用的是 `showOrHideWindow()`：如果窗口正处于焦点状态，重复双击反而会隐藏窗口。这与目标冲突，应改为始终恢复、显示并聚焦。

现有快捷方式也已确认：目标为 `cmd.exe /k "D:\kod\start-kod-dev.bat"`，窗口样式为普通显示，不满足“终端自动最小化”。

## 实施方案

1. **修正 Electron 第二实例行为**
   - 增量编辑 `D:\kod\src\main\main.ts` 当前未提交版本。
   - 保留现有 Tinpay、深链和开发环境单实例改动。
   - 在无深链的 `second-instance` 分支中，将切换显示/隐藏改为调用现有 `showMainWindow()`。
   - 结果：重复双击时，窗口若最小化则恢复，若隐藏则显示，若被遮挡则置前并聚焦；不会因为已有焦点而隐藏。

2. **建立固定开发启动器**
   - 以 `D:\kod\start-kod-dev.ps1` 作为核心启动器并保留固定项目路径。
   - 启动器验证 `D:\kod\package.json` 和 `pnpm.cmd`，固定 `DEV_PORT=1212`，从 `D:\kod` 执行 `pnpm dev`。
   - 使用专属 named mutex/锁，避免两个启动器并发管理同一项目。
   - 写入项目专属 PID/状态文件和启动日志，便于识别自己启动的进程树和诊断失败。

3. **已有实例检测与聚焦**
   - 先检查 renderer `localhost:1212` 健康状态以及严格匹配 `D:\kod` 的 Electron 主进程。
   - 正常运行时启动一个轻量第二 Electron 实例，由现有 single-instance 机制通知原实例聚焦，然后立即退出；不重新启动第二套 dev server。
   - 不按进程名全局搜索或终止 `node.exe`、`pnpm`、`electron.exe`。

4. **卡死恢复与作用域保护**
   - 如果端口、项目 Electron 进程和聚焦结果表明实例不可恢复，启动器才进入恢复路径。
   - 只处理同时满足以下条件的进程：
     - 属于启动器记录的父子进程树，或
     - 命令行/可执行路径严格包含 `D:\kod\node_modules\...` 和本项目 `electron-vite dev` 标记。
   - 先尝试正常终止；超时后才对已验证 PID 树强制结束。
   - 有限次数重启并退避，避免无限崩溃循环。
   - 不影响其他 Node、pnpm、Electron 项目和正式 KOD 安装版。

5. **更新桌面快捷方式**
   - 修改 `C:\Users\28912\Desktop\KOD蒜粒-开发版.lnk`：
     - 目标使用 Windows PowerShell。
     - 参数为 `-NoProfile -ExecutionPolicy Bypass -File "D:\kod\start-kod-dev.ps1"`。
     - 工作目录固定 `D:\kod`。
     - 窗口样式设为 `7`（最小化）。
     - 保留 `D:\kod\assets\icon.ico` 图标和现有说明。
   - 不修改正式版快捷方式。

6. **验证**
   - 先处理当前仍在运行的旧 `D:\kod` 开发进程，仅按精确项目命令行和进程树清理。
   - 双击等效启动快捷方式，验证：
     - renderer 1212 启动；
     - Electron 窗口正常出现；
     - PowerShell/终端窗口最小化；
     - 再次启动不产生第二个长期运行实例；
     - 已有窗口被恢复、显示并聚焦；
     - 当前源码修改自动体现，无需重新打包。
   - 做有限的故障恢复验证：只模拟/处理本项目启动链路，不触碰其他进程。
   - 运行与 `main.ts` 相关的类型检查和 Biome；如全仓库 lint 仍为既有错误，只如实报告。
   - 检查快捷方式最终属性、Git 状态和差异。
   - 不创建 Git commit。