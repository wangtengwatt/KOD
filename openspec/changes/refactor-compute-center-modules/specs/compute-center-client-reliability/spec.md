## Purpose

该能力用于保证 KOD 算力中心在客户端模块化重构前后维持相同的可见功能、业务契约与权限边界，并为异步操作、资金交易、敏感凭证和 Windows、Web、Android、iOS 四端兼容提供可验证的可靠性约束。

## ADDED Requirements

### Requirement: Preserve Observable Compute Center Behavior
算力中心 SHALL 在重构前后保持现有导航结构、界面文案、标签顺序、权限显示、业务流程、接口路径、请求字段和响应解释不变；除本规格明确要求修复的可靠性或安全问题外，不得改变用户可见行为。

#### Scenario: Visitor browses public marketplace
- **WHEN** 未登录用户进入算力中心
- **THEN** 系统 SHALL 继续允许其浏览公开 GPU 商品、模型 API 套餐、实时行情和公开卡时市场信息
- **AND** 系统 SHALL 隐藏需要登录的资产、订单、设备、通知和管理员功能

#### Scenario: Authenticated user retains additive roles
- **WHEN** 已认证供应方登录算力中心
- **THEN** 系统 SHALL 同时保留其购买方能力和供应方能力
- **AND** 系统 SHALL 根据账户数据继续显示既有角色标签和功能入口

#### Scenario: Administrator access remains account-driven
- **WHEN** 当前账户的管理员标志为真
- **THEN** 系统 SHALL 显示现有算力管理后台入口和管理功能
- **AND** 非管理员账户 SHALL NOT 获取或显示管理员数据

#### Scenario: Existing backend contract is used
- **WHEN** 任一算力中心功能读取或写入数据
- **THEN** 客户端 SHALL 使用重构前相同的后端路径、HTTP 方法、请求字段和业务错误码语义

### Requirement: Async Operations Reach A Terminal State
算力中心中的每个用户触发异步操作 MUST 在成功、业务失败、传输失败、取消或组件卸载后结束加载状态并释放操作资源，且 SHALL 向用户提供可理解的简体中文反馈。

#### Scenario: Request succeeds
- **WHEN** 用户操作收到明确成功响应
- **THEN** 系统 SHALL 结束加载状态、显示浅绿色成功反馈并刷新相关算力中心数据

#### Scenario: Request fails explicitly
- **WHEN** 用户操作收到明确业务失败或认证失败响应
- **THEN** 系统 SHALL 结束加载状态并显示浅红色、可执行的失败反馈

#### Scenario: Backend does not respond
- **WHEN** 请求无法连接、超时、返回无法解析的内容或连接在响应前断开
- **THEN** 系统 SHALL 结束加载状态
- **AND** 系统 SHALL NOT 保持按钮永久转圈

#### Scenario: Component is left during a request
- **WHEN** 用户在异步操作完成前切换标签、退出登录或离开算力中心
- **THEN** 系统 SHALL NOT 对已卸载组件提交状态更新
- **AND** 敏感的临时状态 SHALL 被清除

### Requirement: Prevent Duplicate Write Submission
算力中心 MUST 防止同一用户操作在前一个写请求尚未确定结束时从客户端重复提交，并且 SHALL NOT 自动重试结果未知的资金或订单写请求。

#### Scenario: User clicks the same action repeatedly
- **WHEN** 同一操作标识对应的写请求仍在执行且用户重复点击该操作
- **THEN** 客户端 SHALL 只发送一个写请求

#### Scenario: Write response is lost
- **WHEN** 写请求可能已到达后端但客户端未收到确定响应
- **THEN** 客户端 SHALL NOT 自动重新发送该写请求
- **AND** 客户端 SHALL 提示用户先刷新资产或记录确认结果
- **AND** 客户端 SHALL 发起只读刷新以尽可能核对状态

#### Scenario: Operation has an idempotency identifier
- **WHEN** 现有业务接口支持请求标识且同一操作发生确认重试
- **THEN** 客户端 MUST 在该操作的所有尝试中复用同一请求标识

### Requirement: Require Confirmation Before Card-Hour Top-Up
当卡时不足时，算力中心 MUST 在用户明确确认后才使用人民币余额补足刚好缺少的卡时并继续原操作；取消或关闭确认 SHALL NOT 导致兑换、扣款或下单。

#### Scenario: Card hours are sufficient
- **WHEN** 用户拥有完成操作所需的可用卡时
- **THEN** 系统 SHALL 直接执行原操作且不显示补足确认

#### Scenario: RMB balance can cover the exact shortage
- **WHEN** 卡时不足且人民币余额足以兑换缺少的卡时
- **THEN** 系统 SHALL 显示缺少卡时、兑换金额和确认选项
- **AND** 仅在用户确认后 SHALL 以自动补足模式重试原操作一次

#### Scenario: User cancels top-up
- **WHEN** 用户取消或关闭卡时补足确认
- **THEN** 系统 SHALL NOT 兑换人民币、扣除卡时或继续原操作

#### Scenario: Both balances are insufficient
- **WHEN** 卡时与人民币余额均不足
- **THEN** 系统 SHALL 明确显示人民币缺口
- **AND** 仅在用户确认后 SHALL 打开 KOD 官网钱包充值页面

### Requirement: Protect Sensitive Compute Credentials
算力中心 MUST 将 API Key、登录令牌、实名材料、SSH 凭证、上游密钥和数据库凭证视为敏感数据，并 SHALL 防止其进入持久化客户端缓存、日志、错误上报、通知文案、URL 查询参数或测试产物。

#### Scenario: User reveals a package API key
- **WHEN** 用户主动点击显示 Token 套餐 API Key
- **THEN** 系统 SHALL 按需获取完整 Key 并仅在当前内存视图中展示
- **AND** 复制按钮 SHALL 仅在完整 Key 已成功获取后可用

#### Scenario: Sensitive view is closed
- **WHEN** 用户隐藏 Key、切换页面、退出登录或组件卸载
- **THEN** 客户端 SHALL 清除该视图持有的完整敏感凭证

#### Scenario: Error is reported
- **WHEN** 算力中心捕获或上报错误
- **THEN** 报告内容 SHALL 只包含错误码、操作类别和脱敏上下文
- **AND** 报告内容 SHALL NOT 包含完整凭证、身份证号、实名图片地址或私钥

### Requirement: Isolate Domain Rendering Failures
算力中心 SHALL 将市场、卡时、资产、购买、订单、供应方、通知和管理员区域的渲染异常相互隔离，使单一领域异常不会导致整个算力中心不可用。

#### Scenario: One domain fails to render
- **WHEN** 某一领域因未预期数据或组件错误无法渲染
- **THEN** 系统 SHALL 在该领域显示可恢复的错误状态
- **AND** 其他领域及顶层导航 SHALL 保持可用

### Requirement: Preserve Four-Platform Compatibility
算力中心 SHALL 使用共享平台能力而不是直接依赖单一运行时，并 MUST 保持 Windows 桌面、Web、Android 和 iOS 渲染代码的编译兼容性。

#### Scenario: External wallet link is opened
- **WHEN** 任一平台上的用户确认前往官网充值
- **THEN** 系统 SHALL 通过该平台的统一外链能力打开官网钱包

#### Scenario: Credential is copied
- **WHEN** 任一平台上的用户点击复制 Base URL 或 API Key
- **THEN** 系统 SHALL 通过共享剪贴板能力完成复制

#### Scenario: Platform builds are verified
- **WHEN** 本变更准备交付
- **THEN** Windows 和 Web 生产构建以及 Android、iOS 渲染构建 SHALL 成功
- **AND** iOS 原生编译和真机验证 MUST 在 macOS/Xcode 或 macOS CI 环境完成

### Requirement: Keep Automated Verification Isolated
算力中心自动化测试 MUST 使用模拟后端与隔离测试数据，且 SHALL NOT 对现有 `kod` 数据库执行资金、订单、转让、提现、交付或审核写操作。

#### Scenario: Automated test suite runs
- **WHEN** 算力中心单元、组件或集成测试执行
- **THEN** 所有后端响应 SHALL 来自模拟或隔离测试环境
- **AND** 测试数据 SHALL NOT 包含真实身份证、密码、令牌、API Key 或 SSH 凭证

#### Scenario: Real environment smoke check runs
- **WHEN** 对真实 KOD 环境执行验收冒烟检查
- **THEN** 检查 SHALL 限于登录状态、公开商品、账户资产和其他明确只读数据
- **AND** 检查 SHALL NOT 创建或修改任何业务记录
