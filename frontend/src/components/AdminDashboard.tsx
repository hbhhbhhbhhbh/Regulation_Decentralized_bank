import React, { useCallback, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { parseEther } from "ethers";

export const AdminDashboard: React.FC = () => {
  const { contracts, refreshRole } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [auditorAddress, setAuditorAddress] = useState("");
  const [blacklistAddress, setBlacklistAddress] = useState("");
  const [blacklistValue, setBlacklistValue] = useState(true);
  const [freqWindow, setFreqWindow] = useState("60");
  const [freqMax, setFreqMax] = useState("3");
  const [freqLockSec, setFreqLockSec] = useState("3600");

  const [kycUser, setKycUser] = useState("");
  const [kycRiskProfile, setKycRiskProfile] = useState("40");
  const [kycCountry, setKycCountry] = useState("HK");
  const [riskUser, setRiskUser] = useState("");
  const [riskScore, setRiskScore] = useState("40");
  const [riskDailyLimit, setRiskDailyLimit] = useState("50000");
  const [depositApyBps, setDepositApyBps] = useState("200");

  const tx = useCallback(
    async (fn: () => Promise<unknown>) => {
      setError(null);
      setLoading(true);
      try {
        await fn();
        await refreshRole();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [refreshRole]
  );

  const onAddAuditor = () => {
    const addr = auditorAddress.trim();
    if (!addr || !contracts.bankVault) return;
    tx(async () => {
      const addTx = await contracts.bankVault!.addAuditor(addr);
      await addTx.wait();
    });
  };

  const onRemoveAuditor = () => {
    const addr = auditorAddress.trim();
    if (!addr || !contracts.bankVault) return;
    tx(async () => {
      const removeTx = await contracts.bankVault!.removeAuditor(addr);
      await removeTx.wait();
    });
  };

  const onSetBlacklist = () => {
    const addr = blacklistAddress.trim();
    if (!addr || !contracts.bankVault) return;
    tx(async () => {
      const txReq = await contracts.bankVault!.setBlacklist(addr, blacklistValue);
      await txReq.wait();
    });
  };

  const onSetFrequency = () => {
    if (!contracts.bankVault) return;
    const w = parseInt(freqWindow, 10);
    const m = parseInt(freqMax, 10);
    const l = parseInt(freqLockSec, 10);
    if (isNaN(w) || isNaN(m) || isNaN(l)) return;
    tx(async () => {
      const txReq = await contracts.bankVault!.setFrequencyParams(w, m, l);
      await txReq.wait();
    });
  };

  const onPause = () => {
    if (!contracts.bankVault) return;
    tx(async () => {
      const txReq = await contracts.bankVault!.pause();
      await txReq.wait();
    });
  };

  const onUnpause = () => {
    if (!contracts.bankVault) return;
    tx(async () => {
      const txReq = await contracts.bankVault!.unpause();
      await txReq.wait();
    });
  };

  const onRegisterKYC = () => {
    const addr = kycUser.trim();
    if (!addr || !contracts.identity) return;
    const profile = parseInt(kycRiskProfile, 10);
    if (isNaN(profile) || profile < 0 || profile > 255) return;
    tx(async () => {
      const txReq = await contracts.identity!.registerKYC(addr, profile, kycCountry);
      await txReq.wait();
    });
  };

  const onInitRisk = () => {
    const addr = riskUser.trim();
    if (!addr || !contracts.riskEngine) return;
    const score = parseInt(riskScore, 10);
    const limit = parseEther(riskDailyLimit);
    if (isNaN(score) || score < 1 || score > 100) return;
    tx(async () => {
      const txReq = await contracts.riskEngine!.initRisk(addr, score, limit);
      await txReq.wait();
    });
  };

  return (
    <div className="panel">
      <h2>管理员控制台</h2>
      {error && <p className="error-msg">{error}</p>}
      {loading && <p className="loading-msg">交易处理中…</p>}

      <section className="panel-section">
        <h3>审计员管理</h3>
        <div className="form-row">
          <input
            type="text"
            placeholder="审计员地址"
            value={auditorAddress}
            onChange={(e) => setAuditorAddress(e.target.value)}
          />
          <button onClick={onAddAuditor} disabled={loading}>添加审计员</button>
          <button onClick={onRemoveAuditor} disabled={loading}>移除审计员</button>
        </div>
      </section>

      <section className="panel-section">
        <h3>黑名单</h3>
        <div className="form-row">
          <input
            type="text"
            placeholder="地址"
            value={blacklistAddress}
            onChange={(e) => setBlacklistAddress(e.target.value)}
          />
          <label>
            <input
              type="checkbox"
              checked={blacklistValue}
              onChange={(e) => setBlacklistValue(e.target.checked)}
            />
            加入黑名单
          </label>
          <button onClick={onSetBlacklist} disabled={loading}>设置</button>
        </div>
      </section>

      <section className="panel-section">
        <h3>频率与锁定参数</h3>
        <div className="form-row">
          <input
            type="text"
            placeholder="窗口秒"
            value={freqWindow}
            onChange={(e) => setFreqWindow(e.target.value)}
          />
          <input
            type="text"
            placeholder="窗口内最大笔数"
            value={freqMax}
            onChange={(e) => setFreqMax(e.target.value)}
          />
          <input
            type="text"
            placeholder="锁定时长(秒)"
            value={freqLockSec}
            onChange={(e) => setFreqLockSec(e.target.value)}
          />
          <button onClick={onSetFrequency} disabled={loading}>更新</button>
        </div>
      </section>

      <section className="panel-section">
        <h3>存款利率（对外展示 APY）</h3>
        <div className="form-row">
          <input
            type="text"
            placeholder="存款 APY (bps，如 200=2%)"
            value={depositApyBps}
            onChange={(e) => setDepositApyBps(e.target.value)}
          />
          <button
            onClick={() => {
              const bps = parseInt(depositApyBps, 10);
              if (isNaN(bps) || !contracts.bankVault) return;
              tx(async () => {
                const txReq = await contracts.bankVault!.setDepositApyBps(bps);
                await txReq.wait();
              });
            }}
            disabled={loading}
          >
            设置存款 APY
          </button>
        </div>
      </section>

      <section className="panel-section">
        <h3>系统开关</h3>
        <div className="actions-row">
          <button onClick={onPause} disabled={loading}>暂停</button>
          <button onClick={onUnpause} disabled={loading}>恢复</button>
        </div>
      </section>

      <section className="panel-section">
        <h3>KYC 注册（创建用户）</h3>
        <div className="form-row">
          <input
            type="text"
            placeholder="用户地址"
            value={kycUser}
            onChange={(e) => setKycUser(e.target.value)}
          />
          <input
            type="text"
            placeholder="风险标签 0-255"
            value={kycRiskProfile}
            onChange={(e) => setKycRiskProfile(e.target.value)}
          />
          <input
            type="text"
            placeholder="国家码"
            value={kycCountry}
            onChange={(e) => setKycCountry(e.target.value)}
          />
          <button onClick={onRegisterKYC} disabled={loading}>注册 KYC</button>
        </div>
      </section>

      <section className="panel-section">
        <h3>风险初始化（用户日限额与利率）</h3>
        <div className="form-row">
          <input
            type="text"
            placeholder="用户地址"
            value={riskUser}
            onChange={(e) => setRiskUser(e.target.value)}
          />
          <input
            type="text"
            placeholder="风险分 1-100"
            value={riskScore}
            onChange={(e) => setRiskScore(e.target.value)}
          />
          <input
            type="text"
            placeholder="日限额 sUSD"
            value={riskDailyLimit}
            onChange={(e) => setRiskDailyLimit(e.target.value)}
          />
          <button onClick={onInitRisk} disabled={loading}>初始化风险</button>
        </div>
        <p className="hint">先为该地址注册 KYC，再在此填写同一地址并初始化风险与日限额。</p>
      </section>
    </div>
  );
};
