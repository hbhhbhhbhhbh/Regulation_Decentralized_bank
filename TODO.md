# TODO (Handover Action Plan)

先看“3条主线”，再按每条的 3 个步骤做，不需要一次做完全部。

---

## 主线 1：把利率改成“跟池子状态联动”

目标：ETH 越少，借贷利率越高；借贷需求越强，存款收益越高。

### 具体步骤

- [ ] Step 1: 在 `BankVault.sol` 增加池子状态字段  
  `totalEthReserve`、`totalEthBorrowed`、`utilizationBps`
- [ ] Step 2: 接入 Jump Rate 公式  
  `borrowAPR = base + slope(U)`（含 `kink` 分段）
- [ ] Step 3: 计算存款年化  
  `depositAPY = borrowAPR * U * (1 - reserveFactor)`

### 完成标准

- [ ] 能在链上读到当前 `borrowAPR` 和 `depositAPY`
- [ ] 利用率升高时，`borrowAPR` 明显上升

---

## 主线 2：把借贷风控升级成“信用额度模型”

目标：借贷是否通过不再只看日限额，而是看信用额度 + 行为。

### 具体步骤

- [ ] Step 1: 增加信用额度字段  
  `creditLimit`、`usedCredit`、`availableCredit`
- [ ] Step 2: 借贷校验切换为额度校验  
  `requestLoan` 时检查 `requested <= availableCredit`
- [ ] Step 3: 加一个简单行为因子  
  拒审次数高降额，持续合规小幅提额

### 完成标准

- [ ] 用户能看到“可借额度”
- [ ] 超额度借贷请求会被拒绝，且提示明确

---

## 主线 3：新增“时间推进”的利息可视化页面（Interest Simulator）

目标：通过时间变化直观观察利息，不是写单元测试。

### 具体步骤

- [ ] Step 1: 新增页面 `InterestSimulator`（可交互模拟页）
- [ ] Step 2: 支持时间快进按钮  
  `+1天`、`+7天`、`+30天`、`重置到T0`
- [ ] Step 3: 输入与输出
  - 输入：初始存款 ETH、初始借贷 ETH、当前利率参数
  - 输出：存款累计利息、借贷累计利息、净收益/净成本、账户余额变化

### 完成标准

- [ ] 至少 3 组预设场景（正常/紧张/极端紧张）
- [ ] 页面上能直观看到“时间越长，利息如何变化”
---

## 建议执行顺序

1. 先做主线 1（利率联动）  
2. 再做主线 3（Interest Simulator，先把“时间变化利息”跑通）  
3. 然后做主线 2（信用额度）  

