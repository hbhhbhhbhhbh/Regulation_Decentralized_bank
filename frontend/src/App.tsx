import React from "react";
import { WalletProvider, useWallet } from "./context/WalletContext";
import { RatesProvider } from "./context/RatesContext";
import { RatesPanel } from "./components/RatesPanel";
import { PublicBankView } from "./components/PublicBankView";
import { UserDashboard } from "./components/UserDashboard";
import { AuditorDashboard } from "./components/AuditorDashboard";
import { AdminDashboard } from "./components/AdminDashboard";

function AppContent() {
  const { address, role, connect, disconnect } = useWallet();

  const isGuestOrNone = !address || role === "none";

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>SafeHarbor Bank</h1>
          <p className="tagline">Regulation-as-Code · 访客可查牌价与 KYC 流程；用户操作需登录</p>
        </div>
        <div className="header-wallet">
          {!address ? (
            <button type="button" className="btn-connect" onClick={connect}>
              连接钱包
            </button>
          ) : (
            <>
              <span className="wallet-addr" title={address}>
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
              <span className={`role-badge role-${role}`}>
                {role === "admin" && "管理员"}
                {role === "auditor" && "审计员"}
                {role === "user" && "用户"}
                {role === "none" && "未注册"}
              </span>
              <button type="button" className="btn-disconnect" onClick={disconnect}>
                断开
              </button>
            </>
          )}
        </div>
      </header>
      <main className="app-main">
        <RatesPanel />
        {isGuestOrNone && <PublicBankView />}
        {address && role === "user" && <UserDashboard />}
        {address && role === "auditor" && <AuditorDashboard />}
        {address && role === "admin" && <AdminDashboard />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <RatesProvider>
        <AppContent />
      </RatesProvider>
    </WalletProvider>
  );
}
