import { useState } from 'react';
import './App.css';

type Tab = 'summary' | 'users-roles' | 'access-events' | 'devices';

const NAV: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'users-roles', label: 'Users & Roles' },
  { id: 'access-events', label: 'Access Events' },
  { id: 'devices', label: 'Devices' },
];

export default function App() {
  const [active, setActive] = useState<Tab>('summary');

  return (
    <div className="shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">PACS Security</p>
          <h1>Physical access security control plane</h1>
          <p className="tagline">Policy-driven access workflows with serverless AWS foundations.</p>
        </div>
      </header>

      <div className="body">
        <aside className="sidebar">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-btn${active === item.id ? ' active' : ''}`}
              onClick={() => setActive(item.id)}
            >
              <span className="nav-dot" />
              {item.label}
            </button>
          ))}
        </aside>

        <main className="content">
          {active === 'summary' && (
            <section className="page">
              <h2>Product Summary</h2>
              <p className="lead">
                Securely manage users, roles, devices, and access activity with auditable events.
              </p>
              <div className="card-grid">
                <article className="card"><h3>User Lifecycle</h3><p>Create and deactivate identities tied to role policies.</p></article>
                <article className="card"><h3>Role Policies</h3><p>Map permissions to readers, schedules, and facilities.</p></article>
                <article className="card"><h3>Access Audit</h3><p>Track grant/deny events with immutable event logs.</p></article>
                <article className="card"><h3>Device Registry</h3><p>Manage readers, panels, and endpoint health status.</p></article>
              </div>
            </section>
          )}

          {active === 'users-roles' && (
            <section className="page">
              <h2>Users and Roles MVP</h2>
              <div className="list-card">
                <code>GET /api/users</code>
                <code>POST /api/users</code>
                <code>GET /api/roles</code>
                <code>POST /api/roles</code>
              </div>
            </section>
          )}

          {active === 'access-events' && (
            <section className="page">
              <h2>Access Events MVP</h2>
              <div className="list-card">
                <code>GET /api/events?facilityId=HQ</code>
                <code>POST /api/events</code>
                <p>Event types: ACCESS_GRANTED, ACCESS_DENIED, DEVICE_OFFLINE.</p>
              </div>
            </section>
          )}

          {active === 'devices' && (
            <section className="page">
              <h2>Devices MVP</h2>
              <div className="list-card">
                <code>GET /api/devices</code>
                <code>POST /api/devices</code>
                <code>PATCH /api/devices/:id</code>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
