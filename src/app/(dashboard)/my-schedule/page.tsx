import { MyScheduleCard } from "@/components/schedules/my-schedule-card";
import { PageHeader } from "@/components/page-header";
import { requireOwnScheduleEmployee } from "@/features/schedules/auth";
import { getResolvedEmployeeSchedule } from "@/features/schedules/queries";

export default async function MySchedulePage() {
  const { employee } = await requireOwnScheduleEmployee();
  const schedule = await getResolvedEmployeeSchedule(employee.id);
  return <><PageHeader title="My Schedule" description="Your current work schedule and upcoming changes." /><MyScheduleCard schedule={schedule} /></>;
}
