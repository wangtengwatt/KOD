## 1. 环境合同与测试基线

- [x] 1.1 记录当前 Node、pnpm 命令解析、依赖哨兵和启动日志证据
- [x] 1.2 为 Node 版本约束、pnpm.cmd/corepack 选择、依赖完整性和冻结安装路径编写失败测试

## 2. 启动器核心修复

- [x] 2.1 实现可测试的 Windows 工具链解析与版本校验核心
- [x] 2.2 实现依赖哨兵检测、互斥锁内冻结安装和安装后复验
- [x] 2.3 将现有启动入口接入解析结果，并更新准确的简体中文错误与安全日志

## 3. 本地恢复与验证

- [x] 3.1 使用合规 Node 与 pnpm.cmd 执行 `pnpm install --frozen-lockfile`
- [x] 3.2 运行启动器回归测试、TypeScript 检查和相关测试
- [ ] 3.3 运行真实桌面开发启动并验证 renderer 健康状态与登录后端可达性

## 4. 安全审计与交付

- [x] 4.1 审计领先提交和工作区，排除密钥、私钥、日志、依赖目录与构建产物
- [x] 4.2 验证 OpenSpec、Git 差异和提交历史后提交修复
- [ ] 4.3 推送全部现有进度到 GitLab `suanlizhongxin_KOD`
## 5. Safety follow-up

- [x] 5.1 Add project-root boundary isolation and IPv4/IPv6 loopback health probing with regression tests
