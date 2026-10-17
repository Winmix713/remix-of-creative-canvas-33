# WinMix — Match Intelligence & Analytics

Professional virtual football match intelligence, walk-forward predictions, prequential calibration, league analysis, and decision ledger.

## Overview

WinMix is an analytics and match prediction platform built as a high-performance React SPA. It provides end-to-end tactical football intelligence across European leagues, featuring:

- **Taktikai Stúdió & Adatbázis (Data Studio)**: Match repository, season datasets, data imports, and team profiling.
- **Üzemeltetés & Vezérlés (Operations Dashboard)**: Configurable pipeline parameters, weight calibrations, and cloud tier controls.
- **Pipeline v2 Audit & Telemetria**: Invariant verification, walk-forward calibration verdicts, entropy floor monitors, and model state tracking.
- **Bajnokság Elemző (League Analyzer)**: League-wide standing projections, goal distributions, and pattern statistics.
- **H2H Mérkőzések (Head to Head)**: Historical encounter breakdowns, paired offensive/defensive ratings, and trend lines.
- **Forduló Prediktor (Fixture Predictor)**: Top 3+3 candidate selection, BTTS/underdog veto gating, and betting slip generation.
- **Tipp Napló & Visszacsatolás (Prediction Ledger)**: Historical prediction tracking, accuracy grading, calibration curves, and performance ledger.

## Technology Stack

- **Runtime & Build**: Node.js 22, Vite, TypeScript
- **UI & Layout**: React 18, Tailwind CSS, Radix UI primitives, Lucide React icons, Framer Motion
- **Data & Visualizations**: Recharts, TanStack Query
- **Testing**: Vitest, React Testing Library, PGlite (local Postgres integration tests)

## Getting Started

1. Install dependencies:
   ```sh
   npm install
   ```

2. Start the development server (runs on `http://0.0.0.0:3000`):
   ```sh
   npm run dev
   ```

3. Type-check and compile:
   ```sh
   npm run lint
   npm run build
   ```

4. Run tests:
   ```sh
   npm test
   ```

