/**
 * PatternSettingsPanel — Enable/disable prediction patterns with success rate display
 * Design: Glassmorphic Night Sky
 */

import { trpc } from "@/lib/trpc";
import { Settings, ToggleLeft, ToggleRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useState } from "react";

export default function PatternSettingsPanel() {
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  const patternsQuery = trpc.patterns.list.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const toggleMutation = trpc.patterns.toggle.useMutation({
    onSuccess: () => patternsQuery.refetch(),
  });

  const handleToggle = (patternKey: string, currentEnabled: boolean) => {
    const newEnabled = !currentEnabled;
    setOptimistic((prev) => ({ ...prev, [patternKey]: newEnabled }));
    toggleMutation.mutate({ patternKey, enabled: newEnabled });
  };

  const patterns = patternsQuery.data ?? [];

  return (
    <div className="glass-panel p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Settings size={14} style={{ color: "#ffd700" }} />
        <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#8899aa" }}>
          Pattern Controls
        </span>
        <span className="ml-auto text-xs font-mono-data" style={{ color: "#445566" }}>
          {patterns.filter((p) => optimistic[p.patternKey] ?? p.enabled).length}/{patterns.length} active
        </span>
      </div>

      {/* Pattern list */}
      <div className="space-y-2">
        {patterns.map((pattern) => {
          const isEnabled = optimistic[pattern.patternKey] ?? pattern.enabled;
          const successRate = pattern.successRate ?? 0;
          const hasSamples = (pattern.totalPredictions ?? 0) > 0;

          const successColor =
            !hasSamples ? "#445566" :
            successRate >= 60 ? "#00d4ff" :
            successRate >= 50 ? "#ffd700" :
            "#ff4757";

          const SuccessIcon = !hasSamples ? Minus :
            successRate >= 55 ? TrendingUp :
            successRate < 45 ? TrendingDown : Minus;

          return (
            <div
              key={pattern.patternKey}
              className="rounded p-2.5 transition-all"
              style={{
                background: isEnabled ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${isEnabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)"}`,
                opacity: isEnabled ? 1 : 0.6,
              }}
            >
              <div className="flex items-center gap-2">
                {/* Toggle */}
                <button
                  onClick={() => handleToggle(pattern.patternKey, isEnabled)}
                  className="flex-shrink-0 transition-colors"
                  style={{ color: isEnabled ? "#00d4ff" : "#334455" }}
                >
                  {isEnabled
                    ? <ToggleRight size={18} />
                    : <ToggleLeft size={18} />
                  }
                </button>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs font-semibold"
                      style={{ color: isEnabled ? "#e8f4ff" : "#445566" }}
                    >
                      {pattern.patternName}
                    </span>
                    {/* Success rate */}
                    <div className="flex items-center gap-1">
                      <SuccessIcon size={10} style={{ color: successColor }} />
                      <span className="text-xs font-mono-data" style={{ color: successColor }}>
                        {hasSamples ? `${successRate.toFixed(0)}%` : "—"}
                      </span>
                    </div>
                  </div>

                  {/* Success bar */}
                  {hasSamples && (
                    <div className="mt-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${successRate}%`,
                          background: successRate >= 60
                            ? "linear-gradient(90deg, rgba(0,212,255,0.3), #00d4ff)"
                            : successRate >= 50
                            ? "linear-gradient(90deg, rgba(255,215,0,0.3), #ffd700)"
                            : "linear-gradient(90deg, #ff4757, rgba(255,71,87,0.3))",
                        }}
                      />
                    </div>
                  )}

                  {/* Sample count */}
                  {hasSamples && (
                    <div className="text-xs mt-0.5" style={{ color: "#334455" }}>
                      {pattern.correctPredictions}/{pattern.totalPredictions} correct
                    </div>
                  )}
                </div>

                {/* Weight badge */}
                <div
                  className="flex-shrink-0 text-xs font-mono-data px-1.5 py-0.5 rounded"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    color: "#556677",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {((pattern.mlWeight ?? pattern.weight) * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {patterns.length === 0 && (
        <div className="text-center py-4 text-xs" style={{ color: "#334455" }}>
          Loading patterns...
        </div>
      )}

      <div className="mt-3 text-xs" style={{ color: "#334455" }}>
        Success rates update after ML training. Disable patterns with &lt;50% success to improve accuracy.
      </div>
    </div>
  );
}
