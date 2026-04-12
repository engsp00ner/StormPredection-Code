import type { StationSnapshot } from "../../types/dashboard";
import { cn } from "../../lib/utils";
import SectionCard from "../common/SectionCard";

const accentMap = {
  blue: "text-sky-300 bg-sky-300/10",
  amber: "text-amber-300 bg-amber-300/10",
  red: "text-rose-300 bg-rose-300/10",
  cyan: "text-cyan-300 bg-cyan-300/10",
};

interface RecentStationsCardProps {
  stations: StationSnapshot[];
}

export default function RecentStationsCard({
  stations,
}: RecentStationsCardProps) {
  return (
    <SectionCard
      title="Recent Sensor Snapshots"
      subtitle="Showing 3 snapshots at a time with scrollable history"
    >
      <div className="dashboard-scrollbar max-h-[38rem] space-y-3 overflow-y-auto pr-2">
        {stations.map((station) => {
          const Icon = station.icon;

          return (
            <div
              key={station.id}
              className="rounded-[22px] border border-white/6 bg-[#272727] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                      accentMap[station.accent],
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 space-y-2">
                    <div>
                      <p className="text-sm font-semibold tracking-[0.04em] text-white">
                        {station.station}
                      </p>
                      <p className="mt-1 text-sm text-[#8d8d8d]">
                        {station.condition}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/6 bg-black/10 px-3 py-3">
                      <p className="text-sm leading-6 text-[#d5d5d5]">
                        {station.value}
                      </p>
                    </div>
                  </div>
                </div>

                <span
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.18em]",
                    accentMap[station.accent],
                  )}
                >
                  LIVE
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
