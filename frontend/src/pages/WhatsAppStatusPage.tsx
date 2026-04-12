import { startTransition, useEffect, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  MessageCircleMore,
  ShieldAlert,
} from "lucide-react";

import PageShell from "../components/common/PageShell";
import SectionCard from "../components/common/SectionCard";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

interface WhatsAppStatusResponse {
  browser_ready: boolean;
  last_confirmed_at: string | null;
  confirmed_by: string;
  alerts_enabled: boolean;
  stale_warning: boolean;
  stale_threshold_hours: number;
  pending_send_count: number;
  failed_send_count_24h: number;
}

interface SendLogEntry {
  id: number;
  phone: string;
  message: string;
  status: "SUCCESS" | "FAILED" | "MANUAL_CHECK_NEEDED";
  error_message: string | null;
  attempted_at: string;
  is_test: boolean;
  alert_event_id: number | null;
  recipient_id: number | null;
}

interface SendLogResponse {
  count: number;
  logs: SendLogEntry[];
}

const statusTone = {
  ready: "border-emerald-400/20 bg-emerald-400/8 text-emerald-100",
  stale: "border-amber-400/20 bg-amber-400/8 text-amber-100",
  offline: "border-rose-400/20 bg-rose-500/8 text-rose-100",
};

const logBadgeTone = {
  SUCCESS: "bg-emerald-400/15 text-emerald-200",
  FAILED: "bg-rose-500/15 text-rose-200",
  MANUAL_CHECK_NEEDED: "bg-amber-400/15 text-amber-200",
};

function getStatusLabel(status: WhatsAppStatusResponse | null) {
  if (!status) {
    return "Loading";
  }
  if (status.browser_ready && status.stale_warning) {
    return "STALE - CONFIRM AGAIN";
  }
  if (status.browser_ready) {
    return "READY";
  }
  return "NOT READY";
}

export default function WhatsAppStatusPage() {
  const [status, setStatus] = useState<WhatsAppStatusResponse | null>(null);
  const [logs, setLogs] = useState<SendLogEntry[]>([]);
  const [confirmedBy, setConfirmedBy] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      const [statusResponse, logsResponse] = await Promise.all([
        fetch("/api/v1/whatsapp/status/"),
        fetch("/api/v1/whatsapp/send-log/?limit=10"),
      ]);

      if (!statusResponse.ok || !logsResponse.ok || cancelled) {
        return;
      }

      const statusPayload =
        (await statusResponse.json()) as WhatsAppStatusResponse;
      const logsPayload = (await logsResponse.json()) as SendLogResponse;

      if (cancelled) {
        return;
      }

      startTransition(() => {
        setStatus(statusPayload);
        setLogs(logsPayload.logs);
        if (statusPayload.confirmed_by) {
          setConfirmedBy(statusPayload.confirmed_by);
        }
      });
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, []);

  async function updateReadyState(ready: boolean) {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/v1/whatsapp/status/set-ready/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ready,
          confirmed_by: ready ? confirmedBy.trim() : "",
        }),
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as Pick<
        WhatsAppStatusResponse,
        "browser_ready" | "last_confirmed_at" | "confirmed_by"
      >;

      startTransition(() => {
        setStatus((current) =>
          current
            ? {
                ...current,
                ...payload,
                stale_warning: false,
              }
            : {
                browser_ready: payload.browser_ready,
                last_confirmed_at: payload.last_confirmed_at,
                confirmed_by: payload.confirmed_by,
                alerts_enabled: true,
                stale_warning: false,
                stale_threshold_hours: 4,
                pending_send_count: 0,
                failed_send_count_24h: 0,
              },
        );
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const tone = !status
    ? statusTone.offline
    : status.browser_ready && status.stale_warning
      ? statusTone.stale
      : status.browser_ready
        ? statusTone.ready
        : statusTone.offline;

  return (
    <PageShell>
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard className={cn("border", tone)}>
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[#8b8b8b]">
                  Messaging Runtime
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">
                  WhatsApp Status
                </h2>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-sky-300">
                <MessageCircleMore className="h-7 w-7" />
              </div>
            </div>

            <div className="rounded-[24px] border border-white/8 bg-black/20 p-5">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "h-3 w-3 rounded-full",
                    status?.browser_ready
                      ? status.stale_warning
                        ? "bg-amber-300"
                        : "bg-emerald-300"
                      : "bg-rose-400",
                  )}
                />
                <p className="text-sm font-semibold tracking-[0.18em] text-white">
                  {getStatusLabel(status)}
                </p>
              </div>
              <p className="mt-4 text-sm text-[#b9b9b9]">
                {status?.last_confirmed_at
                  ? `Since ${new Date(status.last_confirmed_at).toLocaleString()}`
                  : "Never confirmed"}
              </p>
              <p className="mt-2 text-sm text-[#8d8d8d]">
                Confirmed by: {status?.confirmed_by || "No operator recorded"}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-white/8 bg-[#252525] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#7f7f7f]">
                  Alerts Enabled
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {status?.alerts_enabled ? "Enabled" : "Disabled"}
                </p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-[#252525] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#7f7f7f]">
                  Failed Last 24h
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {status?.failed_send_count_24h ?? 0}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-sm text-[#b9b9b9]">
                Confirmed by
              </label>
              <input
                value={confirmedBy}
                onChange={(event) => setConfirmedBy(event.target.value)}
                className="w-full rounded-[18px] border border-white/8 bg-[#1a1a1a] px-4 py-3 text-white outline-none transition focus:border-sky-300/30"
                placeholder="Operator name"
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => void updateReadyState(true)}
                  disabled={isSubmitting || !confirmedBy.trim()}>
                  Mark as Ready
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void updateReadyState(false)}
                  disabled={isSubmitting}>
                  Mark Not Ready
                </Button>
              </div>
            </div>
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard
            title="Setup Instructions"
            subtitle="Follow these steps on the same machine running Django and Chrome.">
            <div className="space-y-3 text-sm leading-7 text-[#b9b9b9]">
              {[
                "Open Chrome on this machine.",
                "Go to web.whatsapp.com.",
                "Scan the QR code with your phone.",
                "Keep the WhatsApp Web tab open.",
                "Click Mark as Ready below.",
              ].map((step, index) => (
                <div
                  key={step}
                  className="flex items-start gap-3 rounded-[20px] border border-white/8 bg-[#242424] p-4">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/8 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Operational Caveats"
            subtitle="Always visible because this integration depends on a local desktop browser."
            className="border border-amber-400/15 bg-[linear-gradient(145deg,rgba(64,46,18,0.55),rgba(30,24,14,0.92))]">
            <div className="space-y-3 text-sm leading-7 text-[#f3d9a8]">
              <p className="flex items-start gap-3">
                <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-amber-300" />
                pywhatkit requires Chrome to stay open with an active WhatsApp
                Web session on this machine.
              </p>
              <p className="flex items-start gap-3">
                <ShieldAlert className="mt-1 h-4 w-4 shrink-0 text-amber-300" />
                Sending stops if Chrome closes, the session expires, or the
                screen is locked.
              </p>
              <p className="flex items-start gap-3">
                <Clock3 className="mt-1 h-4 w-4 shrink-0 text-amber-300" />
                Sends are sequential, so multiple recipients take roughly 25
                seconds each between attempts.
              </p>
            </div>
          </SectionCard>
        </div>
      </section>

      <section className="mt-6">
        <SectionCard
          title="Recent Send Log"
          subtitle="Last 10 WhatsApp send attempts from the backend runtime">
          <div className="space-y-3">
            {logs.length ? (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="grid gap-3 rounded-[22px] border border-white/8 bg-[#232323] p-4 lg:grid-cols-[0.8fr_0.8fr_1.5fr_0.5fr]">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-[#737373]">
                      Time
                    </p>
                    <p className="mt-2 text-sm text-white">
                      {new Date(log.attempted_at).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-[#737373]">
                      Phone
                    </p>
                    <p className="mt-2 text-sm text-white">{log.phone}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-[#737373]">
                      Message
                    </p>
                    <p className="mt-2 text-sm text-[#b9b9b9]">
                      {log.message.length > 50
                        ? `${log.message.slice(0, 50)}...`
                        : log.message}
                    </p>
                  </div>
                  <div className="flex items-start justify-end">
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.18em]",
                        logBadgeTone[log.status],
                      )}>
                      {log.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-white/8 bg-white/[0.03] p-6 text-sm text-[#8b8b8b]">
                No send attempts recorded yet.
              </div>
            )}
          </div>
        </SectionCard>
      </section>
    </PageShell>
  );
}
