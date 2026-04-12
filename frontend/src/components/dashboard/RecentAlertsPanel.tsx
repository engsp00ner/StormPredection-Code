import SectionCard from "../common/SectionCard";
import type { RecentAlert } from "../../types/dashboard";

interface RecentAlertsPanelProps {
  alerts: RecentAlert[];
}

const severityClasses = {
  LOW: "bg-emerald-400/15 text-emerald-200",
  MEDIUM: "bg-amber-400/15 text-amber-200",
  HIGH: "bg-rose-400/15 text-rose-200",
  CRITICAL: "bg-red-500/20 text-red-100",
};

export default function RecentAlertsPanel({ alerts }: RecentAlertsPanelProps) {
  return (
    <SectionCard
      title="Recent Alerts"
      subtitle="Last 5 alert events from the backend"
    >
      <div className="space-y-3">
        {alerts.length ? (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className="rounded-[22px] border border-white/6 bg-[#272727] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {alert.ruleType}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[#a0a0a0]">
                    {alert.message}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.18em] ${severityClasses[alert.severity]}`}
                >
                  {alert.severity}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-[#7f7f7f]">
                <span>{new Date(alert.createdAt).toLocaleString()}</span>
                <span>{alert.whatsappStatus}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[22px] border border-dashed border-white/8 bg-white/[0.03] p-6 text-sm text-[#8b8b8b]">
            No alerts yet. New triggered alerts will appear here in real time.
          </div>
        )}
      </div>
    </SectionCard>
  );
}
