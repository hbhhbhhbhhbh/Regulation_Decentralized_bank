import { useCallback, useEffect, useState } from "react";
import type { AssetPriceUSD, SUsdVsFiat } from "../data/rates";
import {
  CURRENCY_META,
  FALLBACK_ASSET_PRICES,
  FALLBACK_SUSD_VS_FIAT,
} from "../data/rates";

// 主流币价格：BTC、ETH、USDT + 一批常见主流币
// CoinGecko id 与 symbol 映射
const COIN_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  LTC: "litecoin",
};

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=" +
  Object.values(COIN_IDS).join(",") +
  "&vs_currencies=usd&include_24hr_change=true";
const EXCHANGERATE_URL = "https://api.exchangerate-api.com/v4/latest/USD";

const FIAT_CODES = ["EUR", "GBP", "JPY", "CNY", "HKD"] as const;

export interface LiveRatesState {
  sUSDvsFiat: SUsdVsFiat[];
  assetPricesUSD: AssetPriceUSD[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

function formatRate(value: number, decimals: number): string {
  if (value >= 100) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(4);
}

export function useLiveRates(pollIntervalMs = 60_000): LiveRatesState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sUSDvsFiat, setSUSDvsFiat] = useState<SUsdVsFiat[]>(FALLBACK_SUSD_VS_FIAT);
  const [assetPricesUSD, setAssetPricesUSD] = useState<AssetPriceUSD[]>(FALLBACK_ASSET_PRICES);

  const fetchRates = useCallback(async () => {
    try {
      setError(null);
      const [cryptoRes, fiatRes] = await Promise.all([
        fetch(COINGECKO_URL),
        fetch(EXCHANGERATE_URL),
      ]);

      if (!cryptoRes.ok) throw new Error("加密货币价格获取失败");
      if (!fiatRes.ok) throw new Error("外汇汇率获取失败");

      const crypto = (await cryptoRes.json()) as Record<
        string,
        { usd?: number; usd_24h_change?: number }
      >;
      const fiat = (await fiatRes.json()) as { base: string; rates: Record<string, number> };

      const usdtPrice = crypto[COIN_IDS.USDT]?.usd ?? 1;
      const sUSDPrice = usdtPrice;

      const sUSDvsFiatList: SUsdVsFiat[] = [
        { currency: "USD", name: CURRENCY_META.USD ?? "美元", per1sUSD: "1.0000", per1sUSDNum: 1 },
      ];
      for (const code of FIAT_CODES) {
        const rate = fiat.rates?.[code];
        if (rate != null) {
          const per1 = rate;
          sUSDvsFiatList.push({
            currency: code,
            name: CURRENCY_META[code] ?? code,
            per1sUSD: formatRate(per1, 4),
            per1sUSDNum: per1,
          });
        }
      }
      setSUSDvsFiat(sUSDvsFiatList);

      const assets: AssetPriceUSD[] = [];

      // 主流加密资产
      for (const [symbol, id] of Object.entries(COIN_IDS)) {
        const row = crypto[id];
        const priceUSD = row?.usd ?? 0;
        const change = row?.usd_24h_change;
        if (!priceUSD) continue;
        assets.push({
          symbol,
          name: CURRENCY_META[symbol] ?? symbol,
          priceUSD,
          change24h: change,
        });
      }

      // 银行币 sUSD：与 USDT 同价
      assets.push({
        symbol: "sUSD",
        name: CURRENCY_META.sUSD ?? "SafeHarbor USD",
        priceUSD: sUSDPrice,
        change24h: crypto[COIN_IDS.USDT]?.usd_24h_change,
      });
      for (const code of FIAT_CODES) {
        const rate = fiat.rates?.[code];
        if (rate != null && rate > 0) {
          const priceUSD = 1 / rate;
          assets.push({
            symbol: code,
            name: CURRENCY_META[code] ?? code,
            priceUSD,
            change24h: undefined,
          });
        }
      }
      setAssetPricesUSD(assets);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取价格失败");
      setSUSDvsFiat(FALLBACK_SUSD_VS_FIAT);
      setAssetPricesUSD(FALLBACK_ASSET_PRICES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRates();
    const t = setInterval(fetchRates, pollIntervalMs);
    return () => clearInterval(t);
  }, [fetchRates, pollIntervalMs]);

  return { sUSDvsFiat, assetPricesUSD, loading, error, lastUpdated };
}
