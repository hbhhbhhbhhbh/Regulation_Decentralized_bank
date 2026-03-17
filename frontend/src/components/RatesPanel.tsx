import React from "react";
import { useRates } from "../context/RatesContext";
import { formatPriceUSD } from "../data/rates";

export const RatesPanel: React.FC = () => {
  const { sUSDvsFiat, assetPricesUSD, loading, error, lastUpdated } = useRates();

  return (
    <div className="rates-panel">
      <div className="rates-panel-header">
        <h2>实时牌价</h2>
        <span className="rates-meta">
          {loading && "更新中…"}
          {error && <span className="rates-error">{error}</span>}
          {lastUpdated && !loading && (
            <span className="rates-date">
              更新：{lastUpdated.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </span>
      </div>

      {loading && !lastUpdated && (
        <div className="rates-loading">正在拉取实时价格…</div>
      )}

      <div className="rates-grid">
        <section className="rate-card">
          <h3>银行币 sUSD 兑外币</h3>
          <p className="rate-card-desc">1 sUSD = 1 USDT（与 USDT 同价），可兑换</p>
          <table className="rates-table">
            <thead>
              <tr>
                <th>币种</th>
                <th>名称</th>
                <th className="num">1 sUSD =</th>
              </tr>
            </thead>
            <tbody>
              {sUSDvsFiat.map((row) => (
                <tr key={row.currency}>
                  <td><strong>{row.currency}</strong></td>
                  <td>{row.name}</td>
                  <td className="num">{row.per1sUSD}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rate-card">
          <h3>外币 / 资产 美元价格 (USD)</h3>
          <p className="rate-card-desc">每单位计价 · 数据来源 CoinGecko / 汇率 API</p>
          <table className="rates-table">
            <thead>
              <tr>
                <th>符号</th>
                <th>名称</th>
                <th className="num">价格 (USD)</th>
                <th className="num">24h</th>
              </tr>
            </thead>
            <tbody>
              {assetPricesUSD.map((row) => (
                <tr key={row.symbol}>
                  <td><strong>{row.symbol}</strong></td>
                  <td>{row.name}</td>
                  <td className="num">{formatPriceUSD(row.priceUSD)}</td>
                  <td className="num">
                    {row.change24h != null ? (
                      <span className={row.change24h >= 0 ? "chg-up" : "chg-down"}>
                        {row.change24h >= 0 ? "+" : ""}{row.change24h.toFixed(2)}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
};
