import { useCallback, useEffect, useState } from "react";
import type { AssetPriceUSD, SUsdVsFiat } from "../data/rates";
import {
  CURRENCY_META,
  FALLBACK_ASSET_PRICES,
  FALLBACK_SUSD_VS_FIAT,
} from "../data/rates";

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd&include_24hr_change=true";
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

      const crypto = (await cryptoRes.json()) as {
        bitcoin?: { usd?: number; usd_24h_change?: number };
        ethereum?: { usd?: number; usd_24h_change?: number };
        tether?: { usd?: number; usd_24h_change?: number };
      };
      const fiat = (await fiatRes.json()) as { base: string; rates: Record<string, number> };

      const usdtPrice = crypto.tether?.usd ?? 1;
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

      const assets: AssetPriceUSD[] = [
        {
          symbol: "BTC",
          name: CURRENCY_META.BTC ?? "比特币",
          priceUSD: crypto.bitcoin?.usd ?? 0,
          change24h: crypto.bitcoin?.usd_24h_change,
        },
        {
          symbol: "ETH",
          name: CURRENCY_META.ETH ?? "以太坊",
          priceUSD: crypto.ethereum?.usd ?? 0,
          change24h: crypto.ethereum?.usd_24h_change,
        },
        {
          symbol: "USDT",
          name: CURRENCY_META.USDT ?? "泰达币",
          priceUSD: usdtPrice,
          change24h: crypto.tether?.usd_24h_change,
        },
        {
          symbol: "sUSD",
          name: CURRENCY_META.sUSD ?? "SafeHarbor USD",
          priceUSD: sUSDPrice,
          change24h: crypto.tether?.usd_24h_change,
        },
      ];
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
