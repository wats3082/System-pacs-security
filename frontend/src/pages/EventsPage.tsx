import { useEffect, useState } from 'react';
import type { AccessDecision, AccessEvent, AccessEventQuery, Page } from '@sop/contracts';
import type { ApiClient } from '../api';
import { errorMessage } from '../App';
import { EmptyState, ErrorState, LoadingState, PageHeading } from '../components/States';

type Filters = Pick<AccessEventQuery, 'facilityId' | 'deviceId' | 'decision'>;

export function EventsPage({ api }: { api: ApiClient }) {
  const [page, setPage] = useState<Page<AccessEvent>>();
  const [filters, setFilters] = useState<Filters>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [eventId, setEventId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let current = true;
    setPage(undefined);
    setError('');
    api.events(filters)
      .then((value) => { if (current) setPage(value); })
      .catch((reason: unknown) => { if (current) setError(errorMessage(reason)); });
    return () => { current = false; };
  }, [api, filters, version]);

  const submitEvent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await api.ingestEvent({
        eventId,
        deviceId: String(values.get('deviceId')),
        facilityId: String(values.get('facilityId')),
        subjectId: String(values.get('subjectId')),
        decision: String(values.get('decision')) as AccessDecision,
        occurredAt: new Date(String(values.get('occurredAt'))).toISOString(),
        reason: String(values.get('reason')) || undefined,
      });
      setNotice(result.created ? 'Access event recorded.' : 'Matching event already existed.');
      form.reset();
      setEventId(crypto.randomUUID());
      setVersion((value) => value + 1);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setFilters({
      facilityId: String(values.get('facilityId')) || undefined,
      deviceId: String(values.get('deviceId')) || undefined,
      decision: (String(values.get('decision')) || undefined) as AccessDecision | undefined,
    });
  };

  const loadMore = async () => {
    if (!page?.nextToken) return;
    setError('');
    try {
      const next = await api.events({ ...filters, nextToken: page.nextToken });
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
      <PageHeading
        title="Access event audit"
        description="Validated, idempotent access decisions retained in DynamoDB."
      />
      <div className="split-grid">
        <article className="panel form-panel">
          <div className="panel-title"><h3>Record event</h3><span>Retry ID {eventId.slice(0, 8)}</span></div>
          <form className="form-grid" onSubmit={submitEvent}>
            <label>Device ID<input name="deviceId" required maxLength={128} /></label>
            <label>Facility ID<input name="facilityId" required maxLength={128} /></label>
            <label>Subject ID<input name="subjectId" required maxLength={128} /></label>
            <label>Decision<select name="decision"><option>GRANTED</option><option>DENIED</option></select></label>
            <label>Occurred at<input name="occurredAt" type="datetime-local" required /></label>
            <label>Reason<input name="reason" maxLength={300} /></label>
            <button className="primary" disabled={saving}>{saving ? 'Recording...' : 'Record event'}</button>
          </form>
          {notice && <div className="alert success">{notice}</div>}
        </article>
        <article className="panel">
          <div className="panel-title"><h3>Audit filters</h3><span>Newest first</span></div>
          <form className="filter-row" onSubmit={applyFilters}>
            <input name="facilityId" placeholder="Facility ID" aria-label="Facility ID" />
            <input name="deviceId" placeholder="Device ID" aria-label="Device ID" />
            <select name="decision" aria-label="Decision">
              <option value="">All decisions</option><option>GRANTED</option><option>DENIED</option>
            </select>
            <button>Apply</button>
          </form>
          {error && <ErrorState message={error} retry={() => setVersion((value) => value + 1)} />}
          {!error && !page && <LoadingState />}
          {page?.items.length === 0 && <EmptyState message="No access events match these filters." />}
          {page && page.items.length > 0 && (
            <div className="record-list">
              {page.items.map((item) => (
                <article className="record" key={item.eventId}>
                  <span className={`badge ${item.decision === 'GRANTED' ? 'green' : 'red'}`}>{item.decision}</span>
                  <div><strong>{item.deviceId}</strong><small>{item.facilityId} · subject {item.subjectId}</small></div>
                  <time>{new Date(item.occurredAt).toLocaleString()}</time>
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
