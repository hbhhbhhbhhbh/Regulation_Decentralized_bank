import React, { useState, useMemo } from "react";

export const InterestSimulator: React.FC = () => {
  // 核心输入参数
  const [depositEth, setDepositEth] = useState<number>(100);
  const [borrowEth, setBorrowEth] = useState<number>(40);
  const [daysPassed, setDaysPassed] = useState<number>(0);

  // 模拟器的底层模型参数（与刚才 RiskEngine.sol 中的参数对齐）
  const baseRate = 0.03;      // 基础利率 3% (300 bps)
  const optimalU = 0.8;       // 最佳利用率 80%
  const slope1 = 0.04;        // 第一段斜率附加最高 4% (400 bps)
  const slope2 = 0.30;        // 惩罚段斜率附加最高 30% (3000 bps)
  const reserveFactor = 0.20; // 银行准备金率 20% (用于计算存款 APY)

  // 核心数学模型计算 (利用 React 的 useMemo 自动响应输入变化)
  const stats = useMemo(() => {
    // 1. 计算资金利用率 U
    const U = depositEth > 0 ? borrowEth / depositEth : 0;
    const safeU = Math.min(U, 1); // 模拟器中防止超出 100% 导致逻辑崩溃

    // 2. 计算借款利率 Borrow APR (Jump Rate Kink Model)
    let borrowAPR = baseRate;
    if (safeU <= optimalU) {
      borrowAPR += slope1 * (safeU / optimalU);
    } else {
      borrowAPR += slope1 + slope2 * ((safeU - optimalU) / (1 - optimalU));
    }

    // 3. 计算存款利率 Deposit APY
    // 银行收取的利息中，扣除准备金后，按利用率分发给存款人
    const depositAPY = borrowAPR * safeU * (1 - reserveFactor);

    // 4. 计算随着时间 (天数) 推移产生的累积利息 (使用单利简化展示)
    const timeRatio = daysPassed / 365;
    const accumulatedDepositInterest = depositEth * depositAPY * timeRatio;
    const accumulatedBorrowInterest = borrowEth * borrowAPR * timeRatio;
    const netProfit = accumulatedDepositInterest - accumulatedBorrowInterest;

    return {
      U: safeU,
      borrowAPR,
      depositAPY,
      accumulatedDepositInterest,
      accumulatedBorrowInterest,
      netProfit,
    };
  }, [depositEth, borrowEth, daysPassed]);

  // 场景预设快捷键
  const applyScenario = (type: "normal" | "tight" | "extreme") => {
    setDaysPassed(0); // 切换场景时重置时间
    if (type === "normal") {
      setDepositEth(100);
      setBorrowEth(40); // U = 40% (健康)
    } else if (type === "tight") {
      setDepositEth(100);
      setBorrowEth(80); // U = 80% (临界拐点)
    } else if (type === "extreme") {
      setDepositEth(100);
      setBorrowEth(95); // U = 95% (极端短缺，触发高额惩罚)
    }
  };

  return (
    <div className="panel">
      <h2>⏳ 动态利率时间模拟器 (Interest Simulator)</h2>
      <p className="hint">本页面用于直观演示时间推移下，资金池利用率如何影响存款收益与借款成本。</p>

      {/* 第一部分：场景预设 */}
      <section className="panel-section">
        <h3>1. 选择模拟场景 (预设输入)</h3>
        <div className="subtabs">
          <button type="button" className="subtab" onClick={() => applyScenario("normal")}>
            🌱 正常健康 (利用率 40%)
          </button>
          <button type="button" className="subtab" onClick={() => applyScenario("tight")}>
            ⚠️ 资金紧张 (利用率 80%)
          </button>
          <button type="button" className="subtab" onClick={() => applyScenario("extreme")}>
            🔥 极端短缺 (利用率 95%)
          </button>
        </div>
        <div className="form-row" style={{ marginTop: "15px" }}>
          <label>初始存款 (ETH)</label>
          <input type="number" value={depositEth} onChange={(e) => setDepositEth(Number(e.target.value))} />
          <label>初始借贷 (ETH)</label>
          <input type="number" value={borrowEth} onChange={(e) => setBorrowEth(Number(e.target.value))} />
        </div>
      </section>

      {/* 第二部分：当前宏观利率计算结果 */}
      <section className="panel-section">
        <h3>2. 宏观利率反馈 (Jump Rate Model)</h3>
        <p>当前资金池利用率 (U): <strong style={{ color: stats.U > 0.8 ? "red" : "green" }}>{(stats.U * 100).toFixed(2)}%</strong></p>
        <p>借贷成本年化 (Borrow APR): <strong>{(stats.borrowAPR * 100).toFixed(2)}%</strong></p>
        <p>存款收益年化 (Deposit APY): <strong>{(stats.depositAPY * 100).toFixed(2)}%</strong></p>
        <p className="hint">公式: APY = APR × U × (1 - 准备金率 20%)</p>
      </section>

      {/* 第三部分：时间推移控制 */}
      <section className="panel-section">
        <h3>3. 时间机器 (Time Travel)</h3>
        <p>已推移时间: <strong>{daysPassed} 天</strong></p>
        <div className="subtabs">
          <button type="button" className="subtab" onClick={() => setDaysPassed(daysPassed + 1)}>+ 1 天</button>
          <button type="button" className="subtab" onClick={() => setDaysPassed(daysPassed + 7)}>+ 7 天</button>
          <button type="button" className="subtab" onClick={() => setDaysPassed(daysPassed + 30)}>+ 30 天</button>
          <button type="button" className="subtab" onClick={() => setDaysPassed(0)}>🔄 重置到 T0</button>
        </div>
      </section>

      {/* 第四部分：账户余额与利息输出 */}
      <section className="panel-section" style={{ backgroundColor: "#f9f9f9", padding: "15px", borderRadius: "8px" }}>
        <h3>4. 利息结算面板</h3>
        <p>📈 累计存款利息收益: <strong style={{ color: "green" }}>+{stats.accumulatedDepositInterest.toFixed(4)} ETH</strong></p>
        <p>📉 累计借款利息成本: <strong style={{ color: "red" }}>-{stats.accumulatedBorrowInterest.toFixed(4)} ETH</strong></p>
        <hr style={{ margin: "10px 0" }} />
        <h4>
          整体净收益/净成本: 
          <span style={{ color: stats.netProfit >= 0 ? "green" : "red", marginLeft: "10px" }}>
            {stats.netProfit >= 0 ? "+" : ""}{stats.netProfit.toFixed(4)} ETH
          </span>
        </h4>
      </section>
    </div>
  );
};