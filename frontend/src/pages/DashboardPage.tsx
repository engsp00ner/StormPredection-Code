import { startTransition, useDeferredValue, useEffect, useState } from "react";

import AlertBanner from "../components/dashboard/AlertBanner";
import ForecastStrip from "../components/dashboard/ForecastStrip";
import HeroStormCard from "../components/dashboard/HeroStormCard";
import HighlightsGrid from "../components/dashboard/HighlightsGrid";
import LiveChartsPanel from "../components/dashboard/LiveChartsPanel";
import RecentAlertsPanel from "../components/dashboard/RecentAlertsPanel";
import RecentStationsCard from "../components/dashboard/RecentStationsCard";
import Sidebar from "../components/layout/Sidebar";
import Topbar from "../components/layout/Topbar";
import { buildDashboardRuntimeData, type ApiAlert, type ApiLatestPrediction, type ApiPrediction, type ApiReading } from "../lib/dashboard-runtime";

interface ReadingsResponse {
  count: number;
  readings: ApiReading[];
}

interface PredictionsResponse {
  count: number;
  predictions: ApiPrediction[];
}

interface AlertsResponse {
  count: number;
  alerts: ApiAlert[];
}

interface SensorUpdateMessage {
  type: "sensor.update";
  reading: {
    id: number;
    timestamp: string;
    pressure_hPa: number;
    temperature_C: number;
  };
  prediction: {
    storm_probability: number;
    prediction: number;
    risk_level: "LOW" | "MEDIUM" | "HIGH";
    decision_threshold: number;
  } | null;
  prediction_status: string;
  alerts: Array<{
    id: number;
    rule_type: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    message: string;
  }>;
}

const emptyLatestPrediction: ApiLatestPrediction = {
  id: null,
  storm_probability: null,
  risk_level: null,
  status: "no_predictions",
};

export default function DashboardPage() {
  const [readings, setReadings] = useState<ApiReading[]>([]);
  const [predictions, setPredictions] = useState<ApiPrediction[]>([]);
  const [latestPrediction, setLatestPrediction] =
    useState<ApiLatestPrediction>(emptyLatestPrediction);
  const [alerts, setAlerts] = useState<ApiAlert[]>([]);
  const [connectionState, setConnectionState] = useState<"connected" | "disconnected">(
    "disconnected",
  );

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardData() {
      const [readingsResponse, predictionsResponse, latestPredictionResponse, alertsResponse] =
        await Promise.all([
          fetch("/api/v1/readings/?hours=24&limit=500"),
          fetch("/api/v1/predictions/?hours=24&limit=500"),
          fetch("/api/v1/predictions/latest/"),
          fetch("/api/v1/alerts/?hours=24&limit=5"),
        ]);

      if (!readingsResponse.ok || !predictionsResponse.ok || !latestPredictionResponse.ok || !alertsResponse.ok) {
        return;
      }

      const readingsPayload = (await readingsResponse.json()) as ReadingsResponse;
      const predictionsPayload = (await predictionsResponse.json()) as PredictionsResponse;
      const latestPredictionPayload =
        (await latestPredictionResponse.json()) as ApiLatestPrediction;
      const alertsPayload = (await alertsResponse.json()) as AlertsResponse;

      if (cancelled) {
        return;
      }

      startTransition(() => {
        setReadings(readingsPayload.readings);
        setPredictions(predictionsPayload.predictions);
        setLatestPrediction(latestPredictionPayload);
        setAlerts(alertsPayload.alerts);
      });
    }

    void loadDashboardData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;

    function connect() {
      socket = new WebSocket(`${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/dashboard/`);

      socket.addEventListener("open", () => {
        setConnectionState("connected");
      });

      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data) as SensorUpdateMessage;
        const nextReading: ApiReading = {
          id: message.reading.id,
          timestamp: message.reading.timestamp,
          pressure_hPa: message.reading.pressure_hPa,
          temperature_C: message.reading.temperature_C,
          received_at: new Date().toISOString(),
          source: "sensor",
        };

        startTransition(() => {
          setReadings((current) => [...current, nextReading].slice(-500));
          if (message.prediction) {
            const nextPrediction: ApiPrediction = {
              id: Date.now(),
              reading_id: message.reading.id,
              storm_probability: message.prediction.storm_probability,
              prediction: message.prediction.prediction,
              risk_level: message.prediction.risk_level,
              decision_threshold: message.prediction.decision_threshold,
              created_at: new Date().toISOString(),
            };
            setPredictions((current) => [...current, nextPrediction].slice(-500));
            setLatestPrediction({
              ...nextPrediction,
              status: "ok",
            });
          } else if (message.prediction_status !== "ok") {
            setLatestPrediction((current) => ({
              ...current,
              status: message.prediction_status,
            }));
          }

          if (message.alerts.length) {
            setAlerts((current) => [
              ...message.alerts.map((alert) => ({
                id: alert.id,
                rule_type: alert.rule_type,
                severity: alert.severity,
                triggered_value: 0,
                threshold_value: 0,
                message: alert.message,
                whatsapp_status: "PENDING",
                created_at: new Date().toISOString(),
                sent_at: null,
              })),
              ...current,
            ].slice(0, 20));
          }
        });
      });

      socket.addEventListener("close", () => {
        setConnectionState("disconnected");
        reconnectTimer = window.setTimeout(connect, 3000);
      });

      socket.addEventListener("error", () => {
        socket?.close();
      });
    }

    connect();

    return () => {
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, []);

  const runtime = buildDashboardRuntimeData(
    readings,
    predictions,
    latestPrediction,
    alerts,
  );
  const deferredTrends = useDeferredValue(runtime.trends);

  return (
    <main className="min-h-screen p-4 text-white lg:p-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 lg:flex-row">
        <Sidebar />

        <div className="flex-1 space-y-6">
          <Topbar />
          <AlertBanner
            alert={{
              ...runtime.banner,
              actionLabel:
                connectionState === "connected" ? "Connected" : "Reconnecting",
            }}
          />

          <section className="grid gap-6 xl:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
            <div className="space-y-6">
              <HeroStormCard
                data={runtime.hero}
                windBand={
                  latestPrediction.storm_probability !== null
                    ? `NE ${Math.round(18 + latestPrediction.storm_probability * 34)} km/h`
                    : "Awaiting live data"
                }
                pressureDrop={
                  readings.length > 1
                    ? `${(readings.at(-1)!.pressure_hPa - readings.at(-2)!.pressure_hPa).toFixed(1)} hPa`
                    : "No delta yet"
                }
              />
              <LiveChartsPanel data={deferredTrends} />
              <RecentStationsCard stations={runtime.stations} />
            </div>

            <div className="space-y-6">
              <HighlightsGrid
                metrics={runtime.highlights}
                summary={runtime.summary}
              />
              <ForecastStrip forecast={runtime.forecast} />
              <RecentAlertsPanel alerts={runtime.recentAlerts} />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
