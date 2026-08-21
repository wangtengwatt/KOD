# email-referral-reward-client

## ADDED Requirements

### Requirement: Invite from a first-level drawer
客户端 SHALL 在左侧提供“邀请好友”一级入口，打开邮箱输入、复制链接和跟踪邀请弹窗。

#### Scenario: Create an email invitation
- **WHEN** 用户输入合法邮箱并提交
- **THEN** 客户端创建待处理邀请但不宣称已发送邮件

### Requirement: Track invitation states
客户端 SHALL 展示近 90 天邀请，灰色表示“待处理”，绿色表示“已接受”，失败/失效使用红色及原因。

#### Scenario: Invitee registers and verifies email
- **WHEN** 服务端把邀请切换为已接受并发放奖励
- **THEN** 跟踪列表更新为绿色“已接受”，邀请人收到 10 卡时到账提示
