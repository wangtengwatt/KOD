## Why

客户端已有视频代理、奖励广告和充值返佣界面基础，但奖励卡时尚未与可回购卡时隔离，邀请仍以人民币首次充值返佣呈现，平台服务器月租也没有独立闭环。

## What Changes

- 保留安全的 AI 视频生成框架和无 Key 时的明确不可用状态。
- 将看广告奖励设为每日一次、每次 10 个不可回购奖励卡时，并显示到账弹窗。
- 新增左侧“邀请好友”入口、邮箱邀请弹窗和状态跟踪；注册并验证邮箱后奖励 10 卡时。
- 展示奖励/可回购卡时分桶，阻止奖励卡时回购和支付服务器月租。
- 新增平台服务器月租、自动续租开关和统一价格上架体验；“算力托管”更名为“算力租赁”。
- 实时行情不在本变更范围。

## Capabilities

### New Capabilities

- `reward-card-hour-wallet-client`
- `rewarded-ad-client`
- `email-referral-reward-client`
- `monthly-compute-hosting-client`

## Impact

影响 renderer 侧边栏、钱包 API/hook、广告组件、算力中心路由与 API 类型、邀请深链和相关测试；不新增客户端密钥或实时行情代码。

