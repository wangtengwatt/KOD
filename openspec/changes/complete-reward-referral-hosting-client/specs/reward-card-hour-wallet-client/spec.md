# reward-card-hour-wallet-client

## ADDED Requirements

### Requirement: Distinguish reward and redeemable card hours
客户端 SHALL 分别展示奖励卡时和可回购卡时，并 SHALL 只允许可回购卡时进入平台回购或服务器月租。

#### Scenario: Reward balance is present
- **WHEN** 用户拥有广告或邀请奖励卡时
- **THEN** 资产页单独展示奖励余额，回购和月租可用额度不增加

### Requirement: Refresh reward receipt
客户端 SHALL 在奖励领取成功后刷新资产并显示实际到账卡时提示。

#### Scenario: Ten card hours arrive
- **WHEN** 服务端确认广告领取或邀请奖励到账 10 卡时
- **THEN** 客户端显示“10 卡时已到账”并刷新余额
