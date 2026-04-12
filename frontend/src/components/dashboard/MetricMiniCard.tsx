import type { HighlightMetric } from "../../types/dashboard";
import { cn } from "../../lib/utils";

const accentStyles = {
  blue: "from-sky-400/20 to-sky-500/5 text-sky-300",
  amber: "from-amber-300/20 to-orange-400/5 text-amber-300",
  red: "from-rose-400/20 to-red-500/5 text-rose-300",
  cyan: "from-cyan-300/20 to-teal-400/5 text-cyan-300",
};

interface MetricMiniCardProps {
  metric: HighlightMetric;
}

export default function MetricMiniCard({ metric }: MetricMiniCardProps) {
  const Icon = metric.icon;

  return (
    <div
      className={cn(
        "card-hover flex h-full min-h-[164px] flex-col rounded-[24px] border border-white/6 bg-[#272727] p-5",
        metric.featured && "sm:min-h-[186px]",
      )}
    >
      <div
        className={cn(
          "mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ring-1 ring-white/6",
          accentStyles[metric.accent],
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm text-[#b9b9b9]">{metric.label}</p>
      <p className="mt-3 text-[1.8rem] font-bold tracking-[-0.04em] text-white">
        {metric.value}
      </p>
      <p className="mt-auto pt-3 text-sm leading-6 text-[#8d8d8d]">
        {metric.subtitle}
      </p>
    </div>
  );
}
