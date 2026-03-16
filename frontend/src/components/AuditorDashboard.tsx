import React from "react";

const mockCases = [
  {
    caseId: 1,
    from: "0xAlice...",
    to: "0xBob...",
    amount: 20000,
    reason: "LARGE_TX",
    approvals: 1
  },
  {
    caseId: 2,
    from: "0xCarol...",
    to: "0xDex...",
    amount: 60000,
    reason: "DAILY_LIMIT",
    approvals: 0
  }
];

export const AuditorDashboard: React.FC = () => {
  return (
    <div className="panel">
      <h2>Auditor Console</h2>
      <section className="panel-section">
        <h3>Pending Escrowed Transfers</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Case ID</th>
              <th>From</th>
              <th>To</th>
              <th>Amount</th>
              <th>Reason</th>
              <th>Approvals</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {mockCases.map((c) => (
              <tr key={c.caseId}>
                <td>{c.caseId}</td>
                <td>{c.from}</td>
                <td>{c.to}</td>
                <td>{c.amount.toLocaleString()} sUSD</td>
                <td>{c.reason}</td>
                <td>{c.approvals}/2</td>
                <td>
                  <button>Approve</button>
                  <button>Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">
          Approvals require at least 2 distinct auditors to release funds from escrow. Any auditor
          can reject and roll funds back to the sender if AML red flags persist.
        </p>
      </section>
    </div>
  );
};

