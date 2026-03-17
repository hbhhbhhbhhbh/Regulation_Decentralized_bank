import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { parseEther, formatEther } from "ethers";
import { useRates } from "../context/RatesContext";

export const UserDashboard: React.FC = () => {
  const { address, contracts, refreshRole } = useWallet();
  const { assetPricesUSD } = useRates();
  const [vaultBalance, setVaultBalance] = useState<string>("0");
  const [tokenBalance, setTokenBalance] = useState<string>("0");
  const [riskScore, setRiskScore] = useState<number>(0);
  const [dailyLimit, setDailyLimit] = useState<string>("0");
  const [dailySpent, setDailySpent] = useState<string>("0");
  const [dailyRemaining, setDailyRemaining] = useState<string>("0");
  const [loanLimit, setLoanLimit] = useState<string>("0");
  const [interestBps, setInterestBps] = useState<number>(0);
  const [lockedUntil, setLockedUntil] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [depositAmount, setDepositAmount] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [faucetAmount, setFaucetAmount] = useState("10000");

  // 外币兑换统一使用 ETH
  const [assetSymbol, setAssetSymbol] = useState("ETH");
  const [assetAmount, setAssetAmount] = useState("");
  const [redeemAssetSymbol, setRedeemAssetSymbol] = useState("ETH");
  const [redeemEthAmount, setRedeemEthAmount] = useState("");

  const mainAssets = useMemo(
    () => assetPricesUSD.filter((a) => a.symbol === "ETH"),
    [assetPricesUSD]
  );

  const selectedAsset = mainAssets.find((a) => a.symbol === assetSymbol);
  const expectedSUSD =
    selectedAsset && assetAmount
      ? Number(assetAmount) * (selectedAsset.priceUSD || 0)
      : 0;
  const expectedRedeemSUSD =
    selectedAsset && redeemEthAmount
      ? Number(redeemEthAmount) * (selectedAsset.priceUSD || 0)
      : 0;
  const expectedLoanSUSD =
    selectedAsset && loanAmount
      ? Number(loanAmount) * (selectedAsset.priceUSD || 0)
      : 0;
  const loanLimitETH =
    selectedAsset && selectedAsset.priceUSD > 0
      ? Number(loanLimit || "0") / selectedAsset.priceUSD
      : 0;

  type TxKind = "deposit" | "asset_deposit" | "transfer" | "loan" | "redeem";
  type TxStatus = "待审计" | "成功" | "失败";
  interface UserTx {
    id: string;
    kind: TxKind;
    timestamp: number;
    summary: string;
    status: TxStatus;
  }

  const [userTxs, setUserTxs] = useState<UserTx[]>([]);
  const [userView, setUserView] = useState<"overview" | "history">("overview");

  const fetchData = useCallback(async () => {
    if (!address || !contracts.bankVault || !contracts.riskEngine || !contracts.token) return;
    try {
      const [bal, tok, score, limit, bps, locked, stats] = await Promise.all([
        contracts.bankVault.balances(address),
        contracts.token.balanceOf(address),
        contracts.riskEngine.getRiskScore(address),
        contracts.riskEngine.getDailyLimit(address),
        contracts.riskEngine.getInterestRateBps(address),
        contracts.bankVault.lockedUntil(address),
        contracts.bankVault.dailyStats(address),
      ]);
      setVaultBalance(formatEther(bal));
      setTokenBalance(formatEther(tok));
      setRiskScore(Number(score));
      setDailyLimit(formatEther(limit));
      setLoanLimit(formatEther(limit));
      setInterestBps(Number(bps));
      setLockedUntil(locked);

      // 统计当日已用额度与剩余额度
      const spentWei: bigint =
        (stats as any).spent !== undefined ? (stats as any).spent : (stats as any)[1];
      setDailySpent(formatEther(spentWei));
      const remainWei = (limit as bigint) > spentWei ? (limit as bigint) - spentWei : 0n;
      setDailyRemaining(formatEther(remainWei));
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
        const approveTx = await contracts.token!.approve(await contracts.bankVault!.getAddress(), wei);
        await approveTx.wait();
        const depositTx = await contracts.bankVault!.deposit(wei);
        await depositTx.wait();
      },
      "Deposit"
    );
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
    const ethStr = loanAmount.trim();
    if (!ethStr || !contracts.bankVault || !selectedAsset) return;
    const ethNum = Number(ethStr);
    const price = selectedAsset.priceUSD || 0;
    if (!ethNum || ethNum <= 0 || !price) return;
    const susdNum = ethNum * price;
    const susdWei = parseEther(susdNum.toString());
    tx(async () => {
      const loanTx = await contracts.bankVault!.requestLoan(susdWei);
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

  const onAssetDeposit = () => {
    if (!contracts.bankVault || !address || !selectedAsset) return;
    const amtStr = assetAmount.trim();
    if (!amtStr) return;
    const assetNum = Number(amtStr);
    if (!assetNum || assetNum <= 0) return;
    // 用户输入的是 ETH 数量：用它作为 msg.value，同时按价格换算应记入的 sUSD 数量
    const ethWei = parseEther(amtStr);
    const susdNum = assetNum * (selectedAsset.priceUSD || 0);
    const susdWei = parseEther(susdNum.toString());
    tx(
      async () => {
        const txReq = await contracts.bankVault!.depositFromExternal(susdWei, { value: ethWei });
        await txReq.wait();
      },
      "MultiAssetDeposit"
    );
  };

  const onRedeem = () => {
    const ethStr = redeemEthAmount.trim();
    if (!ethStr || !contracts.bankVault || !selectedAsset) return;
    const ethNum = Number(ethStr);
    const price = selectedAsset.priceUSD || 0;
    if (!ethNum || ethNum <= 0 || !price) return;

    // 输入单位为 ETH，前端按实时价格换算对应的 sUSD 账本扣减额
    const susdNum = ethNum * price;
    const susdWei = parseEther(susdNum.toString());
    const ethWei = parseEther(ethStr);
    tx(
      async () => {
        const txReq = await contracts.bankVault!.redeemToAsset(redeemAssetSymbol, susdWei, ethWei);
        await txReq.wait();
      },
      "Redeem"
    );
  };

  const fetchUserTxs = useCallback(async () => {
    if (!address || !contracts.bankVault) return;
    const currentAddress = address.toLowerCase();
    try {
      const provider = contracts.bankVault.runner?.provider;
      if (!provider) return;
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = currentBlock > 5000 ? currentBlock - 5000 : 0;

      const vault = contracts.bankVault;

      const [
        depositEvents,
        transferEvents,
        escrowEvents,
        loanReqEvents,
        loanRepayEvents,
        redeemEvents,
      ] = await Promise.all([
        vault.queryFilter(vault.filters.Deposited(), fromBlock, "latest"),
        vault.queryFilter(vault.filters.ImmediateTransfer(), fromBlock, "latest"),
        vault.queryFilter(vault.filters.EscrowCreated(), fromBlock, "latest"),
        vault.queryFilter(vault.filters.LoanRequested(), fromBlock, "latest"),
        vault.queryFilter(vault.filters.LoanRepaid(), fromBlock, "latest"),
        vault.queryFilter(vault.filters.RedeemRequested(), fromBlock, "latest"),
      ]);

      const blockTimestamps = new Map<number, number>();
      const getTimestamp = async (blockNumber: number) => {
        const cached = blockTimestamps.get(blockNumber);
        if (cached) return cached;
        const block = await provider.getBlock(blockNumber);
        const ts = (block?.timestamp ?? 0) * 1000;
        blockTimestamps.set(blockNumber, ts);
        return ts;
      };

      const txs: UserTx[] = [];

      for (const ev of depositEvents as any[]) {
        const user = (ev.args?.[0] as string | undefined)?.toLowerCase();
        if (user !== currentAddress) continue;
        const ts = await getTimestamp(ev.blockNumber);
        const amount = ev.args?.[1];
        txs.push({
          id: ev.transactionHash + "_dep",
          kind: "deposit",
          timestamp: ts,
          summary: `存入 ${formatEther(amount)} sUSD`,
          status: "成功",
        });
      }

      for (const ev of transferEvents as any[]) {
        const from = (ev.args?.[0] as string | undefined) ?? "";
        const to = (ev.args?.[1] as string | undefined) ?? "";
        const amount = ev.args?.[2];
        if (from.toLowerCase() !== currentAddress && to.toLowerCase() !== currentAddress) continue;
        const ts = await getTimestamp(ev.blockNumber);
        const direction = from === address ? "转出" : "转入";
        txs.push({
          id: ev.transactionHash + "_tf",
          kind: "transfer",
          timestamp: ts,
          summary: `${direction} ${formatEther(amount)} sUSD ${direction === "转出" ? `→ ${to}` : `← ${from}`}`,
          status: "成功",
        });
      }

      for (const ev of escrowEvents as any[]) {
        const caseId = ev.args?.[0];
        const from = (ev.args?.[1] as string | undefined) ?? "";
        const to = (ev.args?.[2] as string | undefined) ?? "";
        const amount = ev.args?.[3];
        if (from.toLowerCase() !== currentAddress && to.toLowerCase() !== currentAddress) continue;
        const ts = await getTimestamp(ev.blockNumber);
        const escrow = await vault.getEscrow(caseId);
        const statusVal = Number(escrow[3]);
        let status: TxStatus = "待审计";
        if (statusVal === 1) status = "成功";
        if (statusVal === 2) status = "失败";
        const direction = from.toLowerCase() === currentAddress ? "转出" : "转入";
        txs.push({
          id: ev.transactionHash + "_esc",
          kind: "transfer",
          timestamp: ts,
          summary: `${direction} ${formatEther(amount)} sUSD（进入托管，案件 #${caseId.toString()}）`,
          status,
        });
      }

      for (const ev of loanReqEvents as any[]) {
        const loanId = ev.args?.[0];
        const borrower = (ev.args?.[1] as string | undefined)?.toLowerCase();
        if (borrower !== currentAddress) continue;
        const ts = await getTimestamp(ev.blockNumber);
        const principal = ev.args?.[2];
        const principalSUSD = Number(formatEther(principal));
        const ethPrice = selectedAsset?.priceUSD || 0;
        const approxEth = ethPrice > 0 ? principalSUSD / ethPrice : 0;
        const loanCase = await vault.getLoanCase(loanId);
        const statusVal = Number(loanCase.status_ ?? loanCase[3]);
        let status: TxStatus = "待审计";
        if (statusVal === 1) status = "成功";
        if (statusVal === 2) status = "失败";
        txs.push({
          id: ev.transactionHash + "_loan_req",
          kind: "loan",
          timestamp: ts,
          summary: `申请借贷 ${approxEth > 0 ? approxEth.toFixed(6) : "—"} ETH（Loan #${loanId.toString()}）`,
          status,
        });
      }

      for (const ev of loanRepayEvents as any[]) {
        const user = (ev.args?.[0] as string | undefined)?.toLowerCase();
        if (user !== currentAddress) continue;
        const ts = await getTimestamp(ev.blockNumber);
        const amount = ev.args?.[1];
        txs.push({
          id: ev.transactionHash + "_loan_rep",
          kind: "loan",
          timestamp: ts,
          summary: `偿还借贷 ${formatEther(amount)} sUSD`,
          status: "成功",
        });
      }

      for (const ev of redeemEvents as any[]) {
        const redeemId = ev.args?.[0];
        const user = (ev.args?.[1] as string | undefined)?.toLowerCase();
        if (user !== currentAddress) continue;
        const ts = await getTimestamp(ev.blockNumber);
        const assetSym = ev.args?.[2] as string;
        const susdAmt = ev.args?.[3];
        const redeemCase = await vault.getRedeemCase(redeemId);
        const statusVal = Number(redeemCase.status_ ?? redeemCase[4]);
        let status: TxStatus = "待审计";
        if (statusVal === 1) status = "成功";
        if (statusVal === 2) status = "失败";
        txs.push({
          id: ev.transactionHash + "_redeem",
          kind: "redeem",
          timestamp: ts,
          summary: `申请赎回 ${formatEther(susdAmt)} sUSD 为 ${assetSym}（Redeem #${redeemId.toString()}）`,
          status,
        });
      }
      txs.sort((a, b) => b.timestamp - a.timestamp);
      setUserTxs(txs);
    } catch (e) {
      // 静默失败，不阻塞主数据
    }
  }, [address, contracts.bankVault, selectedAsset]);

  useEffect(() => {
    fetchUserTxs();
    const t = setInterval(fetchUserTxs, 12000);
    return () => clearInterval(t);
  }, [fetchUserTxs]);

  return (
    <div className="panel">
      <h2>用户控制台</h2>
      {error && <p className="error-msg">{error}</p>}
      {loading && <p className="loading-msg">交易处理中…</p>}

      <section className="panel-section">
        <div className="subtabs">
          <button
            type="button"
            className={userView === "overview" ? "subtab active" : "subtab"}
            onClick={() => setUserView("overview")}
          >
            概览
          </button>
          <button
            type="button"
            className={userView === "history" ? "subtab active" : "subtab"}
            onClick={() => setUserView("history")}
          >
            我的交易
          </button>
        </div>
      </section>

      {userView === "overview" && (
        <>
          <section className="panel-section">
            <h3>资产与安全</h3>
            <p>银行账户余额（仅银行台账，不能直接提取 BTC/ETH）: <strong>{vaultBalance}</strong> sUSD</p>
            <p>钱包 sUSD: <strong>{tokenBalance}</strong></p>
            <p>账户状态: {isLocked ? "已锁定（频率或风控）" : "正常"}</p>
          </section>

          <section className="panel-section">
            <h3>风险与额度</h3>
            <p>风险评分: <strong>{riskScore}</strong> / 100</p>
            <p>日转出限额: <strong>{dailyLimit}</strong> sUSD</p>
            <p>今日已用额度: <strong>{dailySpent}</strong> sUSD</p>
            <p>今日剩余额度: <strong>{dailyRemaining}</strong> sUSD</p>
            <p>借贷额度上限: <strong>{loanLimitETH.toLocaleString(undefined, { maximumFractionDigits: 6 })}</strong> ETH</p>
            <p>当前借贷年化 (bps): <strong>{interestBps}</strong> → 约 {(interestBps / 100).toFixed(2)}%</p>
          </section>

          <section className="panel-section">
            <h3>操作</h3>
            <div className="form-row">
              <label>存入（已有 sUSD）</label>
              <input
                type="text"
                placeholder="数量"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
              <button onClick={onDeposit} disabled={loading}>存入银行账户</button>
            </div>
            <div className="form-row">
              <label>外币存入（仅支持 ETH → 银行 sUSD）</label>
              <input
                type="text"
                readOnly
                className="input-inline"
                value="ETH"
              />
              <input
                type="text"
                placeholder="ETH 数量"
                value={assetAmount}
                onChange={(e) => setAssetAmount(e.target.value)}
              />
              <button onClick={onAssetDeposit} disabled={loading || !selectedAsset}>
                存入并记入银行 sUSD
              </button>
            </div>
            {selectedAsset && !!expectedSUSD && (
              <p className="hint">
                约可记入 <strong>{expectedSUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong> sUSD
                （按当前 {selectedAsset.symbol}≈{selectedAsset.priceUSD.toLocaleString()} USD）
              </p>
            )}
            <div className="form-row">
              <label>赎回（银行 sUSD → ETH）</label>
              <input
                type="text"
                readOnly
                className="input-inline"
                value="ETH"
              />
              <input
                type="text"
                placeholder="ETH 数量"
                value={redeemEthAmount}
                onChange={(e) => setRedeemEthAmount(e.target.value)}
              />
              <button onClick={onRedeem} disabled={loading}>申请赎回</button>
            </div>
            {selectedAsset && !!expectedRedeemSUSD && (
              <p className="hint">
                本次赎回将扣减约 <strong>{expectedRedeemSUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong> sUSD
              </p>
            )}
            <div className="form-row">
              <label>转账（平台内）</label>
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
              <label>申请借贷（ETH）</label>
              <input
                type="text"
                placeholder="借贷 ETH 数量"
                value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
              />
              <button onClick={onRequestLoan} disabled={loading}>申请借贷</button>
            </div>
            {selectedAsset && !!expectedLoanSUSD && (
              <p className="hint">
                本次借贷约折合 <strong>{expectedLoanSUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong> sUSD（用于额度校验）
              </p>
            )}
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
            <p className="hint">所有转账与赎回均需通过平台入口；大额或超日限转账将进入托管，需两名审计员批准后到账。</p>
          </section>
        </>
      )}

      {userView === "history" && (
        <section className="panel-section">
          <h3>我的交易</h3>
          <p className="hint">下方展示的是通过合约事件扫描得到的、与当前地址相关的主要交易记录。</p>
          {userTxs.length === 0 ? (
            <p>暂无交易记录。</p>
          ) : (
            <table className="rates-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>类型</th>
                  <th>摘要</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {userTxs.map((txItem) => (
                  <tr key={txItem.id}>
                    <td>{new Date(txItem.timestamp).toLocaleString()}</td>
                    <td>{txItem.kind}</td>
                    <td>{txItem.summary}</td>
                    <td>{txItem.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
};
