/**
 * WindowHistory — Enhanced past 5-minute window predictions and results
 * Design: Glassmorphic Night Sky — detailed rows with price stats, confidence bars, streaks
 */

import { FiveMinWindow } from "@/hooks/useBitcoinData";
import {
  CheckCircle, XCircle, Minus, TrendingUp, TrendingDown,
  ChevronDown, ChevronUp, BarChart2, Zap
} from "lucide-react";
import { useState } from "react";

interface WindowHistoryProps {
  pastWindows: FiveMinWindow[];
}

function MiniConfBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = value >= 75 ? "#00d4ff" : value >= 55 ? "#ffd700" : "#ff4757";
  return (
    <div className="h-1 rounded-full w-full" style={{ background: "rgba(255,255,255,0.08)" }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color, boxShadow: `0 0 4px ${color}60` }}
      />
    </div>
  );
}

function FactorMini({ label, value, range = 100 }: { label: string; value: number; range?: number }) {
  const normalized = Math.max(0, Math.min(100, (value + range) / (2 * range) * 100));
  const color = value >= 0 ? "#00d4ff" : "#ff4757";
  return (
    <div className="flex items-center gap-1.5 mb-1">
      <span className="text-xs font-mono-data w-16 flex-shrink-0" style={{ color: "#556677" }}>{label}</span>
      <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${normalized}%`,
            background: value >= 0
              ? `linear-gradient(90deg, rgba(0,212,255,0.2), ${color})`
              : `linear-gradient(90deg, ${color}, rgba(255,71,87,0.2))`,
          }}
        />
      </div>
      <span className="text-xs font-mono-data w-8 text-right flex-shrink-0" style={{ color }}>
        {value > 0 ? "+" : ""}{value}
      </span>
    </div>
  );
}

export default function WindowHistory({ pastWindows }: WindowHistoryProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (pastWindows.length === 0) {
    return (
      <div className="glass-panel p-4">
        <div className="text-center py-4">
          <div className="text-sm font-mono-data" style={{ color: "#556677" }}>
            No completed windows yet
          </div>
          <div className="text-xs mt-1" style={{ color: "#445566" }}>
            History will appear after the first 5-minute window closes
          </div>
        </div>
      </div>
    );
  }

  const displayWindows = showAll ? pastWindows : pastWindows.slice(0, 10);

  return (
    <div className="glass-panel overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 border-b flex items-center justify-between"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-2">
          <BarChart2 size={13} style={{ color: "#ffd700" }} />
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#8899aa" }}>
            Window History
          </span>
          <span
            className="text-xs font-mono-data px-1.5 py-0.5 rounded"
            style={{ background: "rgba(255,215,0,0.1)", color: "#ffd700", border: "1px solid rgba(255,215,0,0.2)" }}
          >
            {pastWindows.length}
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs font-mono-data" style={{ color: "#334455" }}>
          <span>Time</span>
          <span className="w-16 text-center">Prediction</span>
          <span className="w-16 text-center">Actual</span>
          <span className="w-20 text-center">Δ Price</span>
          <span className="w-12 text-center">Conf</span>
          <span className="w-5 text-center">✓</span>
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
        {displayWindows.map((w, idx) => {
          const time = new Date(w.windowStart).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          const predColor =
            w.prediction === "UP" ? "#00d4ff" :
            w.prediction === "DOWN" ? "#ff4757" :
            "#ffd700";
          const actualColor =
            w.actualResult === "UP" ? "#00d4ff" :
            w.actualResult === "DOWN" ? "#ff4757" :
            "#8899aa";

          const isCorrect = w.predictionCorrect === true;
          const isWrong = w.predictionCorrect === false;
          const isExpanded = expandedRow === idx;

          const rowBg = isCorrect
            ? "rgba(0,212,255,0.03)"
            : isWrong
            ? "rgba(255,71,87,0.03)"
            : "transparent";

          const priceChangeColor = w.priceChangePct !== null
            ? w.priceChangePct >= 0 ? "#00d4ff" : "#ff4757"
            : "#556677";

          return (
            <div key={w.windowStart}>
              {/* Main row */}
              <div
                className="px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                style={{ background: rowBg }}
                onClick={() => setExpandedRow(isExpanded ? null : idx)}
              >
                {/* Time */}
                <span className="text-xs font-mono-data w-12 flex-shrink-0" style={{ color: "#556677" }}>
                  {time}
                </span>

                {/* Prediction */}
                <div className="flex items-center gap-1 w-16 flex-shrink-0">
                  {w.prediction === "UP" ? (
                    <TrendingUp size={11} style={{ color: predColor }} />
                  ) : w.prediction === "DOWN" ? (
                    <TrendingDown size={11} style={{ color: predColor }} />
                  ) : (
                    <Minus size={11} style={{ color: predColor }} />
                  )}
                  <span className="text-xs font-mono-data font-semibold" style={{ color: predColor }}>
                    {w.prediction ?? "—"}
                  </span>
                </div>

                {/* Actual */}
                <div className="flex items-center gap-1 w-16 flex-shrink-0">
                  {w.actualResult === "UP" ? (
                    <TrendingUp size={11} style={{ color: actualColor }} />
                  ) : w.actualResult === "DOWN" ? (
                    <TrendingDown size={11} style={{ color: actualColor }} />
                  ) : (
                    <Minus size={11} style={{ color: "#556677" }} />
                  )}
                  <span className="text-xs font-mono-data" style={{ color: actualColor }}>
                    {w.actualResult ?? "—"}
                  </span>
                </div>

                {/* Price change */}
                <div className="hidden sm:flex items-center w-20 flex-shrink-0">
                  <span className="text-xs font-mono-data" style={{ color: priceChangeColor }}>
                    {w.priceChangePct !== null
                      ? `${w.priceChangePct >= 0 ? "+" : ""}${w.priceChangePct.toFixed(3)}%`
                      : "—"}
                  </span>
                </div>

                {/* Confidence */}
                <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-mono-data" style={{ color: "#445566" }}>
                      {w.predictionConfidence > 0 ? `${w.predictionConfidence.toFixed(0)}%` : "—"}
                    </span>
                    <span
                      className="text-xs font-mono-data hidden sm:inline"
                      style={{ color: w.analysisFactors.signalStrength === "STRONG" ? "#00d4ff" : w.analysisFactors.signalStrength === "MODERATE" ? "#ffd700" : "#556677" }}
                    >
                      {w.analysisFactors.signalStrength}
                    </span>
                  </div>
                  <MiniConfBar value={w.predictionConfidence} />
                </div>

                {/* Result icon */}
                <div className="flex items-center gap-1 flex-shrink-0 w-8 justify-end">
                  {isCorrect ? (
                    <CheckCircle size={14} style={{ color: "#00d4ff" }} />
                  ) : isWrong ? (
                    <XCircle size={14} style={{ color: "#ff4757" }} />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />
                  )}
                  {isExpanded
                    ? <ChevronUp size={11} style={{ color: "#445566" }} />
                    : <ChevronDown size={11} style={{ color: "#334455" }} />
                  }
                </div>
              </div>

              {/* Expanded detail row */}
              {isExpanded && (
                <div
                  className="px-4 pb-3 pt-1"
                  style={{ background: "rgba(255,255,255,0.015)", borderTop: "1px solid rgba(255,255,255,0.04)" }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Price stats */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Zap size={11} style={{ color: "#ffd700" }} />
                        <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: "#667788" }}>
                          Price Stats
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {[
                          { label: "Open", value: w.openPrice > 0 ? `$${w.openPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—" },
                          { label: "Close", value: w.closePrice !== null ? `$${w.closePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—" },
                          { label: "High", value: w.highPrice > 0 ? `$${w.highPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—" },
                          { label: "Low", value: w.lowPrice > 0 ? `$${w.lowPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—" },
                          { label: "Volume", value: w.totalVolume > 0 ? w.totalVolume.toFixed(4) : "—" },
                          { label: "Candles", value: `${w.candles.length}` },
                        ].map(({ label, value }) => (
                          <div key={label} className="flex justify-between items-center">
                            <span className="text-xs font-mono-data" style={{ color: "#445566" }}>{label}</span>
                            <span className="text-xs font-mono-data" style={{ color: "#8899aa" }}>{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Signal factors */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <BarChart2 size={11} style={{ color: "#00d4ff" }} />
                        <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: "#667788" }}>
                          Signal Factors
                        </span>
                      </div>
                      <FactorMini label="Momentum" value={w.analysisFactors.momentum} />
                      <FactorMini label="Volume Δ" value={w.analysisFactors.volumeDelta} />
                      <FactorMini label="Velocity" value={w.analysisFactors.priceVelocity} />
                      <FactorMini label="EMA" value={w.analysisFactors.emaSignal} />
                      <FactorMini label="Wick Bias" value={w.analysisFactors.wickBias} />
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-xs font-mono-data" style={{ color: "#445566" }}>RSI</span>
                        <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${w.analysisFactors.rsiScore}%`,
                              background: w.analysisFactors.rsiScore > 50
                                ? "linear-gradient(90deg, rgba(0,212,255,0.2), #00d4ff)"
                                : "linear-gradient(90deg, #ff4757, rgba(255,71,87,0.2))",
                            }}
                          />
                        </div>
                        <span className="text-xs font-mono-data w-8 text-right" style={{ color: w.analysisFactors.rsiScore > 50 ? "#00d4ff" : "#ff4757" }}>
                          {w.analysisFactors.rsiScore}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Score summary */}
                  <div
                    className="mt-3 flex items-center justify-between px-3 py-2 rounded"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <span className="text-xs font-mono-data" style={{ color: "#556677" }}>
                      Composite Score
                    </span>
                    <span
                      className="text-sm font-bold font-mono-data"
                      style={{ color: w.analysisFactors.rawScore >= 0 ? "#00d4ff" : "#ff4757" }}
                    >
                      {w.analysisFactors.rawScore >= 0 ? "+" : ""}{w.analysisFactors.rawScore}
                    </span>
                    <span
                      className="text-xs font-mono-data px-2 py-0.5 rounded"
                      style={{
                        background: w.analysisFactors.signalStrength === "STRONG"
                          ? "rgba(0,212,255,0.1)"
                          : w.analysisFactors.signalStrength === "MODERATE"
                          ? "rgba(255,215,0,0.1)"
                          : "rgba(255,255,255,0.05)",
                        color: w.analysisFactors.signalStrength === "STRONG"
                          ? "#00d4ff"
                          : w.analysisFactors.signalStrength === "MODERATE"
                          ? "#ffd700"
                          : "#556677",
                      }}
                    >
                      {w.analysisFactors.signalStrength}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Show more / less */}
      {pastWindows.length > 10 && (
        <div
          className="px-4 py-2.5 text-center border-t cursor-pointer hover:bg-white/[0.02] transition-colors"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
          onClick={() => setShowAll(!showAll)}
        >
          <span className="text-xs font-mono-data" style={{ color: "#445566" }}>
            {showAll ? "Show less" : `Show all ${pastWindows.length} windows`}
          </span>
        </div>
      )}
    </div>
  );
}
