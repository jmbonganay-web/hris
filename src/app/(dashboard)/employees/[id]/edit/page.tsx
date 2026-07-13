import { redirect } from "next/navigation";

export default async function LegacyEditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/employees/${id}/employment/edit`);
}
