export function LoadingState({ label = 'Loading operational data' }: { label?: string }) {
  return <div className="state-card"><span className="spinner" />{label}</div>;
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="state-card error" role="alert">
      <div><strong>Request failed</strong><p>{message}</p></div>
      {retry && <button onClick={retry}>Retry</button>}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="state-card empty"><strong>No records found</strong><p>{message}</p></div>;
}

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div><h2>{title}</h2><p>{description}</p></div>
      {action}
    </div>
  );
}
