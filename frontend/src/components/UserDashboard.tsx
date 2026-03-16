import React from "react";

export const UserDashboard: React.FC = () => {
  // 这里为了演示使用静态数据；实际项目中你可以用 ethers 连到合约
  const mockRiskScore = 42;
  const mockDailyLimit = 50000;
  const mockInterestRate = 3.8;

  return (
    <div className="panel">
      <h2>User Console</h2>
      <section className="panel-section">
        <h3>Asset &amp; Safety</h3>
        <p>Balance: 100,000 sUSD</p>
        <p>KYC / SBT: Verified ✔</p>
        <p>Account Status: Normal</p>
      </section>
      <section className="panel-section">
        <h3>Risk &amp; Credit</h3>
        <p>Risk Score: {mockRiskScore} / 100</p>
        <p>Daily Transfer Limit: {mockDailyLimit.toLocaleString()} sUSD</p>
        <p>Current Loan APR: {mockInterestRate}%</p>
      </section>
      <section className="panel-section">
        <h3>Actions</h3>
        <div className="actions-row">
          <button>Deposit</button>
          <button>Withdraw</button>
          <button>Transfer</button>
          <button>Request Loan</button>
        </div>
        <p className="hint">
          All actions are guarded by on-chain KYC/CDD/AML policies. Large or high-risk transfers
          will be escrowed and require auditor approval.
        </p>
      </section>
    </div>
  );
};

