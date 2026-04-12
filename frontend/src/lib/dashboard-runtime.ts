import {
  Activity,
  Gauge,
  RadioTower,
  Siren,
  Thermometer,
} from "lucide-react";

import type {
  AlertBannerData,
  HeroData,
  HighlightMetric,
  PredictionSummary,
  RecentAlert,
  StationSnapshot,
  TrendPoint,
} from "../types/dashboard";

export interface ApiReading {
  id: number;
  timestamp: string;
  pressure_hPa: number;
  temperature_C: number;
  received_at: string;
  source: string;
}

export interface ApiPrediction {
  id: number;
  reading_id: number;
  storm_probability: number;
  prediction: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  decision_threshold: number;
  created_at: string;
}

export interface ApiLatestPrediction {
  id: number | null;
  reading_id?: number;
  storm_probability: number | null;
  prediction?: number | null;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | null;
  decision_threshold?: number;
  created_at?: string;
  status?: string;
}

export interface ApiAlert {
  id: number;
  rule_type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  triggered_value: number;
  threshold_value: number;
  message: string;
  whatsapp_status: string;
  created_at: string;
  sent_at: string | null;
}

export interface DashboardRuntimeData {
  hero: HeroData;
  highlights: HighlightMetric[];
  summary: PredictionSummary;
  stations: StationSnapshot[];
  trends: TrendPoint[];
  banner: AlertBannerData;
  recentAlerts: RecentAlert[];
}

function getRiskLabel(level: string | null | undefined) {
  if (!level) {
    return "Buffering";
  }
  if (level === "HIGH") {
    return "High Risk";
  }
  if (level === "MEDIUM") {
    return "Moderate Risk";
  }
  return "Low Risk";
}

function getExpectation(probability: number | null) {
  if (probability === null) {
    return "Waiting for enough readings";
  }
  if (probability >= 0.8) {
    return "Expected within 3 hours";
  }
  if (probability >= 0.6) {
    return "Conditions strengthening in 6 hours";
  }
  return "No immediate storm trigger";
}

function getStatus(latestPrediction: ApiLatestPrediction) {
  if (latestPrediction.status === "model_unavailable") {
    return "Model Unavailable";
  }
  if (latestPrediction.status === "no_predictions" || latestPrediction.storm_probability === null) {
    return "Buffering Sensors";
  }
  if ((latestPrediction.storm_probability ?? 0) >= 0.8) {
    return "Incoming Storm";
  }
  if ((latestPrediction.storm_probability ?? 0) >= 0.6) {
    return "Storm Watch";
  }
  return "Atmosphere Stable";
}

export function buildDashboardRuntimeData(
  readings: ApiReading[],
  predictions: ApiPrediction[],
  latestPrediction: ApiLatestPrediction,
  alerts: ApiAlert[],
): DashboardRuntimeData {
  const orderedReadings = [...readings].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const latestReading = orderedReadings.at(-1) ?? null;
  const previousReading = orderedReadings.at(-2) ?? latestReading;
  const probabilityMap = new Map(predictions.map((prediction) => [prediction.reading_id, prediction]));
  const now = latestReading ? new Date(latestReading.timestamp) : new Date();

  const hero: HeroData = {
    location: "Port Said, Egypt",
    unit: "hPa",
    dayLabel: now.toLocaleDateString(undefined, { weekday: "long" }),
    dateLabel: now.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    stormProbability: Math.round((latestPrediction.storm_probability ?? 0) * 100),
    riskLabel: getRiskLabel(latestPrediction.risk_level),
    status: getStatus(latestPrediction),
    expectation: getExpectation(latestPrediction.storm_probability),
  };

  const pressureDelta =
    latestReading && previousReading
      ? latestReading.pressure_hPa - previousReading.pressure_hPa
      : 0;

  const highlights: HighlightMetric[] = [
    {
      id: "pressure",
      label: "Pressure Status",
      value: latestReading ? `${latestReading.pressure_hPa.toFixed(1)} hPa` : "--",
      subtitle: `${pressureDelta >= 0 ? "Rising" : "Falling"} ${Math.abs(pressureDelta).toFixed(1)} hPa since last reading`,
      icon: Gauge,
      accent: "cyan",
      featured: true,
    },
    {
      id: "temperature",
      label: "Temperature",
      value: latestReading ? `${latestReading.temperature_C.toFixed(1)} deg C` : "--",
      subtitle: latestReading ? `Latest source: ${latestReading.source}` : "No sensor data yet",
      icon: Thermometer,
      accent: "amber",
    },
    {
      id: "sensor-health",
      label: "Sensor Health",
      value: orderedReadings.length ? "100%" : "0%",
      subtitle: `${orderedReadings.length} readings captured in history window`,
      icon: Activity,
      accent: "cyan",
    },
    {
      id: "last-alert",
      label: "Last Alert Time",
      value: alerts[0]
        ? new Date(alerts[0].created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "No alerts",
      subtitle: alerts[0] ? alerts[0].rule_type : "No alert activity in the last 24 hours",
      icon: Siren,
      accent: alerts[0] ? "red" : "cyan",
      featured: true,
    },
  ];

  const summary: PredictionSummary = {
    title: "Prediction Summary",
    confidence: latestPrediction.storm_probability !== null
      ? `${Math.round((latestPrediction.storm_probability ?? 0) * 100)}% live probability`
      : "Waiting for model output",
    summary: latestPrediction.storm_probability !== null
      ? `Latest pressure sits near ${latestReading?.pressure_hPa.toFixed(1) ?? "--"} hPa with storm risk classified as ${latestPrediction.risk_level ?? "UNKNOWN"}. The dashboard is now reading live backend data and will continue updating over websocket pushes.`
      : "The backend is connected, but the model needs four readings before it begins producing storm probabilities.",
    tags: [
      latestPrediction.risk_level ?? "BUFFERING",
      alerts[0]?.rule_type ?? "NO_ALERTS",
      latestReading?.source?.toUpperCase() ?? "NO_DATA",
    ],
  };

  const stations: StationSnapshot[] = orderedReadings
    .slice(-12)
    .reverse()
    .map((reading, index) => ({
      id: `snapshot-${reading.id}`,
      station: `Sensor Snapshot ${index + 1}`,
      condition: new Date(reading.timestamp).toLocaleString(),
      value: `${reading.pressure_hPa.toFixed(1)} hPa / ${reading.temperature_C.toFixed(1)} deg C`,
      icon: index === 0 ? Gauge : index === 1 ? Thermometer : RadioTower,
      accent: index === 0 ? "cyan" : index === 1 ? "amber" : "blue",
    }));

  const trends: TrendPoint[] = orderedReadings.slice(-8).map((reading) => ({
    time: new Date(reading.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    pressure: Number(reading.pressure_hPa.toFixed(1)),
    temperature: Number(reading.temperature_C.toFixed(1)),
    probability: Math.round((probabilityMap.get(reading.id)?.storm_probability ?? 0) * 100),
  }));

  const banner: AlertBannerData = alerts[0]
    ? {
        severity: alerts[0].severity,
        title: `${alerts[0].rule_type.replaceAll("_", " ")} triggered`,
        description: alerts[0].message,
        actionLabel: "Live Feed",
      }
    : {
        severity: latestPrediction.storm_probability !== null && latestPrediction.storm_probability >= 0.6 ? "MEDIUM" : "LOW",
        title: latestPrediction.storm_probability !== null
          ? "No active alert event, monitoring live conditions"
          : "Model is buffering fresh sensor history",
        description: latestPrediction.storm_probability !== null
          ? "REST and websocket connections are live. The banner will elevate automatically when the alert engine triggers a new event."
          : "As soon as the fourth sensor reading arrives, the backend will start producing storm probability outputs.",
        actionLabel: "Monitoring",
      };

  const recentAlerts: RecentAlert[] = alerts.slice(0, 12).map((alert) => ({
    id: alert.id,
    ruleType: alert.rule_type,
    severity: alert.severity,
    whatsappStatus: alert.whatsapp_status,
    createdAt: alert.created_at,
    message: alert.message,
  }));

  return {
    hero,
    highlights,
    summary,
    stations,
    trends,
    banner,
    recentAlerts,
  };
}
