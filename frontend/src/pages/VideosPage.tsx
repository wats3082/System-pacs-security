import { useEffect, useState } from 'react';
import type { Page, VideoAsset, VideoStatus } from '@sop/contracts';
import type { ApiClient } from '../api';
import { errorMessage } from '../App';
import { EmptyState, ErrorState, LoadingState, PageHeading } from '../components/States';

export function VideosPage({ api }: { api: ApiClient }) {
  const [page, setPage] = useState<Page<VideoAsset>>();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<VideoStatus | undefined>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    setPage(undefined);
    setError('');
    api.videos({ query: query || undefined, status })
      .then((value) => { if (current) setPage(value); })
      .catch((reason: unknown) => { if (current) setError(errorMessage(reason)); });
    return () => { current = false; };
  }, [api, query, status, version]);

  const register = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.registerVideo({
        videoId: crypto.randomUUID(),
        title: String(values.get('title')),
        facilityId: String(values.get('facilityId')),
        sourceDeviceId: String(values.get('sourceDeviceId')) || undefined,
        recordedAt: new Date(String(values.get('recordedAt'))).toISOString(),
        contentType: 'video/mp4',
        tags: String(values.get('tags')).split(',').map((tag) => tag.trim()).filter(Boolean),
      });
      setNotice('Video metadata registered with QUEUED status.');
      form.reset();
      setVersion((value) => value + 1);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const search = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setQuery(String(values.get('query')).trim());
    setStatus((String(values.get('status')) || undefined) as VideoStatus | undefined);
  };

  const updateStatus = async (event: React.FormEvent<HTMLFormElement>, videoId: string) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const nextStatus = String(values.get('status')) as VideoStatus;
    setError('');
    try {
      await api.updateVideoStatus(videoId, {
        status: nextStatus,
        errorMessage: nextStatus === 'FAILED' ? String(values.get('errorMessage')) : undefined,
      });
      setVersion((value) => value + 1);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  const loadMore = async () => {
    if (!page?.nextToken) return;
    setError('');
    try {
      const next = await api.videos({
        query: query || undefined,
        status,
        nextToken: page.nextToken,
      });
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
        title="Video metadata library"
        description="Searchable catalog and processing state. Binary upload and analysis are outside this MVP."
      />
      <div className="split-grid">
        <article className="panel form-panel">
          <div className="panel-title"><h3>Register metadata</h3><span>No binary upload</span></div>
          <form className="form-grid" onSubmit={register}>
            <label>Title<input name="title" required maxLength={200} /></label>
            <label>Facility ID<input name="facilityId" required maxLength={128} /></label>
            <label>Source device<input name="sourceDeviceId" maxLength={128} /></label>
            <label>Recorded at<input name="recordedAt" type="datetime-local" required /></label>
            <label className="wide">Tags<input name="tags" placeholder="entrance, incident, overnight" /></label>
            <button className="primary" disabled={saving}>{saving ? 'Registering...' : 'Register metadata'}</button>
          </form>
          {notice && <div className="alert success">{notice}</div>}
        </article>
        <article className="panel">
          <div className="panel-title"><h3>Library</h3><span>{page?.items.length ?? 0} loaded</span></div>
          <form className="filter-row" onSubmit={search}>
            <input name="query" placeholder="Search title, tags, facility" aria-label="Search videos" />
            <select name="status" aria-label="Video status">
              <option value="">All statuses</option><option>QUEUED</option><option>RUNNING</option><option>COMPLETE</option><option>FAILED</option>
            </select>
            <button>Search</button>
          </form>
          {error && <ErrorState message={error} retry={() => setVersion((value) => value + 1)} />}
          {!error && !page && <LoadingState />}
          {page?.items.length === 0 && <EmptyState message="No video metadata matches this search." />}
          {page && page.items.length > 0 && (
            <div className="video-grid">
              {page.items.map((video) => (
                <article className="video-card" key={video.videoId}>
                  <div className="video-thumb"><span>{video.status}</span><i /></div>
                  <div className="video-body">
                    <strong>{video.title}</strong>
                    <small>{video.facilityId} · {new Date(video.recordedAt).toLocaleString()}</small>
                    <div className="tags">{video.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                    <form className="status-form" onSubmit={(event) => void updateStatus(event, video.videoId)}>
                      <select name="status" defaultValue={video.status}>
                        <option>QUEUED</option><option>RUNNING</option><option>COMPLETE</option><option>FAILED</option>
                      </select>
                      <input name="errorMessage" placeholder="Failure reason (required if failed)" />
                      <button>Update</button>
                    </form>
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
