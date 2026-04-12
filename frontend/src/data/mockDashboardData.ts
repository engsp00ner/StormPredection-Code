import {
  Activity,
  AlertTriangle,
  Gauge,
  Siren,
  Thermometer,
  Tornado,
  Waves,
  Wind,
  CloudLightning,
  Clock3,
  RadioTower,
} from "lucide-react";

import type {
  AlertBannerData,
  ForecastPoint,
  HeroData,
  HighlightMetric,
  PredictionSummary,
  StationSnapshot,
  TrendPoint,
} from "../types/dashboard";

export const heroData: HeroData = {
  location: "Port Said, Egypt",
  unit: "hPa",
  dayLabel: "Saturday",
  dateLabel: "11 April 2026",
  stormProbability: 82,
  riskLabel: "High Risk",
  status: "Incoming Storm",
  expectation: "Expected within 3 hours",
};

export const alertBanner: AlertBannerData = {
  severity: "HIGH",
  title: "Storm surge conditions intensifying across the delta corridor",
  description:
    "Pressure is dropping faster than the safe threshold while coastal wind bands are strengthening over the next 180 minutes.",
  actionLabel: "View Details",
};

export const predictionSummary: PredictionSummary = {
  title: "Prediction Summary",
  confidence: "91% model confidence",
  summary:
    "Latest atmospheric fusion suggests a fast-moving pressure collapse with elevated humidity retention and unstable crosswind behavior near the coast.",
  tags: ["Pressure Drop", "Coastal Cells", "Rapid Escalation"],
};

export const highlightMetrics: HighlightMetric[] = [
  {
    id: "pressure",
    label: "Pressure Status",
    value: "1008 hPa",
    subtitle: "Falling 3 hPa in the last hour",
    icon: Gauge,
    accent: "cyan",
    featured: true,
  },
  {
    id: "temperature",
    label: "Temperature",
    value: "31.6 deg C",
    subtitle: "Feels like 34 deg C near harbor stations",
    icon: Thermometer,
    accent: "amber",
  },
  {
    id: "wind",
    label: "Wind Speed",
    value: "39 km/h",
    subtitle: "Gusts touching 58 km/h",
    icon: Wind,
    accent: "blue",
  },
  {
    id: "humidity",
    label: "Humidity",
    value: "84%",
    subtitle: "Dense moisture retention",
    icon: Waves,
    accent: "blue",
  },
  {
    id: "sensor-health",
    label: "Sensor Health",
    value: "98.2%",
    subtitle: "19 of 20 stations reporting live",
    icon: Activity,
    accent: "cyan",
  },
  {
    id: "last-alert",
    label: "Last Alert Time",
    value: "17 min ago",
    subtitle: "High-severity warning pushed to ops",
    icon: Clock3,
    accent: "red",
    featured: true,
  },
];

export const forecastPoints: ForecastPoint[] = [
  {
    id: "now",
    label: "Now",
    probability: 82,
    pressure: 1008,
    icon: CloudLightning,
    status: "Incoming",
  },
  {
    id: "plus-1",
    label: "+1h",
    probability: 86,
    pressure: 1007,
    icon: Tornado,
    status: "Peak band",
  },
  {
    id: "plus-2",
    label: "+2h",
    probability: 79,
    pressure: 1006,
    icon: CloudLightning,
    status: "Coastal cell",
  },
  {
    id: "plus-3",
    label: "+3h",
    probability: 73,
    pressure: 1009,
    icon: Siren,
    status: "Alert hold",
  },
  {
    id: "plus-4",
    label: "+4h",
    probability: 58,
    pressure: 1011,
    icon: CloudLightning,
    status: "Shifting east",
  },
  {
    id: "plus-5",
    label: "+5h",
    probability: 34,
    pressure: 1014,
    icon: RadioTower,
    status: "Cooling down",
  },
];

export const nearbyStations: StationSnapshot[] = [
  {
    id: "station-1",
    station: "El Gamil Bay",
    condition: "Pressure falling",
    value: "1007 hPa",
    icon: Gauge,
    accent: "cyan",
  },
  {
    id: "station-2",
    station: "Harbor East",
    condition: "High gust band",
    value: "41 km/h",
    icon: Wind,
    accent: "blue",
  },
  {
    id: "station-3",
    station: "Lake Manzala",
    condition: "Humidity spike",
    value: "86%",
    icon: Waves,
    accent: "amber",
  },
];

export const liveTrendData: TrendPoint[] = [
  { time: "06:00", pressure: 1015, temperature: 28, probability: 12 },
  { time: "07:00", pressure: 1014, temperature: 28.8, probability: 18 },
  { time: "08:00", pressure: 1013, temperature: 29.6, probability: 27 },
  { time: "09:00", pressure: 1012, temperature: 30.1, probability: 41 },
  { time: "10:00", pressure: 1011, temperature: 30.9, probability: 53 },
  { time: "11:00", pressure: 1010, temperature: 31.4, probability: 66 },
  { time: "12:00", pressure: 1009, temperature: 32.1, probability: 74 },
  { time: "13:00", pressure: 1008, temperature: 32.8, probability: 82 },
];

export const sidebarItems = [
  { id: "dashboard", icon: Activity, href: "/" },
  { id: "history", icon: RadioTower, href: "/history/" },
  { id: "timeline", icon: Clock3, href: "/alerts/" },
  { id: "alerts", icon: AlertTriangle, href: "/whatsapp/" },
  { id: "settings", icon: Gauge, href: "/settings/" },
];
