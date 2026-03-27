/**
 * CandleChart — Candlestick chart with 5-minute window markers
 * Design: Glassmorphic Night Sky — dark background, cyan/coral candles, gold window markers
 */

import { Candle, FiveMinWindow } from "@/hooks/useBitcoinData";
import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface CandleChartProps {
  candles: Candle[];
  currentWindow: FiveMinWindow | null;
  pastWindows: FiveMinWindow[];
}

// Custom candlestick bar shape
function CandleBar(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: { open: number; close: number; high: number; low: number; isBullish: boolean };
  chartHeight?: number;
  yScale?: (v: number) => number;
}) {
  const { x = 0, width = 0, payload } = props;
  if (!payload) return null;

  const { open, close, high, low, isBullish } = payload;
  const color = isBullish ? "#00d4ff" : "#ff4757";
  const shadowColor = isBullish ? "rgba(0,212,255,0.3)" : "rgba(255,71,87,0.3)";

  // We'll use the recharts coordinate system via the y/height from the bar
  // but we need to recalculate based on actual price values
  // This is a simplified approach using the provided y/height
  const { y = 0, height = 0 } = props;

  const bodyTop = isBullish ? y : y;
  const bodyHeight = Math.max(1, Math.abs(height));
  const centerX = x + width / 2;

  return (
    <g>
      {/* Glow effect */}
      <rect
        x={x - 1}
        y={bodyTop - 1}
        width={width + 2}
        height={bodyHeight + 2}
        fill={shadowColor}
        rx={1}
      />
      {/* Body */}
      <rect
        x={x}
        y={bodyTop}
        width={width}
        height={bodyHeight}
        fill={color}
        fillOpacity={0.85}
        rx={1}
      />
      {/* Wick line placeholder — drawn via high/low reference */}
      <line
        x1={centerX}
        y1={bodyTop - 2}
        x2={centerX}
        y2={bodyTop}
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.6}
      />
    </g>
  );
}

// Custom tooltip
function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: Candle }[] }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const isBullish = d.isBullish;
  const color = isBullish ? "#00d4ff" : "#ff4757";
  const time = new Date(d.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      style={{
        background: "rgba(5, 11, 26, 0.92)",
        border: `1px solid ${color}40`,
        borderRadius: "0.75rem",
        padding: "10px 14px",
        backdropFilter: "blur(16px)",
        boxShadow: `0 0 20px ${color}20`,
      }}
    >
      <div style={{ color: "#8899aa", fontSize: "11px", marginBottom: "6px", fontFamily: "JetBrains Mono, monospace" }}>
        {time}
      </div>
      {[
        ["O", d.open],
        ["H", d.high],
        ["L", d.low],
        ["C", d.close],
      ].map(([label, val]) => (
        <div key={label as string} style={{ display: "flex", justifyContent: "space-between", gap: "16px", fontSize: "12px", fontFamily: "JetBrains Mono, monospace" }}>
          <span style={{ color: "#8899aa" }}>{label}</span>
          <span style={{ color }}>${(val as number).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      ))}
      <div style={{ marginTop: "6px", fontSize: "11px", color: "#8899aa", fontFamily: "JetBrains Mono, monospace" }}>
        Vol: {d.volume.toFixed(2)}
      </div>
    </div>
  );
}

export default function CandleChart({ candles, currentWindow, pastWindows }: CandleChartProps) {
  const last30 = candles.slice(-30);

  // Transform for recharts — use open/close as bar range
  const chartData = useMemo(() => {
    return last30.map((c) => ({
      ...c,
      timeLabel: new Date(c.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      // For bar chart: value = [low, open, close, high]
      // We'll use a trick: bar from min(open,close) to max(open,close)
      barBottom: Math.min(c.open, c.close),
      barTop: Math.max(c.open, c.close),
      barHeight: Math.abs(c.close - c.open) || 0.5,
      wickBottom: c.low,
      wickTop: c.high,
    }));
  }, [last30]);

  const prices = last30.flatMap((c) => [c.high, c.low]);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const padding = (maxPrice - minPrice) * 0.05;
  const yMin = minPrice - padding;
  const yMax = maxPrice + padding;

  // Window boundary reference lines
  const windowLines = useMemo(() => {
    const lines: { time: number; label: string; color: string; dash?: string }[] = [];

    // Past window starts
    pastWindows.slice(0, 5).forEach((w) => {
      lines.push({
        time: w.windowStart,
        label: "",
        color: "rgba(255,215,0,0.2)",
        dash: "4 4",
      });
    });

    // Current window start
    if (currentWindow) {
      lines.push({
        time: currentWindow.windowStart,
        label: "Window Start",
        color: "rgba(255,215,0,0.6)",
      });

      // 3-min mark (prediction point)
      const predMark = currentWindow.windowStart + 3 * 60 * 1000;
      lines.push({
        time: predMark,
        label: "Predict",
        color: "rgba(0,212,255,0.5)",
        dash: "6 3",
      });
    }

    return lines;
  }, [currentWindow, pastWindows]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground text-sm font-mono-data">Loading chart data...</div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,255,255,0.05)"
          vertical={false}
        />
        <XAxis
          dataKey="timeLabel"
          tick={{ fill: "#556677", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
          tickLine={false}
          axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[yMin, yMax]}
          tick={{ fill: "#556677", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
          width={55}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }} />

        {/* Wick lines via scatter or reference */}
        {/* High-Low range bar (thin, for wick) */}
        <Bar
          dataKey="wickTop"
          stackId="wick"
          fill="transparent"
          stroke="transparent"
          isAnimationActive={false}
        />

        {/* Main candle body */}
        <Bar
          dataKey="barHeight"
          stackId="candle"
          fill="#00d4ff"
          isAnimationActive={false}
          shape={(props: unknown) => {
            const p = props as { x: number; y: number; width: number; height: number; payload: Candle };
            const color = p.payload.isBullish ? "#00d4ff" : "#ff4757";
            const glowColor = p.payload.isBullish ? "rgba(0,212,255,0.25)" : "rgba(255,71,87,0.25)";
            const h = Math.max(1, p.height);
            const cx = p.x + p.width / 2;

            // Draw wick
            const wickTop = p.y - ((p.payload.high - Math.max(p.payload.open, p.payload.close)) / (yMax - yMin)) * 300;
            const wickBottom = p.y + h + ((Math.min(p.payload.open, p.payload.close) - p.payload.low) / (yMax - yMin)) * 300;

            return (
              <g key={`candle-${p.payload.time}`}>
                {/* Glow */}
                <rect x={p.x - 1} y={p.y - 1} width={p.width + 2} height={h + 2} fill={glowColor} rx={1.5} />
                {/* Body */}
                <rect x={p.x} y={p.y} width={p.width} height={h} fill={color} fillOpacity={0.9} rx={1.5} />
                {/* Top wick */}
                <line x1={cx} y1={wickTop} x2={cx} y2={p.y} stroke={color} strokeWidth={1.5} strokeOpacity={0.7} />
                {/* Bottom wick */}
                <line x1={cx} y1={p.y + h} x2={cx} y2={wickBottom} stroke={color} strokeWidth={1.5} strokeOpacity={0.7} />
              </g>
            );
          }}
        />

        {/* Window boundary reference lines */}
        {windowLines.map((wl, i) => {
          // Find closest candle index
          const idx = chartData.findIndex((c) => c.time >= wl.time);
          if (idx < 0) return null;
          const dataKey = chartData[idx]?.timeLabel;
          return (
            <ReferenceLine
              key={i}
              x={dataKey}
              stroke={wl.color}
              strokeDasharray={wl.dash}
              strokeWidth={wl.label ? 2 : 1}
              label={
                wl.label
                  ? {
                      value: wl.label,
                      position: "insideTopLeft",
                      fill: wl.color,
                      fontSize: 10,
                      fontFamily: "JetBrains Mono, monospace",
                    }
                  : undefined
              }
            />
          );
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
