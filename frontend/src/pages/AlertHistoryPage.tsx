import { startTransition, useEffect, useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

import PageShell from "../components/common/PageShell";
import SectionCard from "../components/common/SectionCard";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

interface AlertItem {
  id: number;
  rule_type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  triggered_value: number;
  threshold_value: number;
  message: string;
  whatsapp_status: "PENDING" | "SENT" | "FAILED" | "SKIPPED" | "MANUAL_CHECK_NEEDED";
  created_at: string;
  sent_at: string | null;
}

interface AlertsResponse {
  count: number;
  alerts: AlertItem[];
}

const severityTone = {
  LOW: "bg-emerald-400/15 text-emerald-200",
  MEDIUM: "bg-amber-400/15 text-amber-200",
  HIGH: "bg-rose-400/15 text-rose-200",
  CRITICAL: "bg-red-500/20 text-red-100",
};

const whatsappTone = {
  PENDING: "bg-white/8 text-[#d0d0d0]",
  SENT: "bg-emerald-400/15 text-emerald-200",
  FAILED: "bg-rose-500/15 text-rose-200",
  SKIPPED: "bg-[#3a3a3a] text-[#b9b9b9]",
  MANUAL_CHECK_NEEDED: "bg-amber-400/15 text-amber-200",
};

const defaultFilters = {
  hours: "24",
  ruleType: "",
};

export default function AlertHistoryPage() {
  const [filters, setFilters] = useState(defaultFilters);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");

  async function loadAlerts(nextFilters = filters) {
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set("hours", nextFilters.hours);
    params.set("limit", "100");
    if (nextFilters.ruleType) {
      params.set("rule_type", nextFilters.ruleType);
    }

    const response = await fetch(`/api/v1/alerts/?${params.toString()}`);
    if (!response.ok) {
      setIsLoading(false);
      return;
    }

    const payload = (await response.json()) as AlertsResponse;
    startTransition(() => {
      setAlerts(payload.alerts);
      setIsLoading(false);
    });
  }

  useEffect(() => {
    void loadAlerts(defaultFilters);
  }, []);

  async function retryAlert(alertId: number) {
    setRetryingId(alertId);
    setFeedback("");
    const response = await fetch(`/api/v1/alerts/${alertId}/retry/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    if (response.ok) {
      const payload = (await response.json()) as {
        recipients_attempted: number;
      };
      setFeedback(`Retry sent to ${payload.recipients_attempted} recipients.`);
      await loadAlerts();
    }
    setRetryingId(null);
  }

  return (
    <PageShell>
      <section className="space-y-6">
        <SectionCard
          title="Alert History"
          subtitle="Review triggered events, filter the timeline, and retry WhatsApp sends when operator action is needed."
          action={
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-sky-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
          }
        >
          <div className="grid gap-4 lg:grid-cols-[0.45fr_0.45fr_auto]">
            <select
              value={filters.ruleType}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  ruleType: event.target.value,
                }))
              }
              className="rounded-[18px] border border-white/8 bg-[#1b1b1b] px-4 py-3 text-white outline-none"
            >
              <option value="">All rules</option>
              <option value="STORM_PROBABILITY">Storm Probability</option>
              <option value="PRESSURE_HIGH">Pressure High</option>
              <option value="PRESSURE_LOW">Pressure Low</option>
              <option value="TEMPERATURE_HIGH">Temperature High</option>
              <option value="TEMPERATURE_LOW">Temperature Low</option>
            </select>

            <select
              value={filters.hours}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  hours: event.target.value,
                }))
              }
              className="rounded-[18px] border border-white/8 bg-[#1b1b1b] px-4 py-3 text-white outline-none"
            >
              <option value="24">Last 24 hours</option>
              <option value="48">Last 48 hours</option>
              <option value="72">Last 72 hours</option>
            </select>

            <Button onClick={() => void loadAlerts(filters)}>Apply Filters</Button>
          </div>

          {feedback ? <p className="mt-4 text-sm text-sky-200">{feedback}</p> : null}
        </SectionCard>

        <SectionCard
          title="Alert Events"
          subtitle="All alert events in the selected time window"
        >
          <div className="space-y-3">
            {isLoading ? (
              <div className="rounded-[22px] border border-dashed border-white/8 bg-white/[0.03] p-6 text-sm text-[#8b8b8b]">
                Loading alerts...
              </div>
            ) : alerts.length ? (
              alerts.map((alert) => {
                const canRetry =
                  alert.whatsapp_status === "FAILED" ||
                  alert.whatsapp_status === "MANUAL_CHECK_NEEDED";

                return (
                  <div
                    key={alert.id}
                    className="grid gap-4 rounded-[22px] border border-white/8 bg-[#232323] p-4 xl:grid-cols-[0.7fr_1.2fr_0.45fr_0.5fr_0.35fr]"
                  >
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-[#727272]">
                        Rule
                      </p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {alert.rule_type}
                      </p>
                      <p className="mt-1 text-xs text-[#8c8c8c]">
                        {new Date(alert.created_at).toLocaleString()}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-[#727272]">
                        Message
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#b9b9b9]">
                        {alert.message}
                      </p>
                      <p className="mt-2 text-xs text-[#7f7f7f]">
                        Triggered: {alert.triggered_value.toFixed(2)} | Threshold:{" "}
                        {alert.threshold_value.toFixed(2)}
                      </p>
                    </div>

                    <div className="flex items-start xl:justify-center">
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.18em]",
                          severityTone[alert.severity],
                        )}
                      >
                        {alert.severity}
                      </span>
                    </div>

                    <div className="flex items-start xl:justify-center">
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.12em]",
                          whatsappTone[alert.whatsapp_status],
                        )}
                      >
                        {alert.whatsapp_status}
                      </span>
                    </div>

                    <div className="flex items-start xl:justify-center">
                      {canRetry ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void retryAlert(alert.id)}
                          disabled={retryingId === alert.id}
                        >
                          <RotateCw
                            className={cn(
                              "h-4 w-4",
                              retryingId === alert.id && "animate-spin",
                            )}
                          />
                        </Button>
                      ) : (
                        <span className="text-xs text-[#6f6f6f]">No retry</span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-[22px] border border-dashed border-white/8 bg-white/[0.03] p-6 text-sm text-[#8b8b8b]">
                No alerts match the current filters.
              </div>
            )}
          </div>
        </SectionCard>
      </section>
    </PageShell>
  );
}
