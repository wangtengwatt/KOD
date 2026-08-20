## Purpose

保证 KOD 各端在同一会话中只使用一个后端签名域，并能从认证失效中安全恢复。

## ADDED Requirements

### Requirement: 统一 KOD 后端地址

客户端 SHALL 让登录、钱包、资产、算力和账户请求使用同一个 KOD API origin。普通开发构建 SHALL 默认使用配置的官网地址，只有显式启用本地 API 模式时才 SHALL 使用本机地址。

#### Scenario: 普通开发版启动

- **WHEN** `NODE_ENV` 为 `development` 且未显式启用 `USE_LOCAL_API`
- **THEN** 登录与钱包请求都发送到配置的 `KOD_API_ORIGIN`

#### Scenario: 显式本地调试

- **WHEN** 开发者显式启用 `USE_LOCAL_API`
- **THEN** 登录与钱包请求都发送到 `http://localhost:8080`

### Requirement: 安全恢复失效会话

客户端 SHALL 将 HTTP 401/403 和业务信封 401/403 识别为认证失效，并 SHALL 只清除产生该失败的旧会话。

#### Scenario: 官网拒绝旧令牌

- **WHEN** 钱包接口以 HTTP 401/403 或业务信封 401/403 拒绝当前令牌
- **THEN** 客户端清除当前登录令牌并要求用户重新登录

#### Scenario: 用户已建立新会话

- **WHEN** 旧钱包请求返回未授权前用户已经获得新令牌
- **THEN** 客户端保留新令牌，不得因旧请求结果退出新会话

#### Scenario: 普通业务错误

- **WHEN** 钱包接口返回非认证类业务错误
- **THEN** 客户端显示业务错误且不得清除登录令牌
