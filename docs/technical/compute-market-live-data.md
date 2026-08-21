# KOD 双站 GPU 实时行情

算力中心只消费 KOD 行情契约，不在浏览器中保存第三方凭据。开发机使用 `scripts/compute-market-server.mjs` 作为本地 companion API；生产环境应把同一契约部署到受控后端。

当前采集源是 Vast.ai 与 GetDeploying。AutoDL 已退出运行时采集；历史文件中已有的 `AUTODL` 点仍可读取并按原 source 独立展示，直到超出历史保留期，但服务不会再新增 AutoDL 点。

## 本地运行

1. 复制 `.env.market.example` 为 `.env.market.local`。该文件已由 `.env*.local` 规则忽略。
2. 从 [GetDeploying API](https://getdeploying.com/api) 申请有效凭据，并只在 companion 服务端配置 `GETDEPLOYING_API_KEY`。不得将密钥放入 renderer、`VITE_*` 环境变量、日志、接口响应或 Git。
3. 运行 `pnpm run market:serve`，服务监听 `http://127.0.0.1:8787`（与 KOD 本地业务后端的 8080 分离）。
4. 使用 `KOD_MARKET_API_ORIGIN=http://127.0.0.1:8787` 构建或启动 renderer。

未配置 GetDeploying 密钥时，latest 接口会为三个型号返回 `source: "GETDEPLOYING"`、`status: "UNCONFIGURED"`，并明确提示配置 `GETDEPLOYING_API_KEY`，不会伪造报价。GetDeploying 返回 401 或 403 时会分别标记为授权错误；服务端错误信息不包含密钥。

默认允许 KOD 常用的 1212、3000、4173 本地来源。若使用其他前端来源，请在 `KOD_MARKET_ALLOWED_ORIGINS` 中精确列出，多个来源以英文逗号分隔；不要配置通配符。

## GetDeploying 数据口径

companion 只调用正式接口 [`GET https://getdeploying.com/api/gpu-offerings`](https://getdeploying.com/help/api)，并发送 `Authorization: Bearer GETDEPLOYING_API_KEY`。请求端限制 `billing_type=ON_DEMAND`、`availability=AVAILABLE`，后端仍会再次校验这两个字段，并进行以下精确过滤：

- A100：`nvidia-a100`、40 GB、PCIe；80 GB 或显式 SXM/NVL 报价不会混入。仅当 `interconnect` 为空且 `interconnect_bandwidth_gbps` 也未提供时，按 GetDeploying 文档的 PCIe-only 语义归一为 PCIe。
- V100：`nvidia-v100`、32 GB。
- T4：`nvidia-t4`、16 GB。
- 价格只使用 `pricing.hourly_per_gpu`，币种必须是 USD；`pricing.hourly` 是整实例价格，不用于单卡报价。
- GetDeploying 中 `provider.id/name` 为 Vast.ai 的报价会被排除，避免与独立 Vast.ai 曲线自我比较或双计。

GetDeploying API 不提供数值库存，因此 quote 不填 `availableGpuCount`，只保留 `availabilityStatus: "AVAILABLE"`。API 也不提供机房 region/zone；`provider.country` 仅作为供应商总部国家。兼容现有筛选所需的标签固定写成“`<供应商> · 总部 <国家>`”，不得解释为机房地区。`providerUpdatedAt` 只取 `status.last_verified`；采集时间另存于 `sampledAt/lastAttemptAt/lastSuccessAt`，两者不可混用。

GetDeploying 明细仍按 offering 逐条返回，但供应商筛选键统一为 `GETDEPLOYING:<provider-id>`。同型号的 `sampleSize` 是排除 Vast.ai 后所有精确规格 offering 的总数，`medianPricePerGpuHour` 是这组 `hourly_per_gpu` 的中位数；历史序列另用 provider/offering 标识区分，因此同一供应商的多个 offering 不会在同一分钟互相覆盖。

GetDeploying 建议至少缓存 15 分钟，因此其独立缓存 `KOD_MARKET_GETDEPLOYING_CACHE_SECONDS` 默认且最小为 900 秒；即使整体 snapshot 与 Vast.ai 按默认的 `KOD_MARKET_REFRESH_SECONDS=60` 刷新，也只会复用缓存的 GetDeploying 响应，不会增加上游请求。同一缓存批次沿用实际 API 读取时间，不会每 60 秒伪造新的 GetDeploying 历史采样。其官方说明多数供应商报价约每日更新，部分每小时或更低频；15 分钟重新读取 API 不代表供应商价格发生变化。

Vast.ai 采集器继续只保留已验证、当前可租、按需实例，并按精确型号和显存过滤；`dph_total / num_gpus` 作为单 GPU 每小时总价。真实采样写入被 Git 忽略的 `release/app/dist/compute-market-history.json`，第二次有效采样后才会形成折线。

## 历史留存与查询范围

历史只保存服务实际采集到的报价，不会根据当前价格向过去回填。`KOD_MARKET_HISTORY_RETENTION_DAYS` 默认是 365 天，允许配置 30–730 天；低于或高于边界的值会分别收敛到 30 或 730 天，无效值使用默认值。延长留存只影响后续真实采样和仍在文件中的旧点，不会立即生成日、周或月历史。

历史接口支持 `1h`、`6h`、`24h`、`7d`、`30d`、`90d` 与 `365d`。请求范围大于已有数据覆盖时只返回实际存在的点，空白周期保持为空；`/health` 会返回当前留存天数、允许的上下限和支持的查询范围，方便前端在数据尚未积累时展示明确状态。

为限制本地 JSON 体积，最近 24 小时按分钟保留，更早的真实点按小时压缩，并在单序列或总量过大时均匀抽取；压缩和抽取不会插入价格、补齐缺口或把当前报价复制到过去。因此 90/365 天查询代表“最多可查的窗口”，不保证服务刚启动时已经具有对应时长的样本。

## 生产建议与授权边界

- 将 companion 逻辑迁移到 KOD 后端，密钥只保存在密钥管理服务；浏览器不得直连 GetDeploying API。
- 保留至少 15 分钟缓存、请求超时、限流和最后成功值；失败时返回 `STALE`，不能返回 0 元或模拟历史。
- GetDeploying 的正式计划有请求配额，分页上限为 100；应使用服务端过滤并避免无意义全量轮询。
- 不抓取 `https://getdeploying.com/gpus` 网页。GetDeploying [条款](https://getdeploying.com/terms) 禁止未经许可的系统抓取、镜像、原始数据再分发以及复制其核心功能；公开或商业比价产品上线前应取得符合实际用途的书面授权。
- GetDeploying 报价是信息性估算，最终价格和可用性应在实际供应商侧确认。
