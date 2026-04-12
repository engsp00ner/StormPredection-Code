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
      subtitle="Nearby stations and latest conditions"
    >
      <div className="space-y-3">
        {stations.map((station) => {
          const Icon = station.icon;

          return (
            <div
              key={station.id}
              className="card-hover flex items-center justify-between gap-4 rounded-[24px] border border-white/6 bg-[#272727] px-4 py-4"
            >
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-2xl",
                    accentMap[station.accent],
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-white">{station.station}</p>
                  <p className="text-sm text-[#8d8d8d]">{station.condition}</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-[#d8d8d8]">{station.value}</p>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
