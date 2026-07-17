import { buildTrendPolyline } from "@/features/dashboard/chart";
import type { DashboardTrendPoint } from "@/features/dashboard/types";

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = 24;

export function DashboardTrendChart({
  points,
  title = "Attendance trend",
  description = "Daily present, absent, and exception counts for the selected period.",
}: {
  points: DashboardTrendPoint[];
  title?: string;
  description?: string;
}) {
  const hasActivity = points.some((point) => point.present || point.absent || point.exceptions);
  const present = buildTrendPolyline(points.map((point) => point.present), WIDTH, HEIGHT, PADDING);
  const absent = buildTrendPolyline(points.map((point) => point.absent), WIDTH, HEIGHT, PADDING);
  const exceptions = buildTrendPolyline(points.map((point) => point.exceptions), WIDTH, HEIGHT, PADDING);

  return (
    <article className="card dashboard-chart-card">
      <div className="section-heading">
        <div><h2>{title}</h2><p>{description}</p></div>
      </div>
      {!hasActivity ? (
        <div className="empty-state compact"><strong>No attendance activity</strong><span>No calculated attendance records are available for this period.</span></div>
      ) : (
        <>
          <div className="dashboard-chart-frame">
            <svg aria-labelledby="dashboard-trend-title dashboard-trend-description" role="img" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
              <title id="dashboard-trend-title">{title}</title>
              <desc id="dashboard-trend-description">{description}</desc>
              <line className="dashboard-chart-axis" x1={PADDING} x2={WIDTH - PADDING} y1={HEIGHT - PADDING} y2={HEIGHT - PADDING} />
              <polyline className="dashboard-trend-line present" fill="none" points={present} />
              <polyline className="dashboard-trend-line absent" fill="none" points={absent} />
              <polyline className="dashboard-trend-line exceptions" fill="none" points={exceptions} />
            </svg>
          </div>
          <div className="dashboard-chart-legend" aria-label="Chart legend">
            <span><i className="present" />Present</span>
            <span><i className="absent" />Absent</span>
            <span><i className="exceptions" />Exceptions</span>
          </div>
          <div className="dashboard-chart-range" aria-hidden="true">
            <span>{points[0]?.date}</span><span>{points.at(-1)?.date}</span>
          </div>
        </>
      )}
    </article>
  );
}
