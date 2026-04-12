import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

import SectionCard from "./SectionCard";

interface PlaceholderPanelProps {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export default function PlaceholderPanel({
  eyebrow,
  title,
  description,
  icon: Icon,
}: PlaceholderPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <SectionCard className="overflow-hidden">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[28px] border border-white/8 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.14),_transparent_32%),linear-gradient(160deg,#242424_0%,#181818_100%)] p-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-sky-300">
              <Icon className="h-7 w-7" />
            </div>
            <p className="mt-8 text-xs uppercase tracking-[0.24em] text-[#8a8a8a]">
              {eyebrow}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">
              {title}
            </h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-[#a0a0a0]">
              {description}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              "Frontend route is live",
              "Premium layout shell reused",
              "Ready for milestone-specific data wiring",
              "Backend API boundary unchanged",
            ].map((item) => (
              <div
                key={item}
                className="rounded-[24px] border border-white/8 bg-[#222222] p-5 text-sm text-[#b8b8b8]"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
    </motion.div>
  );
}
