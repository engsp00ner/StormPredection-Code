import type { LucideIcon } from "lucide-react";

export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface HeroData {
  location: string;
  unit: string;
  dayLabel: string;
  dateLabel: string;
  stormProbability: number;
  riskLabel: string;
  status: string;
  expectation: string;
}

export interface HighlightMetric {
  id: string;
  label: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  accent: "blue" | "amber" | "red" | "cyan";
  featured?: boolean;
}

export interface ForecastPoint {
  id: string;
  label: string;
  probability: number;
  pressure: number;
  icon: LucideIcon;
  status: string;
}

export interface StationSnapshot {
  id: string;
  station: string;
  condition: string;
  value: string;
  icon: LucideIcon;
  accent: "blue" | "amber" | "red" | "cyan";
}

export interface TrendPoint {
  time: string;
  pressure: number;
  temperature: number;
  probability: number;
}

export interface AlertBannerData {
  severity: AlertSeverity;
  title: string;
  description: string;
  actionLabel: string;
}

export interface PredictionSummary {
  title: string;
  confidence: string;
  summary: string;
  tags: string[];
}

export interface RecentAlert {
  id: number;
  ruleType: string;
  severity: AlertSeverity;
  whatsappStatus: string;
  createdAt: string;
  message: string;
}
