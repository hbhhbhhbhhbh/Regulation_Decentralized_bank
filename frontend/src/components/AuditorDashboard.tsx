import React, { useCallback, useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { formatEther, parseEther } from "ethers";
import { useRates } from "../context/RatesContext";

type EscrowRow = {
  caseId: number;
  from: string;
  to: string;
  amount: string;
  status: number;
  approvals: number;
};

type LoanRow = {
  loanId: number;
  borrower: string;
  principal: string;
  rateBps: number;
  status: number;
  approvals: number;
};

type RedeemRow = {
  redeemId: number;
  user: string;
  assetSymbol: string;
  susdAmount: string;
  ethAmount: string;
  status: number;
  approvals: number;
};

const ESCROW_PENDING = 0;
const LOAN_PENDING = 0;
const REDEEM_PENDING = 0;

export const AuditorDashboard: React.FC = () => {
  const { contracts, refreshRole } = useWallet();
  const { assetPricesUSD } = useRates();
  const [cases, setCases] = useState<EscrowRow[]>([]);
  const [loanCases, setLoanCases] = useState<LoanRow[]>([]);
  const [redeemCases, setRedeemCases] = useState<RedeemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<number, string>>({});
  const [loanRejectReason, setLoanRejectReason] = useState<Record<number, string>>({});
  const [redeemRejectReason, setRedeemRejectReason] = useState<Record<number, string>>({});

  const fetchPending = useCallback(async () => {
    if (!contracts.bankVault) return;
    try {
      // 托管转账工单
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

      // 借贷工单
      const nextLoanId = await contracts.bankVault.nextLoanId();
      const loanList: LoanRow[] = [];
      for (let id = 1; id < Number(nextLoanId); id++) {
        const lc = await contracts.bankVault.getLoanCase(id);
        const status = Number(lc.status_ ?? lc[3]);
        loanList.push({
          loanId: id,
          borrower: lc.borrower_ ?? lc[0],
          principal: formatEther((lc.principal_ ?? lc[1]).toString()),
          rateBps: Number(lc.rateBps_ ?? lc[2]),
          status,
          approvals: Number(lc.approvals_ ?? lc[5]),
        });
      }
      setLoanCases(loanList.filter((l) => l.status === LOAN_PENDING));

      // 赎回工单
      const nextRedeemId = await contracts.bankVault.nextRedeemId();
      const redeemList: RedeemRow[] = [];
      for (let id = 1; id < Number(nextRedeemId); id++) {
        const rc = await contracts.bankVault.getRedeemCase(id);
        const status = Number(rc.status_ ?? rc[4]);
        redeemList.push({
          redeemId: id,
          user: rc.user_ ?? rc[0],
          assetSymbol: rc.assetSymbol_ ?? rc[1],
          susdAmount: formatEther((rc.susdAmount_ ?? rc[2]).toString()),
          ethAmount: formatEther((rc.ethAmount_ ?? rc[3]).toString()),
          status,
          approvals: Number(rc.approvals_ ?? rc[6]),
        });
      }
      setRedeemCases(redeemList.filter((r) => r.status === REDEEM_PENDING));
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

  const onApproveLoan = (loanId: number, principal: string) => {
    if (!contracts.bankVault) return;
    const ethPrice = assetPricesUSD.find((a) => a.symbol === "ETH")?.priceUSD || 0;
    const principalNum = Number(principal);
    if (!ethPrice || !principalNum || principalNum <= 0) return;
    const ethAmount = principalNum / ethPrice;
    const ethWei = parseEther(ethAmount.toString());
    tx(async () => {
      const approveTx = await contracts.bankVault!.approveLoan(loanId, ethWei);
      await approveTx.wait();
    });
  };

  const onRejectLoan = (loanId: number) => {
    if (!contracts.bankVault) return;
    const reason = loanRejectReason[loanId] ?? "Rejected by auditor";
    tx(async () => {
      const rejectTx = await contracts.bankVault!.rejectLoan(loanId, reason);
      await rejectTx.wait();
    });
  };

  const onApproveRedeem = (redeemId: number) => {
    if (!contracts.bankVault) return;
    tx(async () => {
      const approveTx = await contracts.bankVault!.approveRedeem(redeemId);
      await approveTx.wait();
    });
  };

  const onRejectRedeem = (redeemId: number) => {
    if (!contracts.bankVault) return;
    const reason = redeemRejectReason[redeemId] ?? "Rejected by auditor";
    tx(async () => {
      const rejectTx = await contracts.bankVault!.rejectRedeem(redeemId, reason);
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
        <p className="hint">转账：需至少 2 名审计员批准后资金才会到账；任一审计员可拒绝并退回发起人。</p>
      </section>

      <section className="panel-section">
        <h3>待审批借贷申请</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Loan ID</th>
              <th>Borrower</th>
              <th>Principal (sUSD)</th>
              <th>Rate (bps)</th>
              <th>Approvals</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loanCases.length === 0 && (
              <tr>
                <td colSpan={6}>暂无待审批借贷工单</td>
              </tr>
            )}
            {loanCases.map((l) => (
              <tr key={l.loanId}>
                <td>{l.loanId}</td>
                <td title={l.borrower}>{l.borrower.slice(0, 6)}…{l.borrower.slice(-4)}</td>
                <td>{l.principal}</td>
                <td>{l.rateBps}</td>
                <td>{l.approvals}/2</td>
                <td>
                  <button onClick={() => onApproveLoan(l.loanId, l.principal)} disabled={loading}>批准</button>
                  <input
                    type="text"
                    placeholder="拒绝原因"
                    className="input-inline"
                    value={loanRejectReason[l.loanId] ?? ""}
                    onChange={(e) => setLoanRejectReason((r) => ({ ...r, [l.loanId]: e.target.value }))}
                  />
                  <button onClick={() => onRejectLoan(l.loanId)} disabled={loading}>拒绝</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">借贷：同样需要至少 2 名审计员批准后才视为通过；拒绝后用户可重新发起。</p>
      </section>

      <section className="panel-section">
        <h3>待审批赎回申请</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Redeem ID</th>
              <th>User</th>
              <th>资产</th>
              <th>sUSD</th>
              <th>ETH</th>
              <th>Approvals</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {redeemCases.length === 0 && (
              <tr>
                <td colSpan={7}>暂无待审批赎回工单</td>
              </tr>
            )}
            {redeemCases.map((r) => (
              <tr key={r.redeemId}>
                <td>{r.redeemId}</td>
                <td title={r.user}>{r.user.slice(0, 6)}…{r.user.slice(-4)}</td>
                <td>{r.assetSymbol}</td>
                <td>{r.susdAmount}</td>
                <td>{r.ethAmount}</td>
                <td>{r.approvals}/2</td>
                <td>
                  <button onClick={() => onApproveRedeem(r.redeemId)} disabled={loading}>批准</button>
                  <input
                    type="text"
                    placeholder="拒绝原因"
                    className="input-inline"
                    value={redeemRejectReason[r.redeemId] ?? ""}
                    onChange={(e) => setRedeemRejectReason((prev) => ({ ...prev, [r.redeemId]: e.target.value }))}
                  />
                  <button onClick={() => onRejectRedeem(r.redeemId)} disabled={loading}>拒绝</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">赎回：进入待审计后不会立即打款，需至少 2 名审计员批准后才会把 ETH 转到用户钱包。</p>
      </section>
    </div>
  );
};
