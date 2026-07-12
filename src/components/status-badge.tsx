import { badgeClass } from "@/lib/utils";
export function StatusBadge({ value }: { value: string }) { return <span className={`badge ${badgeClass(value)}`}>{value}</span>; }
