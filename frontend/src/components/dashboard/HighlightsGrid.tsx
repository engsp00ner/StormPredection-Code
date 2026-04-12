import MetricMiniCard from "./MetricMiniCard";
import PredictionSummaryCard from "./PredictionSummaryCard";
import type { HighlightMetric, PredictionSummary } from "../../types/dashboard";

interface HighlightsGridProps {
  metrics: HighlightMetric[];
  summary: PredictionSummary;
}

export default function HighlightsGrid({
  metrics,
  summary,
}: HighlightsGridProps) {
  return (
    <div className="space-y-5">
      <PredictionSummaryCard summary={summary} />

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-[#7c7c7c]">
              Sensor Overview
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Today&apos;s Highlights
            </h2>
          </div>
          <p className="text-sm text-[#8d8d8d]">Updated 2 minutes ago</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.map((metric) => (
            <MetricMiniCard key={metric.id} metric={metric} />
          ))}
        </div>
      </section>
    </div>
  );
}
