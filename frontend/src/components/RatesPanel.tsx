import React, { useState } from "react";
import { useRates } from "../context/RatesContext";
import { formatPriceUSD } from "../data/rates";

export const RatesPanel: React.FC = () => {
  const { sUSDvsFiat, assetPricesUSD, loading, error, lastUpdated } = useRates();
  const [assetView, setAssetView] = useState<"asset_to_susd" | "susd_to_asset">("asset_to_susd");

  const assetRows = assetPricesUSD.filter((a) =>
    ["BTC", "ETH", "USDT", "BNB", "SOL", "XRP", "ADA", "DOGE", "LTC"].includes(a.symbol)
  );

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
          <div className="rate-card-header-row">
            <div>
              <h3>加密资产价格视角切换</h3>
              <p className="rate-card-desc">
                以实时 USDT 价格为基准，sUSD 与 USDT 同价。
              </p>
            </div>
            <div className="view-toggle">
              <button
                type="button"
                className={assetView === "asset_to_susd" ? "toggle-btn active" : "toggle-btn"}
                onClick={() => setAssetView("asset_to_susd")}
              >
                1 资产 = ? sUSD
              </button>
              <button
                type="button"
                className={assetView === "susd_to_asset" ? "toggle-btn active" : "toggle-btn"}
                onClick={() => setAssetView("susd_to_asset")}
              >
                1 sUSD = ? 资产
              </button>
            </div>
          </div>
          <table className="rates-table">
            <thead>
              <tr>
                <th>符号</th>
                <th>名称</th>
                {assetView === "asset_to_susd" ? (
                  <th className="num">1 资产 ≈ ? sUSD</th>
                ) : (
                  <th className="num">1 sUSD ≈ ? 资产</th>
                )}
                <th className="num">价格 (USD)</th>
                <th className="num">24h</th>
              </tr>
            </thead>
            <tbody>
              {assetRows.map((row) => {
                const price = row.priceUSD || 0;
                let ratioDisplay = "—";
                if (price > 0) {
                  if (assetView === "asset_to_susd") {
                    ratioDisplay = `${price.toLocaleString("en-US", {
                      maximumFractionDigits: 4,
                    })} sUSD`;
                  } else {
                    const value = 1 / price;
                    const digits =
                      row.symbol === "BTC" || row.symbol === "ETH" ? 8 : 6;
                    ratioDisplay = `${value.toFixed(digits)} ${row.symbol}`;
                  }
                }
                return (
                  <tr key={row.symbol}>
                    <td><strong>{row.symbol}</strong></td>
                    <td>{row.name}</td>
                    <td className="num">{ratioDisplay}</td>
                    <td className="num">{formatPriceUSD(price)}</td>
                    <td className="num">
                      {row.change24h != null ? (
                        <span className={row.change24h >= 0 ? "chg-up" : "chg-down"}>
                          {row.change24h >= 0 ? "+" : ""}
                          {row.change24h.toFixed(2)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
};
