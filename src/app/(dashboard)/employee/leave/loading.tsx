export default function EmployeeLeaveLoading() {
  return (
    <div aria-busy="true" aria-label="Loading leave workspace">
      <div className="page-header"><div><div className="skeleton skeleton-heading" /><div className="skeleton skeleton-line" /></div></div>
      <section className="leave-balance-grid">
        {[0, 1, 2].map((item) => <div className="card skeleton-card" key={item}><div className="skeleton skeleton-heading" /><div className="skeleton skeleton-line" /></div>)}
      </section>
      <div className="card skeleton-card"><div className="skeleton skeleton-heading" /><div className="skeleton skeleton-block" /></div>
      <div className="card skeleton-card"><div className="skeleton skeleton-heading" /><div className="skeleton skeleton-block" /></div>
    </div>
  );
}
