# monthly-compute-hosting-client

## ADDED Requirements

### Requirement: Rent and list a platform server
客户端 SHALL 允许用户以可回购卡时按月租用平台服务器，并展示平台统一销售价格，不允许用户编辑售价。

#### Scenario: Monthly rental succeeds
- **WHEN** 用户可回购卡时足够并确认租用
- **THEN** 客户端展示租期、服务器状态、市场上架状态和默认开启的自动续租

### Requirement: Control renewal
客户端 SHALL 提供小型自动续租开关；关闭后当前租期保持有效，到期停止接新订单并在存量订单结束后下架。

#### Scenario: User disables renewal
- **WHEN** 用户关闭自动续租
- **THEN** 客户端显示到期不续租及履约后下架说明

### Requirement: Correct terminology
客户端 SHALL 将旧普通业务“算力托管”更名为“算力租赁”，并只把平台服务器月租转售业务称为“卡时托管”。

#### Scenario: User opens the compute center
- **WHEN** 用户查看普通算力购买与平台服务器月租入口
- **THEN** 普通业务显示“算力租赁”，平台服务器月租转售显示“卡时托管”
