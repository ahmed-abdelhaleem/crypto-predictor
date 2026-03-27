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
