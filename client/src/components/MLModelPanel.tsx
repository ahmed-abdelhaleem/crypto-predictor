/**
 * MLModelPanel — Shows ML model training status, weights, and progress
 * Design: Glassmorphic Night Sky
 */

import { trpc } from "@/lib/trpc";
import { Brain, Zap, RefreshCw, TrendingUp, Database } from "lucide-react";
import { useState } from "react";

const DEFAULT_WEIGHTS: Record<string, number> = {
  momentum: 0.25,
  volumeDelta: 0.20,
  priceVelocity: 0.15,
  rsiScore: 0.10,
  emaSignal: 0.10,
  bollingerPos: 0.08,
  vwapDeviation: 0.05,
  wickBias: 0.04,
  trendStrength: 0.03,
};

const PATTERN_LABELS: Record<string, string> = {
  momentum: "Momentum",
  volumeDelta: "Volume Δ",
  priceVelocity: "Velocity",
  rsiScore: "RSI",
  emaSignal: "EMA Cross",
  bollingerPos: "Bollinger",
  vwapDeviation: "VWAP Dev",
  wickBias: "Wick Bias",
  trendStrength: "Trend Str",
};

export default function MLModelPanel() {
  const [isTraining, setIsTraining] = useState(false);

  const mlStatusQuery = trpc.ml.status.useQuery(undefined, {
    refetchInterval: 15000,
  });

  const triggerTrainingMutation = trpc.ml.triggerTraining.useMutation({
    onSuccess: () => {
      setIsTraining(false);
      mlStatusQuery.refetch();
    },
    onError: () => setIsTraining(false),
  });

  const handleTriggerTraining = () => {
    setIsTraining(true);
    triggerTrainingMutation.mutate();
  };

  const model = mlStatusQuery.data;
  const weights = model?.weights ?? DEFAULT_WEIGHTS;
  const isModelTraining = model?.status === "training" || isTraining;

  const statusColor =
    model?.status === "ready" ? "#00d4ff" :
    model?.status === "training" ? "#ffd700" :
    "#556677";

  const statusLabel =
    model?.status === "ready" ? "Ready" :
    model?.status === "training" ? "Training..." :
    "Idle";

  return (
    <div className="glass-panel p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain size={14} style={{ color: "#a78bfa" }} />
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#8899aa" }}>
            ML Model
          </span>
          <span
            className="text-xs font-mono-data px-2 py-0.5 rounded-full"
            style={{ background: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}40` }}
          >
            {statusLabel}
          </span>
        </div>
        <button
          onClick={handleTriggerTraining}
          disabled={isModelTraining}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded"
          style={{
            background: isModelTraining ? "rgba(255,255,255,0.05)" : "rgba(167,139,250,0.15)",
            color: isModelTraining ? "#445566" : "#a78bfa",
            border: `1px solid ${isModelTraining ? "rgba(255,255,255,0.05)" : "rgba(167,139,250,0.3)"}`,
            cursor: isModelTraining ? "not-allowed" : "pointer",
          }}
        >
          <RefreshCw size={10} className={isModelTraining ? "animate-spin" : ""} />
          {isModelTraining ? "Training..." : "Train Now"}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          {
            label: "Rounds",
            value: model?.trainingRounds ?? 0,
            icon: <RefreshCw size={10} />,
            color: "#a78bfa",
          },
          {
            label: "Samples",
            value: model?.totalSamples ?? 0,
            icon: <Database size={10} />,
            color: "#00d4ff",
          },
          {
            label: "Best Acc",
            value: model?.bestAccuracy != null ? `${model.bestAccuracy.toFixed(1)}%` : "—",
            icon: <TrendingUp size={10} />,
            color: "#ffd700",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded p-2 text-center"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center justify-center gap-1 mb-1" style={{ color: stat.color }}>
              {stat.icon}
              <span className="text-xs font-mono-data">{stat.value}</span>
            </div>
            <div className="text-xs" style={{ color: "#445566" }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Last training accuracy */}
      {model?.lastTrainingAccuracy != null && (
        <div className="mb-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs" style={{ color: "#8899aa" }}>Last Training Accuracy</span>
            <span
              className="text-xs font-mono-data font-bold"
              style={{
                color: model.lastTrainingAccuracy >= 60 ? "#00d4ff" :
                       model.lastTrainingAccuracy >= 50 ? "#ffd700" : "#ff4757",
              }}
            >
              {model.lastTrainingAccuracy.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${model.lastTrainingAccuracy}%`,
                background: model.lastTrainingAccuracy >= 60
                  ? "linear-gradient(90deg, rgba(0,212,255,0.4), #00d4ff)"
                  : model.lastTrainingAccuracy >= 50
                  ? "linear-gradient(90deg, rgba(255,215,0,0.4), #ffd700)"
                  : "linear-gradient(90deg, rgba(255,71,87,0.4), #ff4757)",
              }}
            />
          </div>
        </div>
      )}

      {/* Learned weights visualization */}
      <div>
        <div className="text-xs font-semibold mb-2" style={{ color: "#556677" }}>
          Learned Weights (v{model?.version ?? 1})
        </div>
        {Object.entries(weights)
          .sort((a, b) => b[1] - a[1])
          .map(([key, value]) => {
            const defaultW = DEFAULT_WEIGHTS[key] ?? 0.1;
            const diff = value - defaultW;
            const diffColor = diff > 0.01 ? "#00d4ff" : diff < -0.01 ? "#ff4757" : "#556677";
            const barWidth = Math.min(100, (value / 0.5) * 100);

            return (
              <div key={key} className="mb-1.5">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-mono-data" style={{ color: "#8899aa" }}>
                    {PATTERN_LABELS[key] ?? key}
                  </span>
                  <div className="flex items-center gap-1">
                    {Math.abs(diff) > 0.005 && (
                      <span className="text-xs font-mono-data" style={{ color: diffColor }}>
                        {diff > 0 ? "+" : ""}{(diff * 100).toFixed(1)}%
                      </span>
                    )}
                    <span className="text-xs font-mono-data" style={{ color: "#a78bfa" }}>
                      {(value * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${barWidth}%`,
                      background: "linear-gradient(90deg, rgba(167,139,250,0.4), #a78bfa)",
                    }}
                  />
                </div>
              </div>
            );
          })}
      </div>

      {model?.lastTrainedAt && (
        <div className="mt-3 text-xs font-mono-data" style={{ color: "#334455" }}>
          Last trained: {new Date(model.lastTrainedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
