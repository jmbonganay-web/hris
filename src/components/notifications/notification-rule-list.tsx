import type { NotificationRule } from "@/features/notifications/types";
import { NotificationRuleForm } from "./notification-rule-form";
export function NotificationRuleList({ rules, readOnly }: { rules: NotificationRule[]; readOnly: boolean }) {
  return <div className="notification-settings-grid">{rules.map(rule=><NotificationRuleForm key={rule.id} rule={rule} readOnly={readOnly}/>)}</div>;
}
