# rewarded-ad-client

## ADDED Requirements

### Requirement: Render server-managed campaign
客户端 SHALL 使用服务端返回的广告素材、时长、奖励和每日资格，且 SHALL NOT 把广告文件或奖励资格写死为唯一事实源。

#### Scenario: Campaign is available
- **WHEN** 今日仍可领取且后台活动启用
- **THEN** 用户可完整观看广告并领取服务端声明的 10 奖励卡时

#### Scenario: Already claimed today
- **WHEN** 服务端声明北京时间当日额度已用尽
- **THEN** 客户端禁用重复领取并显示下次可领取日期
