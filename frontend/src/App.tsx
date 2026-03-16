import React, { useState } from "react";
import { UserDashboard } from "./components/UserDashboard";
import { AuditorDashboard } from "./components/AuditorDashboard";
import { AdminDashboard } from "./components/AdminDashboard";

type Role = "user" | "auditor" | "admin";

const App: React.FC = () => {
  const [role, setRole] = useState<Role>("user");

  return (
    <div className="app">
      <header className="app-header">
        <h1>SafeHarbor (SHIB) - Regulated DeFi Simulator</h1>
        <p>Regulation-as-Code · KYC · CDD · AML</p>
        <div className="role-switcher">
          <button
            className={role === "user" ? "active" : ""}
            onClick={() => setRole("user")}
          >
            User
          </button>
          <button
            className={role === "auditor" ? "active" : ""}
            onClick={() => setRole("auditor")}
          >
            Auditor
          </button>
          <button
            className={role === "admin" ? "active" : ""}
            onClick={() => setRole("admin")}
          >
            Admin
          </button>
        </div>
      </header>
      <main className="app-main">
        {role === "user" && <UserDashboard />}
        {role === "auditor" && <AuditorDashboard />}
        {role === "admin" && <AdminDashboard />}
      </main>
    </div>
  );
};

export default App;

