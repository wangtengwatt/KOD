## Context

详细设计见 `docs/superpowers/specs/2026-08-21-kod-reward-video-referral-hosting-design.md`。服务端是奖励资格、余额分桶、邀请接受、月租与统一售价的唯一事实源。

## Decisions

1. 在共享 renderer 中实现四端一致 UI，不依赖 Electron 专属能力。
2. 使用服务端返回的 `spendableCardHours`、`redeemableCardHours`、`rewardCardHours`，禁止客户端从总额反推。
3. 广告领取成功和邀请接受到账统一刷新资产并弹出 10 卡时通知。
4. 邀请邮箱操作只创建记录，不发送邮件；专属链接/邀请码完成注册验证后接受。
5. 卡时托管月租只能使用可回购卡时，统一价格不可由用户编辑。
6. 实时行情保持原样。

## Migration

先部署兼容新旧字段的后端，再发布客户端。旧人民币返佣界面隐藏但历史记录保留为只读。回滚客户端不会合并奖励余额，也不会改变服务端资产资格。

