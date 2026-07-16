import { DocumentReviewQueue } from "@/components/documents/document-review-queue";
import { PageHeader } from "@/components/page-header";
import { requireDocumentReviewer } from "@/features/documents/auth";
import { listCurrentDocumentCategories } from "@/features/documents/categories/queries";
import { listDocumentReviewQueue } from "@/features/documents/reviews/queries";

function scalar(value: string | string[] | undefined) { return typeof value === "string" ? value : undefined; }
function pageNumber(value: string | string[] | undefined) { const parsed = Number(scalar(value) ?? "1"); return Number.isInteger(parsed) && parsed > 0 ? parsed : 1; }

export default async function DocumentReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireDocumentReviewer();
  const query = await searchParams;
  const status = scalar(query.status) === "replacement_requested" ? "replacement_requested" : "pending_review";
  const expiration = scalar(query.expiration) as "none" | "valid" | "expiring_soon" | "expired" | undefined;
  const page = pageNumber(query.page);
  const [rows, categories] = await Promise.all([
    listDocumentReviewQueue({ status, categoryId: scalar(query.category), employeeQuery: scalar(query.employee), submittedFrom: scalar(query.from), submittedTo: scalar(query.to), expiration, page }),
    listCurrentDocumentCategories(),
  ]);
  return <><PageHeader title="Document Review Queue" description="Review employee submissions with immutable decisions and safe concurrency checks." /><DocumentReviewQueue rows={rows} categories={categories} filters={{ status, category: scalar(query.category), employee: scalar(query.employee), from: scalar(query.from), to: scalar(query.to), expiration, page }} /></>;
}
