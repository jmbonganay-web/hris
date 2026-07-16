export type DocumentSummaryCounts = { missing: number; pendingReview: number; approved: number; expiringSoon: number; expired: number };
const items: Array<[keyof DocumentSummaryCounts, string]> = [
  ["missing", "Missing"], ["pendingReview", "Pending review"], ["approved", "Approved"],
  ["expiringSoon", "Expiring soon"], ["expired", "Expired"],
];
export function DocumentSummaryCards({ counts }: { counts: DocumentSummaryCounts }) {
  return <section className="document-summary-grid" aria-label="Document summary">
    {items.map(([key, label]) => <article className="card metric-card" key={key}><span>{label}</span><strong>{counts[key]}</strong></article>)}
  </section>;
}
