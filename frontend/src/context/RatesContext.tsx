import React, { createContext, useContext } from "react";
import { useLiveRates } from "../hooks/useLiveRates";

const RatesContext = createContext<ReturnType<typeof useLiveRates> | null>(null);

export function RatesProvider({ children }: { children: React.ReactNode }) {
  const value = useLiveRates(60_000);
  return <RatesContext.Provider value={value}>{children}</RatesContext.Provider>;
}

export function useRates() {
  const ctx = useContext(RatesContext);
  if (!ctx) throw new Error("useRates must be used within RatesProvider");
  return ctx;
}
