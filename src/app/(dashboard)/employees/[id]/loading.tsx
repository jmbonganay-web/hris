export default function EmployeeProfileLoading() {
  return (
    <div aria-busy="true" aria-label="Loading employee profile">
      <div className="skeleton profile-header-skeleton" />
      <div className="skeleton profile-tabs-skeleton" />
      <div className="profile-overview-grid">
        <div className="skeleton profile-card-skeleton" />
        <div className="skeleton profile-card-skeleton" />
        <div className="skeleton profile-card-skeleton" />
        <div className="skeleton profile-card-skeleton" />
      </div>
    </div>
  );
}
