import { AlertTriangle } from "lucide-react";

import type { AlertBannerData } from "../../types/dashboard";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

const severityStyles = {
  LOW: "from-emerald-400/18 to-emerald-400/5 text-emerald-300",
  MEDIUM: "from-amber-300/18 to-orange-300/5 text-amber-200",
  HIGH: "from-amber-400/20 to-rose-400/8 text-amber-100",
  CRITICAL: "from-rose-500/24 to-red-500/8 text-rose-100",
};

interface AlertBannerProps {
  alert: AlertBannerData;
}

export default function AlertBanner({ alert }: AlertBannerProps) {
  return (
    <div
      className={cn(
        "glass-ring card-hover flex flex-col gap-4 rounded-[28px] border border-white/8 bg-gradient-to-r p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6",
        severityStyles[alert.severity],
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <div className="inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-semibold tracking-[0.24em]">
            {alert.severity}
          </div>
          <h2 className="mt-3 text-lg font-semibold text-white">{alert.title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-white/70">
            {alert.description}
          </p>
        </div>
      </div>

      <Button variant="danger" className="self-start sm:self-center">
        {alert.actionLabel}
      </Button>
    </div>
  );
}
