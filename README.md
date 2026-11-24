# quantlab.mesthi.com

Quant lab for trading: backtesting harian untuk **Binance Futures USDT-M**, dengan login/register beranimasi GSAP.
Stack: React 19 + Vite + TypeScript, GSAP, lightweight-charts, Vitest.

## Menjalankan

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit test engine, indikator, rules, auth
npm run typecheck
npm run build      # output di dist/
```

Routing memakai `BrowserRouter`: hosting statis perlu fallback SPA (semua path → `index.html`).

## Fitur tahap awal

- **Auth lokal** (`src/lib/auth/localAuth.ts`): akun disimpan di localStorage browser, password di-hash PBKDF2-SHA256.
  Ini bukan autentikasi server; ganti dengan backend sebelum dipakai publik.
- **Data**: kline publik `fapi.binance.com` (tanpa API key), semua pair USDT perpetual, timeframe 15m–1d, hanya candle yang sudah close.
- **Indikator** (`src/lib/backtest/catalog.ts`, 39 indikator): MA (SMA/EMA/WMA/Hull/DEMA/TEMA/VWMA/VWAP), Supertrend, PSAR,
  Ichimoku, ADX/DMI, Aroon, RSI, Stochastic, Stoch RSI, MACD, CCI, Williams %R, ROC, Momentum, AO, TSI, MFI,
  Bollinger, Keltner, Donchian, ATR, StdDev, Volume, RVOL, OBV, A/D, CMF.
  - **Order flow**: Volume Delta, CVD, Delta %, rolling delta, CVD divergence — dari taker buy volume kline Binance
    (bukan footprint/order book tick).
  - **Likuiditas**: Liquidity Sweep (wick menembus high/low N bar lalu close kembali ke dalam), Fair Value Gap.
  - **Sinyal Ticker**: EMA bias + RSI regular divergence + break of structure, adaptasi satu timeframe dari skill
    "Analisis divergence multitimeframe" milik agent Ticker (aslinya 4H/15M/1M).
- **Rule builder** (`src/lib/backtest/rules.ts`): gabungkan beberapa indikator dengan kondisi `>`, `<`, cross ↑, cross ↓,
  logika AND/OR, untuk entry/exit long dan short. Setup bisa disimpan per user.
- **Engine** (`src/lib/backtest/engine.ts`): sinyal diputuskan di close, dieksekusi di open bar berikutnya (tanpa look-ahead);
  fee, slippage, leverage, stop loss, take profit, likuidasi sederhana.
- **Bandingkan**: semua preset + setup tersimpan diuji pada data yang sama, bisa diurutkan per return, return
  out-of-sample, Sharpe, drawdown, profit factor, win rate.

## Batasan yang diketahui

- Funding rate belum dihitung; likuidasi = margin habis (tanpa maintenance margin / mark price).
- Stop dan take profit di bar yang sama: diasumsikan stop dulu (konservatif).
- Belum semua indikator TradingView tersedia; tambah di `INDICATORS` pada `catalog.ts` (satu objek per indikator).

## Desain

Token dan aturan UI dari skill ui-ux-pro-max: `design-system/quantlab/MASTER.md` → `src/styles/tokens.css`.
