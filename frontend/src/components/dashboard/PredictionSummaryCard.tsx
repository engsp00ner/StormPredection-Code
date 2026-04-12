import { Sparkles } from "lucide-react";

import SectionCard from "../common/SectionCard";
import type { PredictionSummary } from "../../types/dashboard";

interface PredictionSummaryCardProps {
  summary: PredictionSummary;
}

export default function PredictionSummaryCard({
  summary,
}: PredictionSummaryCardProps) {
  return (
    <SectionCard
      className="overflow-hidden"
      contentClassName="space-y-5"
      hoverable={false}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            <Sparkles className="h-3.5 w-3.5" />
            {summary.title}
          </div>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[#b9b9b9]">
            {summary.summary}
          </p>
        </div>
        <div className="rounded-[22px] border border-white/8 bg-white/5 px-4 py-3 text-right">
          <p className="text-xs uppercase tracking-[0.18em] text-[#8d8d8d]">
            Confidence
          </p>
          <p className="mt-2 text-lg font-semibold text-white">
            {summary.confidence}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {summary.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-white/8 bg-white/5 px-3 py-2 text-xs font-medium text-[#d5d5d5]"
          >
            {tag}
          </span>
        ))}
      </div>
    </SectionCard>
  );
}
