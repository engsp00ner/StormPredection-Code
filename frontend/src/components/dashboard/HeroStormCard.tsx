import { motion } from "framer-motion";
import { CloudLightning, MapPin } from "lucide-react";

import SectionCard from "../common/SectionCard";
import type { HeroData } from "../../types/dashboard";

interface HeroStormCardProps {
  data: HeroData;
  windBand?: string;
  pressureDrop?: string;
}

export default function HeroStormCard({
  data,
  windBand = "Live feed",
  pressureDrop = "Tracking",
}: HeroStormCardProps) {
  return (
    <SectionCard className="overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_28%),linear-gradient(145deg,#252525_0%,#171717_100%)]">
      <div className="flex flex-col gap-10">
        <div className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white">
            <MapPin className="h-3.5 w-3.5 text-sky-300" />
            {data.location}
          </div>
          <div className="rounded-full border border-white/8 bg-white/6 px-4 py-2 text-sm font-medium text-[#cbcbcb]">
            {data.unit}
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-[#8a8a8a]">
              {data.dayLabel}
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">
              {data.dateLabel}
            </h1>

            <div className="relative mt-8 flex min-h-[200px] items-center justify-center rounded-[30px] border border-white/6 bg-[#202020]/80 panel-grid">
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
                className="relative"
              >
                <div className="relative flex h-36 w-36 items-center justify-center rounded-full bg-[radial-gradient(circle,_rgba(250,204,21,0.55),_rgba(250,204,21,0.1)_50%,_transparent_70%)]">
                  <div className="absolute left-4 top-9 h-16 w-20 rounded-full bg-white/90 blur-[0.5px]" />
                  <div className="absolute right-5 top-12 h-14 w-16 rounded-full bg-white/80" />
                  <div className="absolute bottom-6 left-10 h-12 w-20 rounded-full bg-white/85" />
                  <CloudLightning className="relative z-10 h-12 w-12 text-sky-300 drop-shadow-[0_0_18px_rgba(56,189,248,0.45)]" />
                </div>
                <div className="absolute -right-8 top-12 h-20 w-20 rounded-full border border-cyan-300/20 bg-cyan-300/8 blur-xl" />
              </motion.div>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-[30px] border border-white/8 bg-[#272727]/90 p-6">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-[#838383]">
                Storm Probability
              </p>
              <div className="mt-5 flex items-end gap-2">
                <span className="text-6xl font-bold tracking-[-0.08em] text-white">
                  {data.stormProbability}%
                </span>
                <span className="pb-2 text-lg text-[#b9b9b9]">/ {data.riskLabel}</span>
              </div>
            </div>

            <div className="mt-10 space-y-4">
              <div className="rounded-[24px] border border-rose-400/15 bg-gradient-to-br from-rose-500/12 to-orange-400/5 p-5">
                <p className="text-sm text-[#b9b9b9]">Current status</p>
                <p className="mt-2 text-2xl font-semibold text-white">{data.status}</p>
                <p className="mt-2 text-sm text-[#d7a4a4]">{data.expectation}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm text-[#a9a9a9]">
                <div className="rounded-[20px] bg-white/5 p-4">
                  <p>Wind band</p>
                  <p className="mt-2 text-lg font-semibold text-white">{windBand}</p>
                </div>
                <div className="rounded-[20px] bg-white/5 p-4">
                  <p>Pressure drop</p>
                  <p className="mt-2 text-lg font-semibold text-white">{pressureDrop}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
