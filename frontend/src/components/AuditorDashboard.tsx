import React, { useCallback, useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { formatEther } from "ethers";

type EscrowRow = {
  caseId: number;
  from: string;
  to: string;
  amount: string;
  status: number;
  approvals: number;
};

const ESCROW_PENDING = 0;

export const AuditorDashboard: React.FC = () => {
  const { contracts, refreshRole } = useWallet();
  const [cases, setCases] = useState<EscrowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<number, string>>({});

  const fetchPending = useCallback(async () => {
    if (!contracts.bankVault) return;
    try {
      const nextId = await contracts.bankVault.nextCaseId();
      const list: EscrowRow[] = [];
      for (let id = 1; id < Number(nextId); id++) {
        const e = await contracts.bankVault.getEscrow(id);
        const status = Number(e.status_ ?? e[3]);
        list.push({
          caseId: id,
          from: e.from_ ?? e[0],
          to: e.to_ ?? e[1],
          amount: formatEther((e.amount_ ?? e[2]).toString()),
          status,
          approvals: Number(e.approvals_ ?? e[5]),
        });
      }
      setCases(list.filter((c) => c.status === ESCROW_PENDING));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    }
  }, [contracts.bankVault]);

  useEffect(() => {
    fetchPending();
    const t = setInterval(fetchPending, 5000);
    return () => clearInterval(t);
  }, [fetchPending]);

  const tx = useCallback(
    async (fn: () => Promise<unknown>) => {
      setError(null);
      setLoading(true);
      try {
        await fn();
        await fetchPending();
        await refreshRole();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [fetchPending, refreshRole]
  );

  const onApprove = (caseId: number) => {
    if (!contracts.bankVault) return;
    tx(async () => {
      const approveTx = await contracts.bankVault!.approveEscrow(caseId);
      await approveTx.wait();
    });
  };

  const onReject = (caseId: number) => {
    if (!contracts.bankVault) return;
    const reason = rejectReason[caseId] ?? "Rejected by auditor";
    tx(async () => {
      const rejectTx = await contracts.bankVault!.rejectEscrow(caseId, reason);
      await rejectTx.wait();
    });
  };

  return (
    <div className="panel">
      <h2>审计员控制台</h2>
      {error && <p className="error-msg">{error}</p>}
      {loading && <p className="loading-msg">交易处理中…</p>}

      <section className="panel-section">
        <h3>待审批托管转账</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Case ID</th>
              <th>From</th>
              <th>To</th>
              <th>Amount (sUSD)</th>
              <th>Approvals</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 && (
              <tr>
                <td colSpan={6}>暂无待审批工单</td>
              </tr>
            )}
            {cases.map((c) => (
              <tr key={c.caseId}>
                <td>{c.caseId}</td>
                <td title={c.from}>{c.from.slice(0, 6)}…{c.from.slice(-4)}</td>
                <td title={c.to}>{c.to.slice(0, 6)}…{c.to.slice(-4)}</td>
                <td>{c.amount}</td>
                <td>{c.approvals}/2</td>
                <td>
                  <button onClick={() => onApprove(c.caseId)} disabled={loading}>批准</button>
                  <input
                    type="text"
                    placeholder="拒绝原因"
                    className="input-inline"
                    value={rejectReason[c.caseId] ?? ""}
                    onChange={(e) => setRejectReason((r) => ({ ...r, [c.caseId]: e.target.value }))}
                  />
                  <button onClick={() => onReject(c.caseId)} disabled={loading}>拒绝</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">需至少 2 名审计员批准后资金才会到账；任一审计员可拒绝并退回发起人。</p>
      </section>
    </div>
  );
};
