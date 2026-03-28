# CryptoOracle - BTC Predictor TODO

## Core Features
- [x] Backend proxy for Binance API (avoids geo-restrictions/CORS)
- [x] tRPC routes: btc.klines, btc.ticker, btc.recent
- [x] useBitcoinData hook with tRPC integration
- [x] 5-minute window detection and alignment
- [x] 3-minute analysis phase (collect data in first 3 min)
- [x] Prediction algorithm: momentum, volume delta, price velocity, RSI-like score
- [x] Weighted composite score → UP/DOWN/NEUTRAL prediction
- [x] Prediction confidence score (0-100%)
- [x] Window rollover detection and finalization
- [x] Historical accuracy tracking
- [x] Live ticker (price, 24h change, high, low, volume)
- [x] Auto-refresh: ticker every 5s, candles every 10s

## UI Components
- [x] Glassmorphic Night Sky design system (CSS variables, glass panels, glow effects)
- [x] JetBrains Mono + Outfit typography
- [x] Animated background orbs
- [x] LiveTicker header (sticky, responsive)
- [x] CandleChart (1m candles, window markers, custom tooltip)
- [x] PredictionPanel (result badge, confidence bar, factor bars, window progress)
- [x] WindowHistory (past predictions vs actuals)
- [x] Loading skeleton states
- [x] Error state with retry indicator
- [x] "How it works" info strip

## Mobile Responsiveness
- [x] Single column layout on mobile (chart first, prediction panel below)
- [x] Sticky header with compact mobile layout
- [x] Responsive grid (1 col mobile → 3 col desktop)
- [x] Touch-friendly tap targets
- [x] Truncated stats on mobile (24h stats hidden, badge shown instead)
- [x] Responsive chart height
- [x] Scrollable window history

## Bug Fixes
- [x] Fixed geo-restriction issue (Binance 451 error) via server-side proxy
- [x] Fixed TypeScript errors from upgrade merge conflicts
- [x] Fixed stale Vite cache after server upgrade
- [x] Fixed Binance 451 geo-restriction on sandbox — switched to Kraken API

## Enhancement #1 — Mathematical Model Review & Pattern Controls
- [x] Enhanced prediction engine with 9 weighted indicators (momentum, volumeDelta, priceVelocity, rsiScore, emaSignal, bollingerPos, vwapDeviation, wickBias, trendStrength)
- [x] Pattern enable/disable controls per indicator
- [x] Per-pattern success rate tracking
- [x] PatternSettingsPanel component with toggle controls and success bars
- [x] Pattern descriptions panel explaining each indicator

## Enhancement #2 — Background Scheduler (Always Running)
- [x] Server-side background scheduler using setInterval (runs every 5 min)
- [x] Scheduler starts automatically when server boots
- [x] Scheduler respects enabled/disabled setting from DB
- [x] SchedulerPanel component with enable/disable toggle and "Run Now" button
- [x] Scheduler status stored in DB (totalRuns, lastRunAt, lastRunStatus)
- [x] Predictions tagged with source="scheduler" vs source="browser"

## Enhancement #3 — Self-Learning ML Model
- [x] Gradient descent ML model that learns from historical prediction failures
- [x] ML training runs every 30 minutes via background job
- [x] Adjusts indicator weights based on per-indicator accuracy
- [x] MLModelPanel showing version, training rounds, samples, accuracy, and learned weights
- [x] Manual "Train Now" button to trigger training
- [x] Model state persisted in ml_model_state DB table

## Enhancement #4 — History Storage & Full DB Retrieval
- [x] prediction_windows DB table stores every prediction
- [x] Browser predictions saved to DB via history.save mutation
- [x] Window finalization (actual result) saved via history.finalize mutation
- [x] DB history loaded on app mount and merged with in-memory state
- [x] WindowHistory shows total DB count and "X in DB" indicator
- [x] Scheduler predictions also stored in DB (visible when app reopened)

## Enhancement #5 — Mid-Window Prediction Revision & Cashout Guidance
- [x] CashoutGuidance component with live signal monitoring
- [x] Mid-window revision runs every ~60 seconds after 2 min into window
- [x] Detects prediction flips and confidence drops
- [x] Cashout recommendation: HOLD / CONSIDER_CASHOUT / CASHOUT NOW
- [x] Risk score and estimated P&L display
- [x] Prediction revision history stored in prediction_revisions DB table
- [x] Time remaining display
