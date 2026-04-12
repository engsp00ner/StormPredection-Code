import { startTransition, useEffect, useMemo, useState } from "react";
import { Save, SlidersHorizontal } from "lucide-react";

import PageShell from "../components/common/PageShell";
import SectionCard from "../components/common/SectionCard";
import { Button } from "../components/ui/button";

interface SettingItem {
  key: string;
  value: string;
  value_type: "str" | "int" | "float" | "bool";
  description: string;
  updated_at: string;
}

interface SettingsResponse {
  settings: SettingItem[];
}

const fieldOrder = [
  "storm_probability_threshold",
  "pressure_high_threshold",
  "pressure_low_threshold",
  "temperature_high_threshold",
  "temperature_low_threshold",
  "alert_cooldown_minutes",
  "whatsapp_alerts_enabled",
  "dashboard_history_hours",
  "model_buffer_size",
] as const;

function formatLabel(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      const response = await fetch("/api/v1/settings/");
      if (!response.ok || cancelled) {
        return;
      }

      const payload = (await response.json()) as SettingsResponse;
      if (cancelled) {
        return;
      }

      startTransition(() => {
        setSettings(payload.settings);
        setDrafts(
          Object.fromEntries(payload.settings.map((setting) => [setting.key, setting.value])),
        );
      });
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const orderedSettings = useMemo(() => {
    const order = new Map<string, number>(
      fieldOrder.map((key, index) => [key, index]),
    );
    return [...settings].sort(
      (left, right) =>
        (order.get(left.key) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.key) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [settings]);

  async function saveAll() {
    setIsSaving(true);
    setErrors({});
    setFeedback("");

    const changed = orderedSettings.filter(
      (setting) => drafts[setting.key] !== setting.value,
    );

    for (const setting of changed) {
      const response = await fetch(`/api/v1/settings/${setting.key}/`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value: drafts[setting.key] }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        setErrors((current) => ({
          ...current,
          [setting.key]: payload.detail ?? "Unable to save this field.",
        }));
        setIsSaving(false);
        return;
      }

      const updated = (await response.json()) as SettingItem;
      setSettings((current) =>
        current.map((item) => (item.key === updated.key ? updated : item)),
      );
    }

    setFeedback("Settings saved. New thresholds apply to next reading.");
    setIsSaving(false);
  }

  return (
    <PageShell>
      <section className="space-y-6">
        <SectionCard
          title="System Settings"
          subtitle="Thresholds, operational toggles, and local runtime configuration."
          action={
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-sky-300">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
          }
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {orderedSettings.map((setting) => {
              const isBool = setting.value_type === "bool";
              const currentValue = drafts[setting.key] ?? setting.value;

              return (
                <div
                  key={setting.key}
                  className="rounded-[22px] border border-white/8 bg-[#232323] p-5"
                >
                  <p className="text-xs uppercase tracking-[0.16em] text-[#767676]">
                    {formatLabel(setting.key)}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#a3a3a3]">
                    {setting.description}
                  </p>

                  {isBool ? (
                    <div className="mt-5 flex gap-3">
                      <Button
                        variant={currentValue === "true" ? "default" : "secondary"}
                        size="sm"
                        onClick={() =>
                          setDrafts((current) => ({
                            ...current,
                            [setting.key]: "true",
                          }))
                        }
                      >
                        Enabled
                      </Button>
                      <Button
                        variant={currentValue === "false" ? "default" : "secondary"}
                        size="sm"
                        onClick={() =>
                          setDrafts((current) => ({
                            ...current,
                            [setting.key]: "false",
                          }))
                        }
                      >
                        Disabled
                      </Button>
                    </div>
                  ) : (
                    <input
                      value={currentValue}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [setting.key]: event.target.value,
                        }))
                      }
                      className="mt-5 w-full rounded-[18px] border border-white/8 bg-[#181818] px-4 py-3 text-white outline-none transition focus:border-sky-300/30"
                    />
                  )}

                  {errors[setting.key] ? (
                    <p className="mt-3 text-sm text-rose-300">{errors[setting.key]}</p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={() => void saveAll()} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" />
              Save All
            </Button>
            {feedback ? <p className="text-sm text-sky-200">{feedback}</p> : null}
          </div>
        </SectionCard>
      </section>
    </PageShell>
  );
}
