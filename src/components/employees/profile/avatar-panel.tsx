import { initials } from "@/lib/utils";
import { AvatarUploadForm } from "./avatar-upload-form";
import type { EmployeeActionState } from "@/features/employees/types";

export function AvatarPanel({
  name,
  avatarUrl,
  canManage,
  uploadAction,
  removeAction,
}: {
  name: string;
  avatarUrl: string | null;
  canManage: boolean;
  uploadAction: (state: EmployeeActionState, formData: FormData) => Promise<EmployeeActionState>;
  removeAction: () => Promise<void>;
}) {
  return (
    <div className="profile-avatar-panel">
      {avatarUrl
        ? <img className="profile-avatar-image" src={avatarUrl} alt={`${name}'s profile`} />
        : <div className="profile-avatar profile-avatar-large">{initials(name)}</div>}
      {canManage && <AvatarUploadForm action={uploadAction} hasAvatar={Boolean(avatarUrl)} removeAction={removeAction} />}
    </div>
  );
}
