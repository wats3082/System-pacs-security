import { useEffect, useState } from 'react';
import type { KpiSummary } from '@sop/contracts';
import type { ApiClient } from '../api';
import { errorMessage } from '../App';
import { EmptyState, ErrorState, LoadingState, PageHeading } from '../components/States';

export function DashboardPage({ api }: { api: ApiClient }) {
  const [data, setData] = useState<KpiSummary>();
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    setData(undefined);
    setError('');
    api.kpis(7)
      .then((value) => { if (current) setData(value); })
      .catch((reason: unknown) => { if (current) setError(errorMessage(reason)); });
    return () => { current = false; };
  }, [api, version]);

  return (
    <section>
      <PageHeading
        title="Operational posture"
        description="A seven-day view calculated from persisted access, device, and video records."
        action={<button onClick={() => setVersion((value) => value + 1)}>Refresh</button>}
      />
      {error && <ErrorState message={error} retry={() => setVersion((value) => value + 1)} />}
      {!error && !data && <LoadingState label="Computing persisted metrics" />}
      {data && (
        <>
          <div className="metric-grid">
            <Metric label="Access events" value={data.access.total} detail={`${data.access.denied} denied`} tone="amber" />
            <Metric label="Denial rate" value={`${data.access.denialRatePercent}%`} detail={`${data.access.granted} granted`} tone={data.access.denied ? 'red' : 'green'} />
            <Metric label="Fleet availability" value={`${data.devices.availabilityPercent}%`} detail={`${data.devices.online} of ${data.devices.total} online`} tone="green" />
            <Metric label="Video assets" value={data.videos.total} detail={`${data.videos.running + data.videos.queued} processing`} tone="blue" />
          </div>
          <div className="dashboard-grid">
            <article className="panel">
              <div className="panel-title"><h3>Daily access activity</h3><span>UTC</span></div>
              {data.dailyAccess.length === 0
                ? <EmptyState message="Ingest access events to populate the trend." />
                : <DailyBars data={data.dailyAccess} />}
            </article>
            <article className="panel">
              <div className="panel-title"><h3>System state</h3><span>Live aggregate</span></div>
              <StatusRow label="Devices online" value={data.devices.online} total={data.devices.total} tone="green" />
              <StatusRow label="Devices degraded" value={data.devices.degraded} total={data.devices.total} tone="amber" />
              <StatusRow label="Videos complete" value={data.videos.complete} total={data.videos.total} tone="blue" />
              <StatusRow label="Videos failed" value={data.videos.failed} total={data.videos.total} tone="red" />
            </article>
          </div>
          <p className="generated">Calculated {new Date(data.generatedAt).toLocaleString()}</p>
        </>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: string;
}) {
  return (
    <article className={`metric ${tone}`}>
      <span>{label}</span><strong>{value}</strong><small>{detail}</small>
    </article>
  );
}

function DailyBars({ data }: { data: KpiSummary['dailyAccess'] }) {
  const max = Math.max(...data.map((item) => item.total), 1);
  return (
    <div className="bar-chart">
      {data.map((item) => (
        <div className="bar-column" key={item.date}>
          <span>{item.total}</span>
          <div className="bar-track">
            <i style={{ height: `${Math.max((item.total / max) * 100, 4)}%` }} />
          </div>
          <small>{item.date.slice(5)}</small>
        </div>
      ))}
    </div>
  );
}

function StatusRow({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: string;
}) {
  const width = total ? (value / total) * 100 : 0;
  return (
    <div className="status-row">
      <div><span>{label}</span><strong>{value}</strong></div>
      <div className="progress"><i className={tone} style={{ width: `${width}%` }} /></div>
    </div>
  );
}
