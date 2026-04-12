import type { ForecastPoint } from "../../types/dashboard";
import SectionCard from "../common/SectionCard";
import { cn } from "../../lib/utils";

interface ForecastStripProps {
  forecast: ForecastPoint[];
}

export default function ForecastStrip({ forecast }: ForecastStripProps) {
  return (
    <SectionCard
      title="6 Hour Outlook"
      subtitle="Storm prediction timeline"
      contentClassName="pt-5"
    >
      <div className="scrollbar-hidden flex gap-3 overflow-x-auto pb-1">
        {forecast.map((item, index) => {
          const Icon = item.icon;
          const active = index === 0;

          return (
            <div
              key={item.id}
              className={cn(
                "min-w-[132px] flex-1 rounded-[24px] border px-4 py-5 transition-all duration-300",
                active
                  ? "border-sky-300/25 bg-gradient-to-b from-sky-400/14 to-white/5 shadow-[0_18px_40px_rgba(14,165,233,0.12)]"
                  : "border-white/6 bg-[#272727] hover:-translate-y-1 hover:border-white/12",
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">{item.label}</p>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]",
                    active ? "bg-sky-300/15 text-sky-200" : "bg-white/5 text-[#949494]",
                  )}
                >
                  {item.status}
                </span>
              </div>

              <div className="mt-5 flex items-center justify-center rounded-[20px] bg-white/5 py-4">
                <Icon className={cn("h-8 w-8", active ? "text-sky-300" : "text-white")} />
              </div>

              <div className="mt-4">
                <p className="text-2xl font-semibold tracking-[-0.05em] text-white">
                  {item.probability}%
                </p>
                <p className="mt-1 text-sm text-[#8e8e8e]">{item.pressure} hPa</p>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
