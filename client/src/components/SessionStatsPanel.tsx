/**
 * SessionStatsPanel — Detailed session statistics with accuracy breakdown
 * Design: Glassmorphic Night Sky — compact stats grid
 */

import { SessionStats } from "@/hooks/useBitcoinData";
import { Award, TrendingUp, TrendingDown, Target, Zap } from "lucide-react";

interface SessionStatsPanelProps {
  stats: SessionStats;
}

function StatCell({ label, value, color, icon: Icon }: {
  label: string;
  value: string | number;
  color?: string;
  icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center p-2 rounded"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
    >
      {Icon && <Icon size={12} style={{ color: color ?? "#556677", marginBottom: "3px" }} />}
      <div
        className="text-base font-bold font-mono-data"
        style={{ color: color ?? "#8899aa", fontFamily: "JetBrains Mono, monospace" }}
      >
        {value}
      </div>
      <div className="text-xs font-mono-data mt-0.5" style={{ color: "#445566" }}>
        {label}
      </div>
    </div>
  );
}

export default function SessionStatsPanel({ stats }: SessionStatsPanelProps) {
  const accuracyColor =
    stats.accuracy >= 65 ? "#00d4ff" :
    stats.accuracy >= 50 ? "#ffd700" :
    "#ff4757";

  const streakColor =
    stats.currentStreakType === "WIN" ? "#00d4ff" :
    stats.currentStreakType === "LOSS" ? "#ff4757" :
    "#556677";

  const upAccuracy = stats.upPredictions > 0
    ? Math.round((stats.upCorrect / stats.upPredictions) * 100)
    : 0;
  const downAccuracy = stats.downPredictions > 0
    ? Math.round((stats.downCorrect / stats.downPredictions) * 100)
    : 0;

  return (
    <div className="glass-panel p-3">
      <div className="flex items-center gap-2 mb-3">
        <Award size={13} style={{ color: "#ffd700" }} />
        <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#8899aa" }}>
          Session Stats
        </span>
        {stats.totalPredictions > 0 && (
          <span className="ml-auto text-xs font-mono-data" style={{ color: "#445566" }}>
            {stats.correctPredictions}/{stats.totalPredictions} correct
          </span>
        )}
      </div>

      {stats.totalPredictions === 0 ? (
        <div className="text-center py-2">
          <span className="text-xs font-mono-data" style={{ color: "#445566" }}>
            No predictions yet this session
          </span>
        </div>
      ) : (
        <>
          {/* Main accuracy + streak */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <StatCell
              label="Accuracy"
              value={`${stats.accuracy}%`}
              color={accuracyColor}
              icon={Target}
            />
            <StatCell
              label={`${stats.currentStreakType === "WIN" ? "Win" : stats.currentStreakType === "LOSS" ? "Loss" : ""} Streak`}
              value={stats.currentStreak > 0 ? `${stats.currentStreakType === "WIN" ? "+" : "-"}${stats.currentStreak}` : "—"}
              color={streakColor}
              icon={Zap}
            />
            <StatCell
              label="Avg Conf"
              value={`${stats.avgConfidence}%`}
              color="#8899aa"
            />
          </div>

          {/* UP vs DOWN accuracy */}
          <div className="grid grid-cols-2 gap-2">
            <div
              className="flex items-center justify-between px-2.5 py-1.5 rounded"
              style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.12)" }}
            >
              <div className="flex items-center gap-1">
                <TrendingUp size={11} style={{ color: "#00d4ff" }} />
                <span className="text-xs font-mono-data" style={{ color: "#00d4ff" }}>UP</span>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold font-mono-data" style={{ color: "#00d4ff" }}>
                  {upAccuracy}%
                </div>
                <div className="text-xs font-mono-data" style={{ color: "#334455" }}>
                  {stats.upCorrect}/{stats.upPredictions}
                </div>
              </div>
            </div>
            <div
              className="flex items-center justify-between px-2.5 py-1.5 rounded"
              style={{ background: "rgba(255,71,87,0.05)", border: "1px solid rgba(255,71,87,0.12)" }}
            >
              <div className="flex items-center gap-1">
                <TrendingDown size={11} style={{ color: "#ff4757" }} />
                <span className="text-xs font-mono-data" style={{ color: "#ff4757" }}>DOWN</span>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold font-mono-data" style={{ color: "#ff4757" }}>
                  {downAccuracy}%
                </div>
                <div className="text-xs font-mono-data" style={{ color: "#334455" }}>
                  {stats.downCorrect}/{stats.downPredictions}
                </div>
              </div>
            </div>
          </div>

          {/* Best streak */}
          {stats.bestStreak > 1 && (
            <div className="mt-2 flex items-center justify-between px-2 py-1 rounded" style={{ background: "rgba(255,255,255,0.02)" }}>
              <span className="text-xs font-mono-data" style={{ color: "#445566" }}>Best streak</span>
              <span className="text-xs font-mono-data font-bold" style={{ color: "#ffd700" }}>
                {stats.bestStreak} in a row
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
