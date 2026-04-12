import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TrendPoint } from "../../types/dashboard";

interface LiveChartsPanelProps {
  data: TrendPoint[];
}

interface TrendAreaCardProps {
  data: TrendPoint[];
  dataKey: "pressure" | "temperature" | "probability";
  title: string;
  subtitle: string;
  unit: string;
  stroke: string;
  fillId: string;
  badgeLabel: string;
  latestValue: number | undefined;
  domain: number[];
  noteColor: string;
  titleColor: string;
  subtitleColor: string;
  badgeClassName: string;
  axisLabel: string;
  tooltipDigits?: number;
  yTickDigits?: number;
}

function getZoomedDomain(values: number[], minimumSpan: number, padding: number) {
  const safeValues = values.filter((value) => Number.isFinite(value));

  if (!safeValues.length) {
    return [0, minimumSpan];
  }

  const rawMin = Math.min(...safeValues);
  const rawMax = Math.max(...safeValues);
  const span = Math.max(rawMax - rawMin, minimumSpan);
  const midPoint = (rawMin + rawMax) / 2;
  const halfSpan = span / 2 + padding;

  return [
    Number((midPoint - halfSpan).toFixed(1)),
    Number((midPoint + halfSpan).toFixed(1)),
  ];
}

function getProbabilityDomain(values: number[]) {
  const safeValues = values.filter((value) => Number.isFinite(value));
  const maxValue = safeValues.length ? Math.max(...safeValues) : 0;
  const roundedCeiling = Math.ceil((maxValue + 5) / 5) * 5;

  return [0, Math.max(20, roundedCeiling)];
}

function formatMetric(value: number | undefined, digits = 1) {
  if (value === undefined || !Number.isFinite(value)) {
    return "--";
  }

  return value.toFixed(digits);
}

function formatTooltipNumber(value: unknown, digits = 1) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "--";
}

function getTimeCaption(data: TrendPoint[]) {
  if (!data.length) {
    return "Waiting for live sensor updates";
  }

  return `${data.length} recent updates with auto-zoomed axes`;
}

function TrendAreaCard({
  data,
  dataKey,
  title,
  subtitle,
  unit,
  stroke,
  fillId,
  badgeLabel,
  latestValue,
  domain,
  noteColor,
  titleColor,
  subtitleColor,
  badgeClassName,
  axisLabel,
  tooltipDigits = 1,
  yTickDigits = 1,
}: TrendAreaCardProps) {
  return (
    <div className="glass-ring panel-grid overflow-hidden rounded-[30px] border border-white/8 bg-[#1d1d1d]/95 p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className={`text-[1.05rem] font-semibold ${titleColor}`}>{title}</p>
          <p className={`mt-1 text-sm ${subtitleColor}`}>{subtitle}</p>
        </div>

        <div className={badgeClassName}>
          {badgeLabel} {formatMetric(latestValue)} {unit}
        </div>
      </div>

      <div className={`mb-4 flex flex-wrap gap-3 text-xs ${noteColor}`}>
        <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1">
          Axis: {domain[0].toFixed(1)} to {domain[1].toFixed(1)} {axisLabel}
        </span>
        <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1">
          Auto-zoom highlights subtle live movement
        </span>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.32} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0.03} />
              </linearGradient>
            </defs>

            <CartesianGrid
              vertical={false}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="3 5"
            />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.18)" }}
              minTickGap={28}
              tick={{ fill: "#a7bddf", fontSize: 12 }}
            />
            <YAxis
              domain={domain}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.18)" }}
              width={48}
              tick={{ fill: "#a7bddf", fontSize: 12 }}
              tickFormatter={(value: number) => value.toFixed(yTickDigits)}
            />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.16)", strokeWidth: 1 }}
              contentStyle={{
                background: "#13151c",
                borderRadius: "18px",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#fff",
                boxShadow: "0 16px 45px rgba(0,0,0,0.35)",
              }}
              labelStyle={{ color: "#e2e8f0", fontWeight: 700 }}
              formatter={(value) => [`${formatTooltipNumber(value, tooltipDigits)} ${unit}`, title]}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={stroke}
              strokeWidth={3}
              fill={`url(#${fillId})`}
              dot={false}
              activeDot={{
                r: 5,
                fill: stroke,
                stroke: "#111827",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function LiveChartsPanel({ data }: LiveChartsPanelProps) {
  const pressureValues = data.map((point) => point.pressure);
  const temperatureValues = data.map((point) => point.temperature);
  const probabilityValues = data.map((point) => point.probability);

  const pressureDomain = getZoomedDomain(pressureValues, 1.6, 0.4);
  const temperatureDomain = getZoomedDomain(temperatureValues, 0.8, 0.3);
  const probabilityDomain = getProbabilityDomain(probabilityValues);

  const latestPressure = pressureValues.at(-1);
  const latestTemperature = temperatureValues.at(-1);
  const latestProbability = probabilityValues.at(-1);

  return (
    <section className="grid gap-6 xl:grid-cols-3">
        <TrendAreaCard
          data={data}
          dataKey="pressure"
          title="Pressure Trend"
          subtitle={getTimeCaption(data)}
          unit="hPa"
          stroke="#3b82f6"
          fillId="pressure-fill"
          badgeLabel="Live"
          latestValue={latestPressure}
          domain={pressureDomain}
          noteColor="text-[#7e94bf]"
          titleColor="text-[#d7e9ff]"
          subtitleColor="text-[#88a4d8]"
          badgeClassName="rounded-full border border-sky-400/15 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-sky-200"
          axisLabel="hPa"
        />

        <TrendAreaCard
          data={data}
          dataKey="temperature"
          title="Temperature Trend"
          subtitle="Thermal movement with the same zoomed live scale"
          unit="deg C"
          stroke="#f59e0b"
          fillId="temperature-fill"
          badgeLabel="Live"
          latestValue={latestTemperature}
          domain={temperatureDomain}
          noteColor="text-[#d9b36c]"
          titleColor="text-[#fde7b1]"
          subtitleColor="text-[#dcb97e]"
          badgeClassName="rounded-full border border-amber-400/15 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-amber-100"
          axisLabel="deg C"
        />

        <TrendAreaCard
          data={data}
          dataKey="probability"
          title="Storm Probability"
          subtitle="Live model output with the same zoomed graph style"
          unit="%"
          stroke="#22d3ee"
          fillId="probability-fill"
          badgeLabel="Live"
          latestValue={latestProbability}
          domain={probabilityDomain}
          noteColor="text-[#7cc5d5]"
          titleColor="text-[#c8f8ff]"
          subtitleColor="text-[#77b8c7]"
          badgeClassName="rounded-full border border-cyan-400/15 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-cyan-100"
          axisLabel="%"
          tooltipDigits={0}
          yTickDigits={0}
        />
    </section>
  );
}
