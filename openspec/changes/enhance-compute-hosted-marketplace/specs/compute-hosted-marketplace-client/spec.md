## Purpose

为 KOD 算力中心提供可审计的商品审核、订单沟通与排期、卡时担保说明和长期算力托管体验。

## ADDED Requirements

### Requirement: Admin review shows complete evidence and history
客户端 SHALL 在商品审核详情中显示不可变商品版本、全部商品图片、关联 GPU 资源证明、供应方与套餐信息，并 SHALL 在审核完成后保留可查询审核记录。

#### Scenario: Review pending GPU product
- **WHEN** 管理员打开待审核 GPU 商品
- **THEN** 页面显示全部商品图、关联节点资质图、规格、价格、时长、SLA、供应方和提交时间后才允许审核

#### Scenario: Review completes
- **WHEN** 管理员通过或拒绝审核
- **THEN** 记录移动到审核记录并显示带颜色的结果、审核人、原因和时间，而不是从页面无痕消失

### Requirement: Paid orders provide participant-only communication
客户端 SHALL 为已付款 GPU 订单提供买卖双方可访问的文字/图片聊天、未读数、本地提醒和不可伪造系统消息。

#### Scenario: New participant message
- **WHEN** 订单一方发送新消息且另一方尚未阅读
- **THEN** 对方看到订单未读数、通知中心红点和不含敏感正文的本地通知

#### Scenario: Closed order
- **WHEN** 订单已经完成或取消
- **THEN** 聊天历史仍可读取但输入和排期操作均禁用

### Requirement: Schedule is mutually confirmed and server-authoritative
客户端 SHALL 通过结构化提议和确认完成排期，不得把自由文本或本地时间计算当作已锁定时段。

#### Scenario: Confirm non-conflicting proposal
- **WHEN** 一方提出时段、对方确认且服务端返回已锁定
- **THEN** 订单进入待交付并显示双方确认时间和系统消息

#### Scenario: Schedule conflict
- **WHEN** 服务端拒绝重叠时段
- **THEN** 客户端保留聊天和订单，提示重新选择，不显示已锁定或执行交付

### Requirement: Rental order presents escrow flow
客户端 SHALL 同时显示原冻结、当前担保、已结算和已退款金额，并用事件时间线说明资金去向。

#### Scenario: Active escrow
- **WHEN** 订单仍在协商、待交付、已交付、使用或争议状态
- **THEN** 当前担保金额与账户冻结汇总一致，卖家待结算金额不伪装成已到账

#### Scenario: Completed order
- **WHEN** 订单已经完成
- **THEN** 当前担保显示零，原冻结与已结算仍显示，明确说明卡时已进入卖家账户

### Requirement: Hosted devices support persistent sale and delayed delisting
客户端 SHALL 在“我的设备”中提供算力托管概览、排期和下架申请，并 SHALL 在顶部使用唯一“租赁订单”入口。

#### Scenario: Hosted node has an active order
- **WHEN** 节点正在运行订单但仍有未来容量
- **THEN** 商品显示“运行中，可预约下一时段”和最近可用时间

#### Scenario: Delisting is requested
- **WHEN** 卖家提交下架申请
- **THEN** 页面立即显示停止新接单、七天最早时间、阻塞订单和预计下架时间

#### Scenario: Navigation is consolidated
- **WHEN** 用户进入算力中心
- **THEN** 顶部只显示“租赁订单”，我的资产中不再有重复租赁页签，订单可按我购买的/我出租的筛选
