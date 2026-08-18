# KOD Android 全客户端功能复刻实施总索引

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute these plans task by task.

**Goal:** 以 `suanlizhongxin_KOD` 为唯一功能源，让 Android 在真实手机上通过 `https://kod.kai.com` 获得与当前 Windows 客户端一致的业务能力、数据和结果，并保留移动端原生交互。

**Architecture:** 共享 TypeScript 领域层负责业务规则和页面状态，`DesktopPlatform`、`MobilePlatform`、`WebPlatform` 只承载平台差异；人民币钱包、卡时、订单、角色和审核继续以现有后端账本为唯一权威来源；会话、媒体、知识库、设置和云任务使用独立同步表与对象存储。

**Tech Stack:** React 18、TypeScript、TanStack Router、Zustand、Vitest、Electron、Capacitor Android、SQLite、Spring Boot 3.3、Java 17、MyBatis/JDBC、MySQL、S3 兼容对象存储、GitLab CI/GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-08-18-android-full-client-parity-design.md`

## 不可突破的约束

- 不修改同事维护的人民币钱包、充值和交易表结构；新同步表通过现有用户 ID 关联。
- 客户端不建立第二套资金账本，不依据缓存推断可用余额。
- SSH 私钥永不上传；API Key 默认脱敏，重新验证后才能限时查看或复制。
- 生图和普通对话继续走现有零售站/节点链路；Token 套餐代理 Key 只允许套餐指定模型。
- 离线只允许读取缓存和编辑草稿；资金、审核、登录、模型调用和云任务必须联网。
- 生产环境不执行自动资金全流程测试；交易 E2E 只在隔离测试环境和模拟账本运行。
- 每个任务遵循红—绿—重构：先添加能因目标能力缺失而失败的测试，再写最小实现，最后跑回归。
- 每完成一个任务进行独立提交；不得用占位入口或“暂不支持”作为功能完成证据。

## 执行顺序

1. [阶段一：唯一功能源、能力清单与平台基础](2026-08-18-android-parity-01-foundation.md)
2. [阶段二：跨设备同步、密钥安全、媒体和知识库](2026-08-18-android-parity-02-sync-security.md)
3. [阶段三：对话、媒体、知识、MCP、技能与云任务](2026-08-18-android-parity-03-content-cloud.md)
4. [阶段四：钱包、算力交易、供应方和管理后台](2026-08-18-android-parity-04-commerce-compute.md)
5. [阶段五：隔离验收、真实手机、部署与 APK 发布](2026-08-18-android-parity-05-release.md)

阶段必须按顺序推进。阶段二依赖阶段一的平台能力契约；阶段三依赖阶段二的同步与对象存储；阶段四依赖统一身份和错误契约；阶段五只能在前四阶段的自动化验收全部通过后开始。

## 跨仓库工作边界

| 仓库 | 分支 | 职责 |
| --- | --- | --- |
| `D:\watt\kod` | `suanlizhongxin_KOD` | 唯一客户端功能源、共享领域代码、移动适配、Android 工程、客户端测试与 CI |
| `D:\watt\kod-ai-portal` | `release/3.0` | 身份、现有资金与算力业务、同步、安全保险库、对象存储、知识库和云任务 |
| `D:\watt\kod-android` | `feature/android-gitlab-sync-20260811` | 仅作为已完成移动适配的迁移来源；迁移验收后停止新增业务功能 |

## 阶段验收门

每一阶段完成时必须留下：

1. 关联需求的机器可读能力清单。
2. 本阶段新增和回归测试的原始命令与通过结果。
3. Windows、Web、Android 对同一 API 契约的检查结果。
4. 数据库迁移的向前兼容与回滚说明。
5. 安全检查记录，确认日志和错误响应无完整密钥、证件号或访问令牌。
6. 对应提交哈希；阶段五额外提供 APK 路径、版本、包名、环境和 SHA-256。

## 最终完成标准

- `docs/android-feature-parity.json` 中每个 Windows 已启用功能都有 `shared`、`native` 或 `cloud` 的 Android 映射，并关联自动化测试。
- Android 8、12、15 构建和核心 UI 测试通过；至少一台真实手机连接生产域名完成只读烟测。
- 隔离测试环境跑通购买方、认证供应方、算力管理员、钱包补差、GPU 交付、Token 套餐、争议、收益和提现申请全流程。
- 对话、生图、视频、模型设置、零售站/节点、知识库和任务在 Windows 与 Android 间双向同步，冲突时保留双方副本。
- Android 拒绝悬浮窗、无障碍或文件权限后，对话、生图、视频和算力中心仍可用。
- 生产 Debug APK 与签名 Release APK 都连接 `https://kod.kai.com`；本地调试包使用独立 applicationId 和明确环境标识。
