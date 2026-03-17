import React, { useCallback, useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { parseEther, formatEther } from "ethers";
import addresses from "../contracts/addresses.json";

export const UserDashboard: React.FC = () => {
  const { address, contracts, refreshRole } = useWallet();
  const [vaultBalance, setVaultBalance] = useState<string>("0");
  const [tokenBalance, setTokenBalance] = useState<string>("0");
  const [riskScore, setRiskScore] = useState<number>(0);
  const [dailyLimit, setDailyLimit] = useState<string>("0");
  const [interestBps, setInterestBps] = useState<number>(0);
  const [lockedUntil, setLockedUntil] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [faucetAmount, setFaucetAmount] = useState("10000");

  const fetchData = useCallback(async () => {
    if (!address || !contracts.bankVault || !contracts.riskEngine || !contracts.token) return;
    try {
      const [bal, tok, score, limit, bps, locked] = await Promise.all([
        contracts.bankVault.balances(address),
        contracts.token.balanceOf(address),
        contracts.riskEngine.getRiskScore(address),
        contracts.riskEngine.getDailyLimit(address),
        contracts.riskEngine.getInterestRateBps(address),
        contracts.bankVault.lockedUntil(address),
      ]);
      setVaultBalance(formatEther(bal));
      setTokenBalance(formatEther(tok));
      setRiskScore(Number(score));
      setDailyLimit(formatEther(limit));
      setInterestBps(Number(bps));
      setLockedUntil(locked);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    }
  }, [address, contracts.bankVault, contracts.riskEngine, contracts.token]);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 8000);
    return () => clearInterval(t);
  }, [fetchData]);

  const isLocked = lockedUntil > 0n && BigInt(Math.floor(Date.now() / 1000)) < lockedUntil;

  const tx = useCallback(
    async (fn: () => Promise<unknown>, msg: string) => {
      setError(null);
      setLoading(true);
      try {
        await fn();
        await fetchData();
        await refreshRole();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [fetchData, refreshRole]
  );

  const onDeposit = () => {
    const amt = depositAmount.trim();
    if (!amt || !contracts.token || !contracts.bankVault) return;
    const wei = parseEther(amt);
    tx(
      async () => {
        const vaultAddr = addresses.bankVault;
        if (!vaultAddr) throw new Error("Contract address not configured");
        const approveTx = await contracts.token!.approve(vaultAddr, wei);
        await approveTx.wait();
        const depositTx = await contracts.bankVault!.deposit(wei);
        await depositTx.wait();
      },
      "Deposit"
    );
  };

  const onWithdraw = () => {
    const amt = withdrawAmount.trim();
    if (!amt || !contracts.bankVault) return;
    tx(async () => {
      const withdrawTx = await contracts.bankVault!.withdraw(parseEther(amt));
      await withdrawTx.wait();
    }, "Withdraw");
  };

  const onTransfer = () => {
    const to = transferTo.trim();
    const amt = transferAmount.trim();
    if (!to || !amt || !contracts.bankVault) return;
    tx(async () => {
      const transferTx = await contracts.bankVault!.transfer(to, parseEther(amt));
      await transferTx.wait();
    }, "Transfer");
  };

  const onRequestLoan = () => {
    const amt = loanAmount.trim();
    if (!amt || !contracts.bankVault) return;
    tx(async () => {
      const loanTx = await contracts.bankVault!.requestLoan(parseEther(amt));
      await loanTx.wait();
    }, "Request Loan");
  };

  const onFaucet = () => {
    const amt = faucetAmount.trim();
    if (!amt || !contracts.token || !address) return;
    tx(async () => {
      const mintTx = await contracts.token!.mint(address, parseEther(amt));
      await mintTx.wait();
    }, "Faucet");
  };

  return (
    <div className="panel">
      <h2>用户控制台</h2>
      {error && <p className="error-msg">{error}</p>}
      {loading && <p className="loading-msg">交易处理中…</p>}

      <section className="panel-section">
        <h3>资产与安全</h3>
        <p>金库余额: <strong>{vaultBalance}</strong> sUSD</p>
        <p>钱包 sUSD: <strong>{tokenBalance}</strong></p>
        <p>账户状态: {isLocked ? "已锁定（频率或风控）" : "正常"}</p>
      </section>

      <section className="panel-section">
        <h3>风险与额度</h3>
        <p>风险评分: <strong>{riskScore}</strong> / 100</p>
        <p>日转出限额: <strong>{dailyLimit}</strong> sUSD</p>
        <p>当前借贷年化 (bps): <strong>{interestBps}</strong> → 约 {(interestBps / 100).toFixed(2)}%</p>
      </section>

      <section className="panel-section">
        <h3>操作</h3>
        <div className="form-row">
          <label>存入</label>
          <input
            type="text"
            placeholder="数量"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
          />
          <button onClick={onDeposit} disabled={loading}>存入</button>
        </div>
        <div className="form-row">
          <label>取出</label>
          <input
            type="text"
            placeholder="数量"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
          />
          <button onClick={onWithdraw} disabled={loading}>取出</button>
        </div>
        <div className="form-row">
          <label>转账</label>
          <input
            type="text"
            placeholder="收款地址"
            value={transferTo}
            onChange={(e) => setTransferTo(e.target.value)}
          />
          <input
            type="text"
            placeholder="数量"
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
          />
          <button onClick={onTransfer} disabled={loading}>转账</button>
        </div>
        <div className="form-row">
          <label>申请借贷</label>
          <input
            type="text"
            placeholder="本金数量"
            value={loanAmount}
            onChange={(e) => setLoanAmount(e.target.value)}
          />
          <button onClick={onRequestLoan} disabled={loading}>申请借贷</button>
        </div>
        <div className="form-row">
          <label>领水 (sUSD)</label>
          <input
            type="text"
            placeholder="数量"
            value={faucetAmount}
            onChange={(e) => setFaucetAmount(e.target.value)}
          />
          <button onClick={onFaucet} disabled={loading}>领水</button>
        </div>
        <p className="hint">大额或超日限转账将进入托管，需两名审计员批准后到账。</p>
      </section>
    </div>
  );
};
