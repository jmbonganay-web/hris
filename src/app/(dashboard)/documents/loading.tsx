export default function DocumentsLoading() {
  return <div className="content-stack" aria-busy="true" aria-label="Loading documents"><div className="card skeleton-block" /><div className="document-summary-grid">{Array.from({ length: 5 }, (_, index) => <div className="card skeleton-block" key={index} />)}</div><div className="card skeleton-block" /></div>;
}
