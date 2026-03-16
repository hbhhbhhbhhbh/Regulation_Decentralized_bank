import React from "react";

export const AdminDashboard: React.FC = () => {
  return (
    <div className="panel">
      <h2>Admin Console</h2>
      <section className="panel-section">
        <h3>Auditor Management</h3>
        <div className="actions-row">
          <button>Add Auditor</button>
          <button>Remove Auditor</button>
        </div>
      </section>
      <section className="panel-section">
        <h3>Global Risk &amp; AML Parameters</h3>
        <div className="actions-row">
          <button>Update Frequency Window</button>
          <button>Update Risk/Interest Curve</button>
          <button>Manage Blacklist / Sanctions</button>
        </div>
        <p className="hint">
          Admins govern the macro parameters of the system, turning regulatory policy into
          upgradable on-chain configuration instead of opaque off-chain rules.
        </p>
      </section>
    </div>
  );
};

