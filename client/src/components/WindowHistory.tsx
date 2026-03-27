/**
 * WindowHistory — Shows past 5-minute window predictions and results
 * Design: Glassmorphic Night Sky — compact rows with color-coded results
 */

import { FiveMinWindow } from "@/hooks/useBitcoinData";
import { CheckCircle, XCircle, Minus, TrendingUp, TrendingDown } from "lucide-react";

interface WindowHistoryProps {
  pastWindows: FiveMinWindow[];
}

export default function WindowHistory({ pastWindows }: WindowHistoryProps) {
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

  return (
    <div className="glass-panel overflow-hidden">
      <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#8899aa" }}>
          Window History
        </span>
      </div>
      <div className="divide-y divide-white/5">
        {pastWindows.map((w) => {
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

          return (
            <div
              key={w.windowStart}
              className="px-4 py-2.5 flex items-center gap-3"
              style={{ borderColor: "rgba(255,255,255,0.05)" }}
            >
              {/* Time */}
              <span className="text-xs font-mono-data w-12 flex-shrink-0" style={{ color: "#556677" }}>
                {time}
              </span>

              {/* Prediction */}
              <div className="flex items-center gap-1 flex-1">
                {w.prediction === "UP" ? (
                  <TrendingUp size={12} style={{ color: predColor }} />
                ) : w.prediction === "DOWN" ? (
                  <TrendingDown size={12} style={{ color: predColor }} />
                ) : (
                  <Minus size={12} style={{ color: predColor }} />
                )}
                <span className="text-xs font-mono-data font-medium" style={{ color: predColor }}>
                  {w.prediction ?? "—"}
                </span>
              </div>

              {/* Actual */}
              <div className="flex items-center gap-1 flex-1">
                {w.actualResult === "UP" ? (
                  <TrendingUp size={12} style={{ color: actualColor }} />
                ) : w.actualResult === "DOWN" ? (
                  <TrendingDown size={12} style={{ color: actualColor }} />
                ) : (
                  <Minus size={12} style={{ color: "#556677" }} />
                )}
                <span className="text-xs font-mono-data" style={{ color: actualColor }}>
                  {w.actualResult ?? "—"}
                </span>
              </div>

              {/* Confidence */}
              <span className="text-xs font-mono-data w-10 text-right flex-shrink-0" style={{ color: "#556677" }}>
                {w.predictionConfidence > 0 ? `${w.predictionConfidence.toFixed(0)}%` : "—"}
              </span>

              {/* Result icon */}
              <div className="flex-shrink-0 w-5">
                {w.predictionCorrect === true ? (
                  <CheckCircle size={14} style={{ color: "#00d4ff" }} />
                ) : w.predictionCorrect === false ? (
                  <XCircle size={14} style={{ color: "#ff4757" }} />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
