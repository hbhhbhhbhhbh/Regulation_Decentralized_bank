# SafeHarbor (SHIB) – Regulated DeFi Bank Simulator

SafeHarbor (SHIB) 是一个将去中心化金融 (DeFi) 与传统银行监管 (TradFi) 相结合的教学/实验性模拟项目，核心目标是在链上演示 **“监管即代码 (Regulation-as-Code)”**：

- 通过 **主动合规 (KYC / CDD / AML)** 换取：
  - 资产安全性（找回权 / 挂起托管）
  - 出入金合规性（链上审计足迹）
  - 信用借贷特权（风险定价利率）
- 演示如何用 Solidity 智能合约 + 前端 UI 实现：
  - 身份准入 (KYC + Soulbound Token)
  - 动态尽职调查与限额 (CDD)
  - 行为监控与拦截 (AML)

> 本项目仅供教学与概念验证使用，不构成任何真实金融产品或合规意见。

---

## 1. 技术栈

- **链上 / 合约层**
  - Solidity ^0.8.20
  - Hardhat + TypeScript (`hardhat.config.ts`)
  - OpenZeppelin 合约库

- **前端层**
  - React 18 + TypeScript
  - Vite 开发工具

---

## 2. 项目结构

```text
project/
 ├─ package.json              # 根项目脚本（Hardhat + 前端转发）
 ├─ hardhat.config.ts         # Hardhat 配置 (Solidity 0.8.20)
 ├─ contracts/
 │   ├─ IdentityRegistry.sol  # 身份注册 + SBT (KYC)
 │   ├─ RiskEngine.sol        # 风险评分 + 日限额 + 利率
 │   ├─ ComplianceLog.sol     # 合规事件日志 (审计足迹)
 │   └─ BankVault.sol         # 金库 + AML 监控 + 托管 + 多签审批
 ├─ scripts/
 │   └─ deploy.ts             # 一键部署所有合约
 └─ frontend/
     ├─ package.json
     ├─ vite.config.ts
     ├─ tsconfig.json
     ├─ index.html
     └─ src/
         ├─ main.tsx          # React 入口
         ├─ App.tsx           # 角色切换 (User / Auditor / Admin)
         ├─ components/
         │   ├─ UserDashboard.tsx
         │   ├─ AuditorDashboard.tsx
         │   └─ AdminDashboard.tsx
         └─ styles.css        # 深色金融风 UI 样式
```

---

## 3. 三大监管支柱模块

### 3.1 KYC – 身份准入 (`IdentityRegistry.sol`)

- `registerKYC(user, riskProfile, countryCode)`：
  - 由具有 `KYC_OFFICER_ROLE` 的地址调用。
  - 为用户登记 KYC 记录，并向其地址铸造 **不可转让 Soulbound Token (SBT)**。
- `hasValidSBT(user)`：
  - 检查用户是否完成 KYC 且仍持有 SBT。
  - **所有受监管资金操作前置 require(hasValidSBT(msg.sender)) 检查**（在 `BankVault` 中实现）。

> 意图：只有通过身份验证的地址才能参与受监管的存款、转账和借贷操作。

### 3.2 CDD – 动态尽职调查与限额 (`RiskEngine.sol`)

- 为每个用户维护：
  - `riskScore`：1–100，风险越高数值越大。
  - `dailyTransferLimit`：该用户的每日出金限额。
- 重要函数：
  - `initRisk(user, score, dailyLimit)`：初始化风险档案（根据职业/地区/申报资产等）。
  - `updateRisk(user, newScore, newDailyLimit)`：根据行为表现动态调整。
  - `getInterestRateBps(user)`：
    - 利率模型示意：  
      `interest = baseInterestBps + riskSlopeBps * (riskScore / 100)`
    - 风险越高，借贷年化利率越高，实现 **“风险即价格”**。

### 3.3 AML – 行为监控与拦截 (`BankVault.sol` + `ComplianceLog.sol`)

在 `BankVault.transfer` 中嵌入 AML 监控钩子：

- **阈值拦截**
  - 单笔交易金额 ≥ 10,000（`TEN_K`），或
  - 累加后超过 `RiskEngine` 给定的 `dailyTransferLimit`，
  - → 资金从发起人余额中划出，进入金库托管 `EscrowTransfer`，`status = Pending`。
  - 产生事件：`EscrowCreated` + `TransferEscrowed` + `AMLAlert`。

- **频率检测**
  - 维护每个地址 1 分钟滚动窗口内转账次数：
    - `frequencyWindow = 60` 秒
    - `maxTxPerWindow = 3`
  - 若 `count > 3`：
    - 自动锁定账户 `lockDuration = 1 hours`
    - 产生 `AMLAlert` + `AccountLocked` 事件。

- **黑名单检查**
  - 映射 `blacklisted[address]`：
    - 若发起人/收款人在黑名单内，则拒绝交易。
  - 由 `Admin` 通过 `setBlacklist` 管理，事件 `BlacklistUpdated` 记录变更。

- **审计员多签审批**
  - 托管交易结构 `EscrowTransfer`：
    - 记录 `from` / `to` / `amount` / `status` / `approvals`。
  - 审计员 (`AUDITOR_ROLE`)：
    - `approveEscrow(caseId)`：为待审交易签名，通过 `ComplianceLog.TransferApproved` 记录。
    - 至少 **2 名审计员**批准后，`status = Approved`，将金额从托管记账到账给收款人。
    - `rejectEscrow(caseId, reason)`：任意一名审计员拒绝，资金回滚给发起人。

---

## 4. 角色与权限设计

### 4.1 正常用户 (User)

- **主要能力**
  - 注册 / 完成 KYC（链下由 `KYC_OFFICER` 触发合约）
  - 存款：`BankVault.deposit`
  - 取款：`BankVault.withdraw`
  - 发起转账：`BankVault.transfer`
  - 申请借贷：`BankVault.requestLoan`

- **前端 UI (`UserDashboard.tsx`)**
  - 显示：
    - 当前余额（示例数据）
    - KYC / SBT 状态
    - 账户锁定状态
    - 风险评分、日限额、当前动态利率
  - 操作按钮：
    - Deposit / Withdraw / Transfer / Request Loan  
    - 文案提示：部分交易会因 AML 或 CDD 规则被挂起托管。

### 4.2 审计员 (Auditor)

- **主要能力**
  - 查看 Pending 托管交易：
    - 根据 `ComplianceLog.TransferEscrowed` 事件构建工单列表。
  - 执行多签审批：
    - `approveEscrow(caseId)`：签名并在阈值达到后放行资金。
    - `rejectEscrow(caseId, reason)`：拒绝并回滚资金。
  - 触发 EDD（增强尽职调查）：
    - 可扩展为发出 `EDDRequested` 事件，请求用户补交材料。

- **前端 UI (`AuditorDashboard.tsx`)**
  - 表格展示：
    - `caseId / from / to / amount / reason / approvals`
  - 操作：
    - `[Approve]` / `[Reject]` 按钮。
  - 用于构建“异常交易仪表盘”：展示大额 / 超限 / 频率过高账户及资金流向。

### 4.3 系统管理员 (Admin)

- **主要能力**
  - 管理审计员名单：
    - `addAuditor(address)` / `removeAuditor(address)`。
  - 调整全局参数：
    - AML 频率窗口 / 最大次数 / 锁定时间：`setFrequencyParams`。
    - 黑名单管理：`setBlacklist(address, bool)`。
  - （可拓展）管理封禁国家列表，对接 `IdentityRegistry.countryCode`。

- **前端 UI (`AdminDashboard.tsx`)**
  - 提供入口按钮：
    - 管理审计员
    - 调整频率检测与风险/利率曲线
    - 管理黑名单 / 制裁名单

---

## 4.4 部署后：哪些地址是哪些角色

部署完成后，**只有部署时使用的那个地址**自动具备权限；其余角色需在管理员界面里配置。

| 角色 | 部署后默认对应地址 | 说明 |
|------|-------------------|------|
| **管理员 Admin** | 部署账户（执行 `deploy.ts` 的 signer） | 本地节点下通常为 Hardhat 账户 #0，例如 `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`。同时拥有 KYC 官、风险官、sUSD 铸币权限。 |
| **审计员 Auditor** | 无 | 需管理员在「管理员」页面输入某地址并点击「添加审计员」后，该地址才成为审计员。 |
| **用户 User** | 无 | 需管理员在「管理员」页面：①「KYC 注册」里为该地址注册 KYC；②「风险初始化」里为该地址设置风险分与日限额。完成后该地址连接前端会显示「用户」界面。 |

**本地测试常用账户（Hardhat 默认）：**

- **#0** `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` → 部署者，即 **管理员**
- **#1** `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` → 可被设为审计员或用户
- **#2** `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` → 可被设为用户

前端按**当前连接的钱包地址**从链上读取角色，只展示该角色对应的一个界面（管理员 / 审计员 / 用户 / 未注册）。

---

## 5. 系统运行 & 开发步骤

### 5.1 安装依赖

在项目根目录（本 README 同级）执行：

```bash
# 安装 Hardhat 等根依赖
npm install

# 安装前端依赖
cd frontend
npm install
```

### 5.2 运行本地区块链与部署合约

1. 启动本地 Hardhat 节点（新终端）：

```bash
npx hardhat node
```

2. 在另一个终端中部署合约：

```bash
npx hardhat run scripts/deploy.ts --network localhost
```

部署脚本会依次部署：

- ERC20 Mock Token (`MockStablecoin`)：用于模拟 sUSD
- `IdentityRegistry`
- `RiskEngine`
- `ComplianceLog`
- `BankVault`

控制台会打印各合约地址，前端在接链时需要这些地址。

### 5.3 启动前端

在 `frontend/` 目录：

```bash
npm run dev
```

然后在浏览器打开 Vite 提示的地址（通常为 `http://localhost:5173`）。连接钱包后：

- 页面会按**当前地址的链上角色**只显示对应一个界面（管理员 / 审计员 / 用户 / 未注册）。
- 各角色功能均通过合约调用完成，无静态假数据。

---

## 6. 典型场景：大额交易被拦截，审计放行

### 步骤概览

1. **Alice KYC 完成并初始化风险**
   - `KYC_OFFICER` 调用 `IdentityRegistry.registerKYC(Alice, 40, "HK")`
   - `RISK_OFFICER` 调用 `RiskEngine.initRisk(Alice, 40, 50_000 * 1e18)`
   - Alice 通过 `BankVault.deposit` 存入 100,000 sUSD。

2. **Alice 发起大额转账**
   - 在 User 界面输入：
     - 收款人 Bob
     - 金额 20,000 sUSD（> 10,000 阈值）
   - DApp 调用 `BankVault.transfer(Bob, 20_000 * 1e18)`。

3. **合约拦截 & 托管**
   - 身份检查：`hasValidSBT(Alice)` 通过。
   - AML 频率检查：未超 1 分钟 3 笔阈值。
   - CDD 限额检查：
     - 日限额 50,000，当前已用 5,000 → 未超限；
     - 但单笔金额 ≥ 10,000 → 触发大额拦截。
   - `BankVault`：
     - 创建 `EscrowTransfer`（`status = Pending`，`caseId = X`）。
     - 从 Alice 余额中划出 20,000（托管），Bob 暂未到账。
   - `ComplianceLog`：
     - 发出 `TransferEscrowed(X, Alice, Bob, 20_000, "LARGE_TX")`。
     - 发出 `AMLAlert(Alice, "LARGE_TX", "Escrowed for manual review")`。

4. **审计员 A 初审**
   - 在 Auditor 界面看到待处理工单 `caseId = X`：
     - 原因：`LARGE_TX`，金额 20,000，审批数 0/2。
   - 点击 `[Approve]`：
     - 调用 `approveEscrow(X)` → `approvals = 1`，状态仍 `Pending`。

5. **审计员 B 复核并放行**
   - Auditor 仪表盘中显示工单 `X` 已获 1/2 签名。
   - 审计员 B 点击 `[Approve]`：
     - 调用 `approveEscrow(X)` → `approvals = 2`，满足多签阈值。
     - `status = Approved`，`balances[Bob] += 20_000`。

6. **结果**
   - Alice 前端：
     - 托管中的 20,000 标记为“已完成转出”。
     - 总余额 80,000。
   - Bob 前端：
     - 余额增加到 20,000。
   - Auditor 仪表盘：
     - `caseId = X` 移动到“已完成”列表，可以查看完整合规行动轨迹。

---

## 7. 下一步

你可以在此基础上进一步扩展：

- 为前端接入真实的合约地址 & `ethers` 调用，实现完整交互。
- 增加图表组件（如 Recharts / ECharts）展示：
  - 用户余额趋势
  - 风险评分变动
  - 异常交易分布
- 扩展 `IdentityRegistry` 与 `RiskEngine`，加入更多维度（职业、行业、PEP 标记等），做更精细的 CDD/EDD 策略建模。

SafeHarbor (SHIB) 作为一个 RegTech/DeFi 教学样例，可以用来向监管、风控和开发团队演示如何把抽象的监管条款转化为 **可以被审计、被测试、可形式化验证的代码逻辑**。  

"# Regulation_Decentralized_bank" 
