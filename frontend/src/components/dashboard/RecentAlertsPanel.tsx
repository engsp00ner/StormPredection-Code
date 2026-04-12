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

const statusClasses: Record<string, string> = {
  SENT: "text-emerald-200",
  PENDING: "text-amber-200",
  FAILED: "text-rose-200",
  SKIPPED: "text-slate-300",
  MANUAL_CHECK_NEEDED: "text-amber-100",
};

function formatTokenLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getAlertMessageParts(message: string) {
  const lines = message
    .replaceAll("\\n", "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    headline: lines[0] ?? "Alert triggered",
    details: lines.slice(1),
  };
}

export default function RecentAlertsPanel({ alerts }: RecentAlertsPanelProps) {
  return (
    <SectionCard
      title="Recent Alerts"
      subtitle="Showing 3 alerts at a time with scrollable history"
    >
      <div className="dashboard-scrollbar max-h-[38rem] space-y-3 overflow-y-auto pr-2">
        {alerts.length ? (
          alerts.map((alert) => {
            const message = getAlertMessageParts(alert.message);
            const whatsappStatusClass =
              statusClasses[alert.whatsappStatus] ?? "text-[#9a9a9a]";

            return (
              <div
                key={alert.id}
                className="rounded-[22px] border border-white/6 bg-[#272727] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold tracking-[0.04em] text-white">
                        {formatTokenLabel(alert.ruleType)}
                      </p>
                      <p className="text-sm font-medium text-[#f5e8c8]">
                        {message.headline}
                      </p>
                    </div>

                    {message.details.length ? (
                      <div className="space-y-2 rounded-2xl border border-white/6 bg-black/10 px-3 py-3">
                        {message.details.map((line, index) => (
                          <p
                            key={`${alert.id}-${index}-${line}`}
                            className="text-sm leading-6 text-[#d5d5d5]"
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.18em] ${severityClasses[alert.severity]}`}
                  >
                    {alert.severity}
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-[#8a8a8a]">
                  <span>{new Date(alert.createdAt).toLocaleString()}</span>
                  <span className={`font-medium ${whatsappStatusClass}`}>
                    {formatTokenLabel(alert.whatsappStatus)}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-[22px] border border-dashed border-white/8 bg-white/[0.03] p-6 text-sm text-[#8b8b8b]">
            No alerts yet. New triggered alerts will appear here in real time.
          </div>
        )}
      </div>
    </SectionCard>
  );
}
