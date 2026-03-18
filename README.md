# SafeHarbor 项目交接文档（最新版）

> 本文档面向“接手项目的开发者/运维/产品同事”。目标是让你在不看聊天记录的情况下，快速理解当前系统、跑起来、并能继续开发。

---

## 1. 项目定位与当前业务规则

SafeHarbor 是一个“监管即代码（Regulation-as-Code）”示例项目，核心是把银行流程拆成链上可审计规则。

### 当前业务模型（请以此为准）

- 记账单位是 `sUSD`（银行内部账本，`BankVault.balances`）。
- 外币目前**只支持原生 ETH**：
  - 存入：用户转入 ETH，前端按实时 ETH/USDT 价格换算后记入 sUSD。
  - 赎回：用户输入 ETH 数量，前端按实时价格换算需扣减的 sUSD，提交赎回工单。
  - 借贷：用户输入 ETH 借贷数量，前端按实时价格换算对应 sUSD 本金，提交借贷工单。
- 交易、借贷、赎回都支持“待审计”状态，**待审计不会立即执行**：
  - 需至少 2 名审计员批准才会真正执行。
  - 审计拒绝后会做回滚（如退还冻结额度/余额）。

> 注意：该项目用于教学/演示，不构成真实金融产品或监管意见。

---

## 2. 技术栈

- 合约：Solidity `0.8.20`，Hardhat，OpenZeppelin。
- 前端：React 18 + TypeScript + Vite。
- 链交互：ethers v6。
- 实时价格：前端通过 CoinGecko + ExchangeRate API 拉取。

---

## 3. 架构总览

### 3.1 合约层

- `IdentityRegistry.sol`：KYC 与不可转让 SBT（准入门槛）。
- `RiskEngine.sol`：风险分、日限额、利率参数。
- `ComplianceLog.sol`：合规事件日志（AML、审批、锁定等）。
- `BankVault.sol`：核心业务账本与流程编排（存入、转账、借贷、赎回、审计工单）。
- `MockStablecoin.sol`：演示用 ERC20（保留历史功能，核心流程当前以账本 + ETH 为主）。

### 3.2 前端层

- 公共页：展示产品信息、实时牌价、KYC流程。
- 用户页：存入/转账/借贷/赎回 + 交易历史 + 风险额度。
- 审计员页：审批托管转账、借贷工单、赎回工单。
- 管理员页：配置审计员、KYC、风险参数、黑名单、系统参数。

### 3.3 数据与控制流（高层）

1. 钱包连接后由 `WalletContext` 判定角色。
2. 用户操作发链上交易。
3. 若触发审计规则，先写入 Pending 工单。
4. 审计员审批后才执行最终资金动作。
5. 用户历史页通过事件扫描 + 工单状态查询显示“待审计/成功/失败”。

---

## 4. 端到端流程说明（最重要）

## 4.1 用户存入 ETH（外币入金）

1. 用户在“外币存入（ETH）”输入 ETH 数量。
2. 前端实时拿 ETH/USD 价格，计算 `susdAmount = eth * price`。
3. 调用 `BankVault.depositFromExternal(susdAmount, { value: ethWei })`。
4. 合约：
   - 收到原生 ETH（进入银行储备）；
   - 给用户银行账本增加 `susdAmount`。

## 4.2 用户平台内转账

1. 用户提交 sUSD 转账。
2. 合约做频率/日限额/大额检查：
   - 普通转账：直接执行，状态成功。
   - 高风险转账：进入 Escrow Pending。
3. 审计员 2 人批准后到账；拒绝则退回并归还额度占用。

## 4.3 用户借贷（输入 ETH 数量）

1. 用户输入“想借多少 ETH”。
2. 前端按实时价格换算 sUSD 本金并调用 `requestLoan(principalSusd)`。
3. 合约创建 Loan 工单（Pending），不立即放款。
4. 审计员审批：
   - 两票通过：执行放款 ETH 到用户钱包，同时更新账本。
   - 拒绝：工单失败，不执行放款。

## 4.4 用户赎回（输入 ETH 数量）

1. 用户输入“想赎回多少 ETH”。
2. 前端按实时价格换算需要扣减的 sUSD，提交 `redeemToAsset("ETH", susdAmount, ethAmount)`。
3. 合约创建 Redeem 工单（Pending）并冻结对应 sUSD（先扣账），不立即打 ETH。
4. 审计员审批：
   - 两票通过：合约把 `ethAmount` 打给用户钱包。
   - 拒绝：把冻结的 sUSD 退回用户账本。

---

## 5. 角色与权限

- `Admin`：
  - 管理审计员（`addAuditor/removeAuditor`）。
  - 配置频率参数、黑名单、系统暂停恢复。
  - 执行 KYC 注册与风险初始化（通过前端调用 `IdentityRegistry` / `RiskEngine`）。
- `Auditor`：
  - 审批三类待审工单：转账、借贷、赎回。
- `User`：
  - 存入 ETH、平台内转账、借贷申请、赎回申请。
- `none`：
  - 未完成 KYC 的地址，仅能看公开信息。

---

## 6. 本地运行指南（从零开始）

## 6.1 安装

```bash
npm install
cd frontend
npm install
```

## 6.2 启动本地链

```bash
npx hardhat node
```

## 6.3 编译并部署

```bash
npx hardhat compile
npx hardhat run scripts/deploy.ts --network localhost
```

部署脚本会：

- 部署 5 个合约（MockStablecoin / IdentityRegistry / RiskEngine / ComplianceLog / BankVault）。
- 自动写入 `frontend/src/contracts/addresses.json`。
- 自动导出 ABI 到 `frontend/src/contracts/abis/*.json`。
- 初始化一个测试用户与两个审计员（便于本地演示）。

## 6.4 启动前端

```bash
cd frontend
npm run dev
```

默认 `http://localhost:5173`。

---

## 7. 修改合约后的必做事项（非常关键）

只要你改了 `contracts/*.sol` 的函数签名或事件，必须做以下步骤：

1. `npx hardhat compile`
2. 重新跑部署脚本（或至少同步 ABI）  
3. 确认 `frontend/src/contracts/abis/BankVault.json` 是最新
4. 重新启动前端

否则会出现典型报错：

- `invalid BigNumberish value`（前端按旧 ABI 调新函数）
- `CALL_EXCEPTION`（参数位置错、签名不匹配）

---

## 8. 目录与文件用途（交接重点）

以下按“是否需要人工维护”分组。

## 8.1 人工维护（核心）

### 根目录

- `package.json`：根脚本（前端转发、hardhat 命令入口）。
- `hardhat.config.ts`：编译器版本、路径、mocha 超时。
- `tsconfig.json`：根 TS 配置。
- `README.md`：本交接文档。
- `.gitignore`：忽略规则。

### 合约目录 `contracts/`

- `BankVault.sol`：核心业务合约。
  - 用户账本：`balances`。
  - 转账托管工单：Escrow。
  - 借贷工单：LoanCase。
  - 赎回工单：RedeemCase。
  - 合规开关：黑名单、锁定、暂停。
- `IdentityRegistry.sol`：KYC 记录 + 不可转让 SBT。
- `RiskEngine.sol`：风险评分、日限额、动态利率参数。
- `ComplianceLog.sol`：监管事件汇总。
- `MockStablecoin.sol`：演示 ERC20（兼容旧流程、测试用途）。

### 部署脚本 `scripts/`

- `deploy.ts`：一键部署、角色初始化、写前端地址与 ABI。

### 前端目录 `frontend/`

- `package.json`：前端依赖与脚本。
- `vite.config.ts`：Vite 配置（端口 5173）。
- `tsconfig.json`：前端 TS 配置。
- `src/main.tsx`：React 入口。
- `src/App.tsx`：页面骨架 + 按角色切换 Tab。
- `src/styles.css`：全局样式。
- `src/context/WalletContext.tsx`：
  - 钱包连接、网络切换（31337）、角色识别、合约实例注入。
- `src/context/RatesContext.tsx`：封装实时汇率 Provider。
- `src/hooks/useLiveRates.ts`：实时拉取 ETH/USDT 等价格与外汇。
- `src/data/rates.ts`：价格类型、币种元数据、fallback 数据。
- `src/components/RatesPanel.tsx`：实时牌价面板。
- `src/components/PublicBankView.tsx`：公开页（产品说明、KYC 流程）。
- `src/components/UserDashboard.tsx`：
  - 用户核心页：存入/转账/借贷/赎回、额度展示、交易扫描与状态。
- `src/components/AuditorDashboard.tsx`：
  - 审计员审批页：托管转账、借贷、赎回三类 Pending 工单。
- `src/components/AdminDashboard.tsx`：
  - 管理员控制页：审计员、KYC、风险参数、黑名单、系统开关等。
- `src/contracts/addresses.json`：
  - 当前网络合约地址（部署脚本写入）。
- `src/contracts/abis/*.json`：
  - 前端调用 ABI（部署脚本导出）。

## 8.2 自动生成（通常不手改）

- `artifacts/**`：Hardhat 编译产物。
- `cache/**`：Hardhat 缓存。
- `typechain-types/**`：TypeChain 生成类型。
- `frontend/package-lock.json`、`package-lock.json`：锁文件。

---

## 9. 当前已知约束与注意点

- 实时汇率来自前端 API（off-chain），合约本身不含链上预言机。
- 因此“ETH 数量与 sUSD 数量换算”由前端完成并作为参数传入合约。
- 这是演示型设计，生产环境建议：
  - 引入链上预言机（如 Chainlink）；
  - 增加价格过期、滑点和签名验证机制。

---

## 10. 常见问题排查

### Q1: `rate not set`

- 这是旧逻辑报错；如果你看到它，说明前端 ABI 仍是旧版本或部署未同步。
- 处理：重新编译 + 重新部署 + 同步 ABI。

### Q2: `invalid BigNumberish value`

- 前端传参数结构与合约函数签名不一致（常见于 ABI 过旧）。
- 处理：同上，确保 `frontend/src/contracts/abis/BankVault.json` 最新。

### Q3: `insufficient ETH reserve`

- 合约 ETH 储备不足以支付放款/赎回。
- 处理：
  - 先给 `BankVault` 地址转入足够 ETH；
  - 或降低本次借贷/赎回 ETH 数量。

### Q4: 用户交易记录不显示

- 常见原因：
  - 不是通过平台合约发起；
  - 地址大小写或旧 ABI 问题；
  - 前端未轮询到最新区块。
- 处理：确认从平台按钮发起、等待轮询、刷新并检查 ABI。

---

## 11. 交接建议（给下一任）

- 先跑一次完整本地流程：存入 ETH → 转账（触发托管）→ 审批 → 借贷 → 审批 → 赎回 → 审批。
- 每次改合约都把“函数签名变化”同步到前端调用点并更新 ABI。
- 若要上生产级：
  - 加预言机；
  - 加测试（Hardhat + 前端集成）；
  - 把审计条件配置化并做权限分层。

---

## 12. 操作手册附录（按角色点击路径）

本节用于给产品、测试、运营同事直接照着点页面完成演示。默认前提是：本地链与前端已启动，钱包已连接到 `31337`。

### 12.1 管理员（Admin）首次初始化

1. 连接管理员地址（部署脚本输出中的 deployer）。
2. 点击顶部 `管理员` Tab。
3. 在 `审计员管理`：
   - 输入审计员地址 A，点 `添加审计员`；
   - 输入审计员地址 B，点 `添加审计员`。
4. 在 `KYC 注册（创建用户）`：
   - 输入用户地址；
   - 风险标签（例如 `40`）；
   - 国家码（例如 `HK`）；
   - 点 `注册 KYC`。
5. 在 `风险初始化（用户日限额与利率）`：
   - 输入同一用户地址；
   - 风险分（例如 `40`）；
   - 日限额（例如 `50000`）；
   - 点 `初始化风险`。
6. 可选：在 `频率与锁定参数` 调整 AML 参数；在 `黑名单` 添加/移除限制地址。

### 12.2 用户（User）完整业务链路

1. 用已 KYC 的用户地址连接钱包，进入 `用户` Tab。
2. **存入 ETH**：
   - 在 `外币存入（仅支持 ETH -> 银行 sUSD）` 输入 ETH 数量；
   - 点 `存入并记入银行 sUSD`；
   - 观察概览里的银行 sUSD 余额增加。
3. **转账（触发待审计）**：
   - 在 `转账（平台内）` 填收款地址和金额（可故意填大额触发托管）；
   - 点 `转账`；
   - 到 `我的交易` 确认状态为 `待审计`（或小额时直接 `成功`）。
4. **借贷申请（输入 ETH）**：
   - 在 `申请借贷（ETH）` 填借贷 ETH 数量；
   - 点 `申请借贷`；
   - 到 `我的交易` 看 `loan` 记录，初始 `待审计`。
5. **赎回申请（输入 ETH）**：
   - 在 `赎回（银行 sUSD -> ETH）` 填赎回 ETH 数量；
   - 点 `申请赎回`；
   - 到 `我的交易` 看 `redeem` 记录，初始 `待审计`。

### 12.3 审计员（Auditor）审批路径

1. 用审计员地址 A 连接钱包，进入 `审计员` Tab。
2. 在三个列表中处理待办：
   - `待审批托管转账`
   - `待审批借贷申请`
   - `待审批赎回申请`
3. 对同一工单点 `批准`（此时通常显示 `1/2`，不会执行最终资金动作）。
4. 切换到审计员地址 B，再次对同一工单点 `批准`：
   - 达到 `2/2` 后才真正执行：
     - 转账：资金到账；
     - 借贷：ETH 放款执行；
     - 赎回：ETH 打款执行。
5. 若点 `拒绝`：
   - 转账工单：回滚给发起人并归还额度；
   - 借贷工单：状态失败，不放款；
   - 赎回工单：状态失败并退回冻结 sUSD。

### 12.4 演示标准脚本（推荐）

按下面顺序做，最容易对外演示：

1. Admin 初始化用户与 2 名审计员。
2. User 存入 `1 ETH`。
3. User 发起一笔大额转账（触发托管）。
4. User 发起借贷申请（ETH）。
5. User 发起赎回申请（ETH）。
6. Auditor A 批准三笔工单（全部保持待审计）。
7. Auditor B 再批准三笔工单（全部实际执行）。
8. 回到 User 的 `我的交易` 展示三类状态从 `待审计` 到 `成功` 的变化。

---

如果你刚接手本项目，建议从 `contracts/BankVault.sol` 和 `frontend/src/components/UserDashboard.tsx` 两个文件开始读，它们覆盖了 80% 的业务行为与问题定位路径。
