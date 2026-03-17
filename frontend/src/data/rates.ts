/** 牌价数据类型与格式化；实时数据由 useLiveRates 拉取 */

export interface SUsdVsFiat {
  currency: string;
  name: string;
  per1sUSD: string;
  per1sUSDNum: number;
}

export interface AssetPriceUSD {
  symbol: string;
  name: string;
  priceUSD: number;
  change24h?: number;
}

/** 币种元数据（名称等） */
export const CURRENCY_META: Record<string, string> = {
  USD: "美元",
  EUR: "欧元",
  GBP: "英镑",
  JPY: "日元",
  CNY: "人民币",
  HKD: "港币",
  BTC: "比特币",
  ETH: "以太坊",
  USDT: "泰达币",
  sUSD: "SafeHarbor USD",
  BNB: "币安币",
  SOL: "Solana",
  XRP: "瑞波币",
  ADA: "Cardano",
  DOGE: "狗狗币",
  LTC: "莱特币",
};

export function formatPriceUSD(value: number): string {
  if (value >= 1000) return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (value >= 1) return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

/** 默认/降级数据（API 失败时使用） */
export const FALLBACK_SUSD_VS_FIAT: SUsdVsFiat[] = [
  { currency: "USD", name: "美元", per1sUSD: "1.0000", per1sUSDNum: 1 },
  { currency: "EUR", name: "欧元", per1sUSD: "0.9180", per1sUSDNum: 0.918 },
  { currency: "GBP", name: "英镑", per1sUSD: "0.7870", per1sUSDNum: 0.787 },
  { currency: "JPY", name: "日元", per1sUSD: "149.25", per1sUSDNum: 149.25 },
  { currency: "CNY", name: "人民币", per1sUSD: "7.2420", per1sUSDNum: 7.242 },
  { currency: "HKD", name: "港币", per1sUSD: "7.8080", per1sUSDNum: 7.808 },
];

export const FALLBACK_ASSET_PRICES: AssetPriceUSD[] = [
  { symbol: "BTC", name: "比特币", priceUSD: 97000, change24h: 0 },
  { symbol: "ETH", name: "以太坊", priceUSD: 3500, change24h: 0 },
  { symbol: "USDT", name: "泰达币", priceUSD: 1, change24h: 0 },
  { symbol: "sUSD", name: "SafeHarbor USD", priceUSD: 1, change24h: 0 },
  { symbol: "EUR", name: "欧元", priceUSD: 1.09, change24h: 0 },
  { symbol: "GBP", name: "英镑", priceUSD: 1.27, change24h: 0 },
  { symbol: "JPY", name: "日元", priceUSD: 0.0067, change24h: 0 },
  { symbol: "CNY", name: "人民币", priceUSD: 0.138, change24h: 0 },
  { symbol: "HKD", name: "港币", priceUSD: 0.128, change24h: 0 },
];
