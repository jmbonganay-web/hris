import Link from "next/link";

export function ProfileSection({
  title,
  description,
  editHref,
  canManage,
  children,
}: {
  title: string;
  description?: string;
  editHref?: string;
  canManage?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="card profile-section-card">
      <div className="profile-section-heading">
        <div>
          <h2>{title}</h2>
          {description && <p className="muted">{description}</p>}
        </div>
        {canManage && editHref && <Link className="btn" href={editHref}>Edit</Link>}
      </div>
      {children}
    </section>
  );
}
