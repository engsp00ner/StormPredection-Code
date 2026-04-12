import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import SectionCard from "../common/SectionCard";
import type { TrendPoint } from "../../types/dashboard";

interface LiveChartsPanelProps {
  data: TrendPoint[];
}

const chartConfig = [
  {
    key: "pressure",
    label: "Pressure trend",
    unit: "hPa",
    stroke: "#22d3ee",
  },
  {
    key: "temperature",
    label: "Temperature trend",
    unit: "deg C",
    stroke: "#fbbf24",
  },
  {
    key: "probability",
    label: "Storm probability trend",
    unit: "%",
    stroke: "#f87171",
  },
] as const;

export default function LiveChartsPanel({ data }: LiveChartsPanelProps) {
  return (
    <SectionCard
      title="Live Sensor Trends"
      subtitle="Pressure, heat, and storm escalation in real time"
    >
      <div className="space-y-6">
        {chartConfig.map((chart) => (
          <div
            key={chart.key}
            className="rounded-[24px] border border-white/6 bg-[#272727] p-4"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-base font-semibold text-white">{chart.label}</p>
                <p className="text-sm text-[#8d8d8d]">Past 8 hourly readings</p>
              </div>
              <div
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{
                  color: chart.stroke,
                  backgroundColor: `${chart.stroke}20`,
                }}
              >
                Live
              </div>
            </div>

            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="time"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#7d7d7d", fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    tick={{ fill: "#7d7d7d", fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ stroke: "rgba(255,255,255,0.12)", strokeWidth: 1 }}
                    contentStyle={{
                      background: "#161616",
                      borderRadius: "18px",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "#fff",
                    }}
                    labelStyle={{ color: "#fff", fontWeight: 700 }}
                    formatter={(value) => [
                      `${value ?? "--"} ${chart.unit}`,
                      chart.label,
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey={chart.key}
                    stroke={chart.stroke}
                    strokeWidth={3}
                    dot={false}
                    activeDot={{
                      r: 5,
                      fill: chart.stroke,
                      stroke: "#111111",
                      strokeWidth: 2,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
