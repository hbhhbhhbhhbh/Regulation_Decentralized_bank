import React, { useState } from "react";
import { WalletProvider, useWallet } from "./context/WalletContext";
import { RatesProvider } from "./context/RatesContext";
import { RatesPanel } from "./components/RatesPanel";
import { PublicBankView } from "./components/PublicBankView";
import { UserDashboard } from "./components/UserDashboard";
import { AuditorDashboard } from "./components/AuditorDashboard";
import { AdminDashboard } from "./components/AdminDashboard";

function AppContent() {
  const { address, role, connect, disconnect } = useWallet();
  const [activeTab, setActiveTab] = useState<"bank" | "user" | "auditor" | "admin">("bank");

  const isGuestOrNone = !address || role === "none";

  const handleTabClick = (tab: "bank" | "user" | "auditor" | "admin") => {
    if (tab === "user" && role !== "user") return;
    if (tab === "auditor" && role !== "auditor") return;
    if (tab === "admin" && role !== "admin") return;
    setActiveTab(tab);
  };

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
        <div className="main-nav">
          <div className="nav-tabs">
            <button
              type="button"
              className={activeTab === "bank" ? "nav-tab active" : "nav-tab"}
              onClick={() => handleTabClick("bank")}
            >
              银行首页
            </button>
            <button
              type="button"
              className={
                activeTab === "user"
                  ? "nav-tab active"
                  : role === "user"
                  ? "nav-tab"
                  : "nav-tab disabled"
              }
              onClick={() => handleTabClick("user")}
            >
              用户
            </button>
            <button
              type="button"
              className={
                activeTab === "auditor"
                  ? "nav-tab active"
                  : role === "auditor"
                  ? "nav-tab"
                  : "nav-tab disabled"
              }
              onClick={() => handleTabClick("auditor")}
            >
              审计员
            </button>
            <button
              type="button"
              className={
                activeTab === "admin"
                  ? "nav-tab active"
                  : role === "admin"
                  ? "nav-tab"
                  : "nav-tab disabled"
              }
              onClick={() => handleTabClick("admin")}
            >
              管理员
            </button>
          </div>
        </div>

        <RatesPanel />

        {activeTab === "bank" && <PublicBankView />}
        {activeTab === "user" && address && role === "user" && <UserDashboard />}
        {activeTab === "auditor" && address && role === "auditor" && <AuditorDashboard />}
        {activeTab === "admin" && address && role === "admin" && <AdminDashboard />}
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
