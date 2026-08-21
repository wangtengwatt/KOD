# GPU 租赁结算人工审核接入规范

本仓库只包含 KOD 客户端。GPU 租赁、冻结卡时和自动结算由远端 `/api/compute` 服务执行，因此“异常或大额订单不得自动结算”必须在服务端强制实现；前端仅展示审核队列和提交管理员裁定。

## 结算状态

```text
PENDING_DELIVERY → DELIVERED → CONFIRMED / IN_USE
                                      │
                         租期结束或结算任务触发
                                      │
                   ┌──────────────────┴──────────────────┐
                   │                                     │
          低风险且低于阈值                       异常 / 争议 / 大额
                   │                                     │
          SETTLEMENT_PENDING                     PENDING_REVIEW
                   │                                     │
             COMPLETED                  管理员裁定后结算或退款
```

`PENDING_REVIEW`、`DISPUTED` 和 `EXCEPTION_PENDING` 中的卡时必须保持冻结。客户端不能通过“立即结算”接口绕过这些状态。

## 服务端规则

每笔订单在创建时记录审核规则版本；结算任务使用该版本或经审计的最新版本进行判定。以下任一条件成立时，服务端将订单转为 `PENDING_REVIEW`，并写入不可修改的触发原因：

- `frozenCardHours >= reservationManualReviewThreshold`；
- 买方争议、系统异常、交付超时或节点处于异常状态；
- 缺少交付凭证，或凭证校验失败；
- 风控服务返回需要人工复核。

服务端必须自行计算这些条件，不能接受客户端传入的“是否审核”或金额阈值。

## API 契约

现有接口扩展如下；字段均为新增兼容字段。

```ts
// GET /api/compute/admin/overview
{
  reservationManualReviewThreshold: number,
  reservationsPendingManualReview: number,
}

// POST /api/compute/admin/settings
{
  transferReviewThreshold: number,
  reservationManualReviewThreshold: number,
  platformFeeRate: number,
  usdCnyRate: number,
}

// GET /api/compute/admin/reservations 与 /api/compute/reservations
{
  status: 'PENDING_REVIEW' | string,
  manualReviewRequired: boolean,
  manualReviewReasons: string[],
  manualReviewRequestedAt: string | null,
  manualReviewPolicyVersion: string | null,
  reviewedAt: string | null,
  reviewedByEmail: string | null,
  resolutionReason: string | null,
  version: number,
}

// POST /api/compute/admin/reservations/:id/resolve
{
  resolution: 'FULL_REFUND' | 'ACTUAL_USAGE' | 'FULL_SETTLEMENT',
  actualCardHours?: number,
  reason: string,
  expectedVersion: number,
}
```

`POST /api/compute/admin/reservations/:id/settle` 必须拒绝 `PENDING_REVIEW`、`DISPUTED`、`EXCEPTION_PENDING` 或 `manualReviewRequired=true` 的订单，并在 `expectedVersion` 不匹配时返回冲突错误。

## 数据与权限

建议新增 `compute_reservation_review` 追加式审计记录，至少保存订单 ID、触发原因、规则版本、证据快照哈希、创建时间、审核人、裁定、裁定原因、结算金额和订单版本。订单状态改变、账本写入和 outbox 事件需要在同一数据库事务内完成；支付或卡时账本调用使用 `reservationId:version` 作为幂等键。

执行服务只能创建结算提案或风险信号；只有 `ADMIN`（后续可拆出 `REVIEWER`）能调用 `resolve`。AI 可以提供证据摘要或风险建议，但不能调用结算接口。

## 必测场景

1. 低额、无异常订单在租期结束后仅结算一次。
2. 达到阈值的订单进入 `PENDING_REVIEW`，自动任务和 `settle` 接口都不能绕过。
3. 异常、争议、缺失凭证和节点异常都进入人工审核。
4. 非管理员无法裁定；缺少裁定原因无法结算。
5. 并发审核或重复任务只产生一笔账本记录。
6. 版本冲突、账本失败和回调重试均不会把订单错误标记为完成。
