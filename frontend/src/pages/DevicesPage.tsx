import { useEffect, useState } from 'react';
import type { Device, DeviceStatus, DeviceType, Page } from '@sop/contracts';
import type { ApiClient } from '../api';
import { errorMessage } from '../App';
import { EmptyState, ErrorState, LoadingState, PageHeading } from '../components/States';

export function DevicesPage({ api }: { api: ApiClient }) {
  const [page, setPage] = useState<Page<Device>>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    setPage(undefined);
    setError('');
    api.devices()
      .then((value) => { if (current) setPage(value); })
      .catch((reason: unknown) => { if (current) setError(errorMessage(reason)); });
    return () => { current = false; };
  }, [api, version]);

  const register = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.registerDevice({
        deviceId: String(values.get('deviceId')),
        name: String(values.get('name')),
        type: String(values.get('type')) as DeviceType,
        facilityId: String(values.get('facilityId')),
        location: String(values.get('location')),
      });
      setNotice('Device registered in offline state.');
      form.reset();
      setVersion((value) => value + 1);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const heartbeat = async (deviceId: string) => {
    setError('');
    try {
      await api.heartbeat(deviceId, { status: 'ONLINE' });
      setVersion((value) => value + 1);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  const updateStatus = async (deviceId: string, status: DeviceStatus) => {
    setError('');
    try {
      await api.updateDevice(deviceId, { status });
      setVersion((value) => value + 1);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  const loadMore = async () => {
    if (!page?.nextToken) return;
    setError('');
    try {
      const next = await api.devices({ nextToken: page.nextToken });
      setPage({
        items: [...page.items, ...next.items],
        ...(next.nextToken ? { nextToken: next.nextToken } : {}),
      });
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  return (
    <section>
      <PageHeading title="Device fleet" description="Registration, operator status updates, and timestamped heartbeats." />
      <div className="split-grid narrow-form">
        <article className="panel form-panel">
          <div className="panel-title"><h3>Register device</h3><span>Starts offline</span></div>
          <form className="form-grid" onSubmit={register}>
            <label>Device ID<input name="deviceId" required maxLength={128} /></label>
            <label>Name<input name="name" required maxLength={200} /></label>
            <label>Type<select name="type">
              <option>ACCESS_READER</option><option>CAMERA</option><option>SENSOR</option><option>CONTROLLER</option>
            </select></label>
            <label>Facility ID<input name="facilityId" required maxLength={128} /></label>
            <label>Location<input name="location" required maxLength={300} /></label>
            <button className="primary" disabled={saving}>{saving ? 'Registering...' : 'Register device'}</button>
          </form>
          {notice && <div className="alert success">{notice}</div>}
        </article>
        <article className="panel">
          <div className="panel-title"><h3>Registered devices</h3><span>{page?.items.length ?? 0} loaded</span></div>
          {error && <ErrorState message={error} retry={() => setVersion((value) => value + 1)} />}
          {!error && !page && <LoadingState />}
          {page?.items.length === 0 && <EmptyState message="Register a reader, camera, sensor, or controller." />}
          {page && page.items.length > 0 && (
            <div className="device-grid">
              {page.items.map((device) => (
                <article className="device-card" key={device.deviceId}>
                  <div className="device-title">
                    <span className={`status-dot ${device.status.toLowerCase()}`} />
                    <div><strong>{device.name}</strong><small>{device.deviceId}</small></div>
                    <span className="badge">{device.type.replace('_', ' ')}</span>
                  </div>
                  <p>{device.facilityId} · {device.location}</p>
                  <small>Heartbeat: {device.lastHeartbeatAt ? new Date(device.lastHeartbeatAt).toLocaleString() : 'Never'}</small>
                  <div className="card-actions">
                    <button onClick={() => void heartbeat(device.deviceId)}>Heartbeat</button>
                    <select
                      value={device.status}
                      aria-label={`Status for ${device.name}`}
                      onChange={(event) => void updateStatus(device.deviceId, event.target.value as DeviceStatus)}
                    >
                      <option>ONLINE</option><option>OFFLINE</option><option>DEGRADED</option><option>MAINTENANCE</option>
                    </select>
                  </div>
                </article>
              ))}
            </div>
          )}
          {page?.nextToken && <button className="load-more" onClick={() => void loadMore()}>Load more</button>}
        </article>
      </div>
    </section>
  );
}
