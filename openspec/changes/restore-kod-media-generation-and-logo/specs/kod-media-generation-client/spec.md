## Purpose

确保 KOD 在自动或手动零售站模式下都能发现并正确调用生图模型，并通过受 KOD 身份保护的官网后端安全完成视频生成任务。

## ADDED Requirements

### Requirement: Manual relay image models remain available
客户端 SHALL 在已登录用户手动选择零售站/节点时，从当前激活零售站读取并展示被识别为图片类型的模型，且 SHALL 使用该零售站对应的提供方配置执行图片生成。

#### Scenario: Manual relay supplies image models
- **WHEN** 用户已手动选择零售站/节点，且当前零售站返回至少一个图片模型
- **THEN** 图片生成器显示这些模型，并且生成请求使用当前零售站的地址、密钥与所选模型

#### Scenario: Manual relay has no image model
- **WHEN** 用户已手动选择零售站/节点，但当前零售站没有图片模型
- **THEN** 图片生成器明确提示当前零售站没有可用生图模型，并引导用户切换零售站/节点，而不是静默改用其他通道

#### Scenario: Automatic relay mode
- **WHEN** 用户未手动选择零售站/节点且已登录 KOD
- **THEN** 图片生成器继续使用官网自动分配零售站返回的图片模型

#### Scenario: Excluded image model
- **WHEN** 图片模型已被用户加入排除列表
- **THEN** 该模型不出现在可选图片模型中

### Requirement: Video requests use the authenticated KOD backend
客户端 SHALL 通过当前 KOD API Origin 的视频代理提交、查询和下载视频任务，并 SHALL 使用当前 KOD 登录令牌鉴权。客户端 MUST NOT 直接持有或发送上游视频服务密钥。

#### Scenario: Submit an authenticated video task
- **WHEN** 已登录且钱包满足要求的用户提交合法视频生成参数
- **THEN** 客户端向 KOD 后端提交任务，保存后端公开任务编号，并开始查询规范化进度

#### Scenario: User is not logged in
- **WHEN** 未登录用户尝试提交视频任务
- **THEN** 客户端拒绝提交并提示先登录，且不创建上游任务

#### Scenario: Backend video service is not configured
- **WHEN** KOD 后端明确返回视频服务未配置
- **THEN** 客户端显示可执行的中文提示，且不会尝试客户端直连或读取历史密钥

#### Scenario: Video task completes
- **WHEN** 后端任务进入完成状态并提供受保护的视频内容
- **THEN** 客户端下载视频到本地存储、更新本地历史、刷新钱包信息并显示完成状态

#### Scenario: Video task fails
- **WHEN** 后端任务进入失败状态或返回可识别的业务错误
- **THEN** 客户端保存中文错误与失败状态，允许用户重试，并且聊天、图片生成和其他页面保持可用

### Requirement: Media behavior is shared across supported clients
图片模型选择与视频代理调用 SHALL 由桌面、Web、iOS 和 Android 共用的渲染层实现，不得依赖仅 Electron 可用的客户端密钥或文件路径。

#### Scenario: Supported runtime builds
- **WHEN** 相同账号在任一受支持运行时进入图片或视频生成页面
- **THEN** 模型发现、鉴权、错误语义和任务状态遵循相同规则
