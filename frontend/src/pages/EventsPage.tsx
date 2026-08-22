import { useEffect, useState } from 'react';
import type {
  AccessDecision,
  AccessEvent,
  AccessEventQuery,
  CredentialStatus,
  InvestigationStatus,
  Page,
} from '@sop/contracts';
import type { ApiClient } from '../api';
import { errorMessage } from '../App';
import { EmptyState, ErrorState, LoadingState, PageHeading } from '../components/States';

type Filters = Pick<AccessEventQuery, 'facilityId' | 'deviceId' | 'decision'>;

export function EventsPage({ api }: { api: ApiClient }) {
  const [page, setPage] = useState<Page<AccessEvent>>();
  const [filters, setFilters] = useState<Filters>({});
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [eventId, setEventId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let current = true;
    setPage(undefined);
    setLoadError('');
    api.events(filters)
      .then((value) => { if (current) setPage(value); })
      .catch((reason: unknown) => { if (current) setLoadError(errorMessage(reason)); });
    return () => { current = false; };
  }, [api, filters, version]);

  const evaluate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    setActionError('');
    setNotice('');
    try {
      const result = await api.evaluateAccess({
        eventId,
        deviceId: String(values.get('deviceId')),
        facilityId: String(values.get('facilityId')),
        subjectId: String(values.get('subjectId')),
        subjectRoles: csv(values.get('subjectRoles')),
        credentialStatus: String(values.get('credentialStatus')) as CredentialStatus,
        occurredAt: new Date(String(values.get('occurredAt'))).toISOString(),
        policy: {
          policyId: String(values.get('policyId')),
          allowedRoles: csv(values.get('allowedRoles')),
          scheduleUtc: {
            startHour: Number(values.get('startHour')),
            endHour: Number(values.get('endHour')),
          },
        },
      });
      setNotice(`${result.item.decision}: ${result.item.reason}. Risk ${result.item.risk?.score ?? 0}/100.`);
      setEventId(crypto.randomUUID());
      setVersion((value) => value + 1);
    } catch (reason) {
      setActionError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const investigate = async (event: React.FormEvent<HTMLFormElement>, eventId: string) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setActionError('');
    setNotice('');
    try {
      const item = await api.investigateEvent(eventId, {
        status: String(values.get('status')) as InvestigationStatus,
        note: String(values.get('note')),
      });
      setPage((current) => current && ({
        ...current,
        items: current.items.map((entry) => entry.eventId === eventId ? item : entry),
      }));
      setNotice(`Investigation updated to ${item.investigation?.status.replace('_', ' ')}.`);
      form.reset();
    } catch (reason) {
      setActionError(errorMessage(reason));
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
    setLoadError('');
    try {
      const next = await api.events({ ...filters, nextToken: page.nextToken });
      setPage({
        items: [...page.items, ...next.items],
        ...(next.nextToken ? { nextToken: next.nextToken } : {}),
      });
    } catch (reason) {
      setLoadError(errorMessage(reason));
    }
  };

  return (
    <section>
      <PageHeading
        title="Policy decisions & investigations"
        description="Evaluate credential, role, and UTC schedule rules server-side, then preserve every investigation action."
      />
      <div className="split-grid">
        <article className="panel form-panel">
          <div className="panel-title"><h3>Simulate badge presentation</h3><span>Decision ID {eventId.slice(0, 8)}</span></div>
          <form className="form-grid" onSubmit={evaluate}>
            <label>Reader ID<input name="deviceId" defaultValue="reader-north-01" required maxLength={128} /></label>
            <label>Facility ID<input name="facilityId" defaultValue="hq" required maxLength={128} /></label>
            <label>Badge subject<input name="subjectId" defaultValue="badge-1042" required maxLength={128} /></label>
            <label>Credential status<select name="credentialStatus"><option>ACTIVE</option><option>SUSPENDED</option><option>EXPIRED</option></select></label>
            <label>Subject roles<input name="subjectRoles" defaultValue="employee" required aria-describedby="roles-help" /></label>
            <label>Policy ID<input name="policyId" defaultValue="hq-standard-entry-v1" required /></label>
            <label>Allowed roles<input name="allowedRoles" defaultValue="employee,security" required aria-describedby="roles-help" /></label>
            <label>Occurred at<input name="occurredAt" type="datetime-local" defaultValue={localDateTime()} required /></label>
            <label>UTC start hour<input name="startHour" type="number" min="0" max="23" defaultValue="7" required /></label>
            <label>UTC end hour<input name="endHour" type="number" min="0" max="23" defaultValue="19" required /></label>
            <small id="roles-help" className="form-help">Separate multiple roles with commas. The server computes the decision; clients cannot override it.</small>
            <button className="primary" disabled={saving}>{saving ? 'Evaluating...' : 'Evaluate & record'}</button>
          </form>
          {actionError && <div className="alert error" role="alert">{actionError}</div>}
          {notice && <div className="alert success" role="status" aria-live="polite">{notice}</div>}
        </article>
        <article className="panel">
          <div className="panel-title"><h3>Investigation queue</h3><span>Newest first</span></div>
          <form className="filter-row" onSubmit={applyFilters}>
            <input name="facilityId" placeholder="Facility ID" aria-label="Facility ID" />
            <input name="deviceId" placeholder="Reader ID" aria-label="Reader ID" />
            <select name="decision" aria-label="Decision">
              <option value="">All decisions</option><option>GRANTED</option><option>DENIED</option>
            </select>
            <button>Apply filters</button>
          </form>
          {loadError && <ErrorState message={loadError} retry={() => setVersion((value) => value + 1)} />}
          {!loadError && !page && <LoadingState />}
          {page?.items.length === 0 && <EmptyState message="No access events match these filters." />}
          {page && page.items.length > 0 && (
            <div className="case-list">
              {page.items.map((item) => <InvestigationCard key={item.eventId} item={item} onSubmit={investigate} />)}
            </div>
          )}
          {page?.nextToken && <button className="load-more" onClick={() => void loadMore()}>Load more</button>}
        </article>
      </div>
    </section>
  );
}

function InvestigationCard({
  item,
  onSubmit,
}: {
  item: AccessEvent;
  onSubmit: (event: React.FormEvent<HTMLFormElement>, eventId: string) => Promise<void>;
}) {
  return (
    <article className="case-card">
      <div className="case-summary">
        <span className={`badge ${item.decision === 'GRANTED' ? 'green' : 'red'}`}>{item.decision}</span>
        <div><strong>{item.deviceId}</strong><small>{item.facilityId} · subject {item.subjectId}</small></div>
        <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString()}</time>
      </div>
      <div className="evidence-grid">
        <span><small>Policy</small>{item.evidence?.policyId ?? 'Legacy ingest'}</span>
        <span><small>Credential</small>{item.evidence?.credentialStatus ?? 'Not captured'}</span>
        <span><small>Risk</small>{item.risk?.score ?? 0}/100</span>
        <span><small>Case</small>{item.investigation?.status.replace('_', ' ') ?? 'Not available'}</span>
      </div>
      {item.risk?.signals.length ? <p className="signals">Signals: {item.risk.signals.join(' · ')}</p> : null}
      {item.evidence && (
        <form
          key={item.investigation?.updatedAt}
          className="investigation-form"
          onSubmit={(event) => void onSubmit(event, item.eventId)}
        >
          <select name="status" aria-label={`Investigation status for ${item.eventId}`} defaultValue={item.investigation?.status}>
            <option>INVESTIGATING</option><option>RESOLVED</option><option>FALSE_POSITIVE</option>
          </select>
          <input name="note" aria-label={`Investigation note for ${item.eventId}`} placeholder="Evidence reviewed and disposition rationale" minLength={3} required />
          <button>Append audit entry</button>
        </form>
      )}
      {item.investigation?.history.length ? (
        <details><summary>Audit history ({item.investigation.history.length})</summary>
          <ol>{item.investigation.history.map((entry) => (
            <li key={`${entry.occurredAt}-${entry.actorId}`}><strong>{entry.status.replace('_', ' ')}</strong> — {entry.note} <time>{new Date(entry.occurredAt).toLocaleString()}</time></li>
          ))}</ol>
        </details>
      ) : null}
    </article>
  );
}

function csv(value: FormDataEntryValue | null): string[] {
  return String(value).split(',').map((entry) => entry.trim()).filter(Boolean);
}

function localDateTime(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
