/**
 * SchedulerPanel — Background prediction scheduler status and controls
 * Design: Glassmorphic Night Sky
 */

import { trpc } from "@/lib/trpc";
import { Clock, Play, Pause, Zap, CheckCircle, XCircle } from "lucide-react";
import { useState } from "react";

export default function SchedulerPanel() {
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null);

  const statusQuery = trpc.scheduler.status.useQuery(undefined, {
    refetchInterval: 15000,
  });

  const toggleMutation = trpc.scheduler.toggle.useMutation({
    onSuccess: () => {
      statusQuery.refetch();
      setOptimisticEnabled(null);
    },
  });

  const triggerMutation = trpc.scheduler.triggerNow.useMutation({
    onSuccess: () => statusQuery.refetch(),
  });

  const status = statusQuery.data;
  const isEnabled = optimisticEnabled ?? status?.enabled ?? false;

  const handleToggle = () => {
    const newEnabled = !isEnabled;
    setOptimisticEnabled(newEnabled);
    toggleMutation.mutate({ enabled: newEnabled });
  };

  const statusColor = isEnabled ? "#00d4ff" : "#445566";
  const lastRunColor =
    status?.lastRunStatus === "success" ? "#00d4ff" :
    status?.lastRunStatus === "error" ? "#ff4757" :
    "#445566";

  return (
    <div className="glass-panel p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock size={14} style={{ color: "#ffd700" }} />
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#8899aa" }}>
            Background Scheduler
          </span>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-1.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: statusColor,
              boxShadow: isEnabled ? `0 0 6px ${statusColor}` : "none",
              animation: isEnabled ? "pulse-live 2s infinite" : "none",
            }}
          />
          <span className="text-xs font-mono-data" style={{ color: statusColor }}>
            {isEnabled ? "Running" : "Paused"}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div
          className="rounded p-2"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="text-xs font-mono-data font-bold" style={{ color: "#ffd700" }}>
            {status?.totalRuns ?? 0}
          </div>
          <div className="text-xs" style={{ color: "#445566" }}>Total Runs</div>
        </div>
        <div
          className="rounded p-2"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-1">
            {status?.lastRunStatus === "success"
              ? <CheckCircle size={10} style={{ color: "#00d4ff" }} />
              : status?.lastRunStatus === "error"
              ? <XCircle size={10} style={{ color: "#ff4757" }} />
              : null
            }
            <span className="text-xs font-mono-data font-bold" style={{ color: lastRunColor }}>
              {status?.lastRunStatus ?? "—"}
            </span>
          </div>
          <div className="text-xs" style={{ color: "#445566" }}>Last Status</div>
        </div>
      </div>

      {/* Last run time */}
      {status?.lastRunAt && (
        <div className="mb-3 text-xs font-mono-data" style={{ color: "#445566" }}>
          Last run: {new Date(status.lastRunAt).toLocaleTimeString()}
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={handleToggle}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-semibold transition-all"
          style={{
            background: isEnabled ? "rgba(255,71,87,0.15)" : "rgba(0,212,255,0.15)",
            color: isEnabled ? "#ff4757" : "#00d4ff",
            border: `1px solid ${isEnabled ? "rgba(255,71,87,0.3)" : "rgba(0,212,255,0.3)"}`,
          }}
        >
          {isEnabled ? <Pause size={11} /> : <Play size={11} />}
          {isEnabled ? "Pause" : "Enable"}
        </button>

        <button
          onClick={() => triggerMutation.mutate()}
          disabled={triggerMutation.isPending}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all"
          style={{
            background: "rgba(255,215,0,0.15)",
            color: "#ffd700",
            border: "1px solid rgba(255,215,0,0.3)",
            cursor: triggerMutation.isPending ? "not-allowed" : "pointer",
            opacity: triggerMutation.isPending ? 0.6 : 1,
          }}
        >
          <Zap size={11} />
          Run Now
        </button>
      </div>

      <div className="mt-2 text-xs" style={{ color: "#334455" }}>
        Predictions run every 5 min even when this page is closed.
      </div>
    </div>
  );
}
