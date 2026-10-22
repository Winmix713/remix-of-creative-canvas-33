# WinMix Studio — newddesign Frontend Implementation Prompt

## Document Purpose

This document is a complete development brief for restyling the six core WinMix Studio pages to match the visual language, component patterns, and interaction design demonstrated in the `newddesign/` reference demo (an HTML/CSS/JS prototype).

The target pages are:

1. `src/pages/DataStudio.tsx` — Tactical Studio & Database
2. `src/pages/FixturePredictor.tsx` — Round Predictor (Top 3+3)
3. `src/pages/LeagueAnalyzer.tsx` — League Analyzer
4. `src/pages/PipelineAudit.tsx` — Pipeline v2 Audit & Telemetry
5. `src/pages/PipelineOperationsDashboard.tsx` — Pipeline Operations
6. `src/pages/PredictionLedger.tsx` — Tip Ledger & Feedback

---

## 1. Design System Foundation

### 1.1 Color Palette

The demo uses a dark, cinematic palette built around a near-black base with purple and emerald accents. Translate this into the WinMix Tailwind config as a cohesive ramp system.

| Token              | Demo Value                | Usage                                      |
|--------------------|---------------------------|--------------------------------------------|
| `--base`           | `#08080a`                 | App background                             |
| `--surface`        | `rgba(255,255,255,0.05)`  | Card/panel backgrounds (glass)             |
| `--stroke`         | `rgba(255,255,255,0.10)`  | Borders, dividers                          |
| `--text`           | `#f8fafc`                 | Primary text                               |
| `--muted`          | `#919097`                 | Secondary text, labels                     |
| `--purple`         | `#a855f7`                 | Primary accent (home team, highlights)     |
| `--emerald`        | `#34d399`                 | Secondary accent (away team, success)      |
| `--loss`           | `#665373`                 | Tertiary/loss indicators                   |

**Important:** The project's global design requirements forbid defaulting to purple gradients. This demo explicitly uses purple as the brand accent for WinMix — it is a user-requested color, not a default. The emerald green serves as the complementary accent for opposing teams, success states, and positive metrics.

### 1.2 Typography

- **Font family:** `Inter` (weights 300, 400, 500, 600, 700) loaded from Google Fonts.
- **Body text:** 14–16px, line-height 1.75 for descriptions, 1.5 for data labels.
- **Headings:** letter-spacing -1 to -1.8px, font-weight 400–500 (not bold).
- **Eyebrow labels:** 10px, letter-spacing 1.3–1.6px, uppercase, color `--muted`.
- **Data values (metric strip):** 25px, font-weight 500, letter-spacing -1px, color `#d5b4f2`.
- **Table headers:** 10px, letter-spacing 1–1.4px, color `#72657f`, font-weight 400.

### 1.3 Spacing & Layout

- Use an 8px spacing system.
- Dashboard shell: max-width 1100px (1160px on large screens), centered, with 7px padding and gradient border.
- Sidebar: fixed 205px (218px on large screens), collapsible below 600px.
- Content area: flex 1, min-width 0, padding 25px (20px on medium, 15px on mobile).
- Card padding: 17px standard, 13px on tablet.
- Grid gap: 12px between cards.

### 1.4 Glass-Morphism Surfaces

The dashboard shell uses layered translucency:

```
.dashboard-shell {
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.3);
  padding: 7px;
  background: linear-gradient(130deg, rgba(242,228,255,0.13), rgba(255,255,255,0.05) 35%, rgba(185,144,250,0.13));
  backdrop-filter: blur(25px);
}

.dashboard {
  background: #0c0b10ef;
  border: 1px solid rgba(255,255,255,0.0f);
  border-radius: 11px;
  overflow: hidden;
}
```

Cards inside the dashboard use a subtle gradient:
```
background: linear-gradient(140deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01));
border: 1px solid rgba(255,255,255,0.0e);
border-radius: 8px;
padding: 17px;
```

### 1.5 Responsive Breakpoints

| Breakpoint | Width       | Key Changes                                           |
|------------|-------------|-------------------------------------------------------|
| XL         | ≥1500px     | Wider stage, larger fonts, expanded floating cards    |
| LG         | ≤1350px     | Narrower sidebar, condensed floating cards            |
| MD         | ≤1100px     | Hide date columns, smaller search                     |
| SM         | ≤800px      | Sidebar hidden on mobile, mobile view selector shown  |
| XS         | ≤600px      | Single-column grids, full-width tables                |
| Tiny       | ≤360px      | Hide badge pairs, further condense                    |

---

## 2. Shared Layout Architecture

### 2.1 Dashboard Shell Pattern

Every page should be wrapped in the dashboard shell pattern from the demo:

```
<DashboardShell>
  <Sidebar />        ← Navigation (already exists as NavRail)
  <ContentArea>
    <TopLine />       ← Breadcrumb + controls
    <Heading />       ← Page title + description + action button
    <Toolbar />       ← Tabs, search, filters (page-specific)
    <Panel />         ← Main content area
  </ContentArea>
</DashboardShell>
```

### 2.2 Top Line (Breadcrumb Bar)

A thin bar above the page heading showing:
- Breadcrumb path: `Winmix / [Current Page]`
- Right side: theme toggle, RTL toggle, font-size slider, "DEMO" or "LIVE" indicator

### 2.3 Page Heading

- Title: 27px, letter-spacing -1.15px, font-weight 500, with a colored dot (`.`) in `#be88ff` at the end.
- Description: 13px, color `#817789`, below the title.
- Optional action button on the right (e.g., "Take a tour", "Export").

### 2.4 Sidebar (Existing NavRail)

The existing `NavRail.tsx` component already serves as the sidebar. Restyle it to match the demo:
- Width: 205px (218px on XL).
- Background: `linear-gradient(140deg, rgba(48,40,59,0.2), rgba(16,15,20,0.4) 70%)`.
- Items: 14px, color `#9a94a4`, hover `#d6cddd`, selected has `background: #a855f718` and `border: 1px solid #a855f723`.
- Collapsible groups with chevron rotation.
- Bottom area: usage/coverage card + user profile.

### 2.5 Toolbar Pattern

Used for filtering and searching within a page:
- **Tabs:** Underlined, 13px, selected in `#d9c8ec` with 2px bottom border in `#ae72eb`.
- **Search field:** Compact, with search icon, `kbd /` shortcut hint.
- **Filter button:** Icon-only, expands a filter panel below.

---

## 3. Component Library

The following reusable components should be built or restyled to match the demo. Each maps to existing WinMix functionality.

### 3.1 DataCard

The fundamental content container.

```
<Card className="data-card">
  <CardHeading title="..." subtitle="..." />
  {children}
</Card>
```

- Background: `linear-gradient(140deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01))`
- Border: `1px solid rgba(255,255,255,0.0e)`
- Border-radius: 8px
- Padding: 17px
- Heading: 14px, font-weight 500, color `#d7c9e4`
- Optional `wide` modifier: `grid-column: 1 / -1`

### 3.2 MetricStrip

A horizontal row of 4 KPI values. Used for page-level summary stats.

- Grid: `repeat(4, 1fr)`, gap 12px.
- Each item: left border `1px solid rgba(255,255,255,0.12)`, padding-left 13px.
- Label: 11px, color `#8f7e9f`.
- Value: 25px, font-weight 500, color `#d5b4f2`, letter-spacing -1px.
- Unit suffix: 12px, color `#927aa4`.

**WinMix mapping:** League KPIs (seasons, matches, accuracy, coverage), pipeline stats (Brier, LogLoss, ECE, Skill), ledger stats (tips, hit rate, profit, ROI).

### 3.3 TrackTable (Match/Data Table)

The primary data table with row hover, active row highlight, and inline actions.

- Header: 10px, letter-spacing 1px, color `#72657f`, font-weight 400.
- Cells: 12px, color `#91839f`, padding-block 10px.
- Hover: `background: rgba(255,255,255,0.035)`.
- Active row: `background: linear-gradient(90deg, rgba(168,85,247,0.067), rgba(168,85,247,0.03))`.
- Number column: centered, 38px wide.
- Status tags: 10px, rounded 4px, with color variants (live = emerald, finished = muted).

**WinMix mapping:** Match log, standings table, ledger entries, audit results.

### 3.4 RadarChart

Hexagonal team comparison chart (6 axes). Already used in the demo for match statistics.

- SVG-based, 260×215 viewBox.
- Two overlapping polygons (home = purple fill, away = emerald fill).
- Grid rings at 25%, 50%, 75%, 100%.
- Labels: 10px, color `#94859f`, centered on each axis.

**WinMix mapping:** H2H comparison, team strength comparison, predictor candidate comparison.

### 3.5 AreaChart

Smoothed line chart for trends over time.

- SVG, 430×100 viewBox, `preserveAspectRatio: none`.
- Two paths (home/away) with gradient fill under the first.
- X-axis labels: 0′, 15′, 30′, HT, 60′, 75′, 90′.
- 8px labels, color `#726180`.

**WinMix mapping:** Calibration trend, ledger profit curve, rolling accuracy window, Poisson strength trend.

### 3.6 DonutChart

Win/draw/loss or outcome distribution chart.

- 144px diameter, conic-gradient based.
- Inner label: total count + "MATCHES" caption.
- Legend below: colored dot + label.

**WinMix mapping:** Team form, outcome distribution, market hit rate breakdown.

### 3.7 StatBars

Paired horizontal comparison bars.

- Each row: label centered between two values.
- Bar height: 4px, gap 3px.
- Left bar: `#a374cf` (home/purple).
- Right bar: `#4b9b83` (away/emerald).

**WinMix mapping:** Match statistics comparison, market performance comparison, calibration per-market.

### 3.8 StandingsTable

League table with positional ranking.

- Columns: #, Club, W, D, L, GF, GA, PTS.
- First row: highlighted with `background: rgba(168,85,247,0.043)`.
- Points column: font-weight 600, color `#d5aff4`.
- Club badge: 23×26px, rounded.

**WinMix mapping:** League standings in DataStudio and LeagueAnalyzer.

### 3.9 FixtureCard

Match card for predictions and fixtures.

- 3-column grid: home team | score | away team.
- Team: badge + name (12px, color `#cbb6dc`).
- Score: 20px, color `#ddbef7`, font-weight 500.
- Footer: round/group label, 9px, centered.

**WinMix mapping:** Predictor candidates, fixture list, H2H match cards.

### 3.10 Timeline

Horizontal match timeline with goal markers.

- Progress bar: 2px height, `#a275c9`.
- Goal markers: 18px circles, `#251533` bg, `#9873b6` border.
- X-axis: KICK-OFF / HALF TIME / 90′.

**WinMix mapping:** Match event timeline in H2H, prediction timeline.

### 3.11 ChipTabs

Pill-style tab switcher for secondary filtering.

- Buttons: 11px, border `1px solid rgba(255,255,255,0.0c)`, radius 5px.
- Active: `background: rgba(168,85,247,0.1)`, color `#d8b3fc`, border `#a855f73c`.
- Horizontal scroll on overflow.

**WinMix mapping:** Half selector (1st/2nd half), market pool selector, eval window selector, team selector.

### 3.12 HeatPitch

Heatmap overlay on a football pitch.

- Aspect-ratio 1.6, radial gradient hotspots.
- Pitch markings: border, center line, center circle.

**WinMix mapping:** Field presence/pressure zones, attack distribution.

### 3.13 LineupPitch

Formation visualization on a pitch.

- 4-3-3 layout (or configurable).
- Player markers: 29px circles with number + name.
- Pitch stripes: `repeating-linear-gradient`.

**WinMix mapping:** Not directly applicable (virtual football), but the pitch visual can be reused for fixture/match positioning diagrams.

### 3.14 EmptyState

Centered empty placeholder.

- Icon (search), 18px margin.
- Title: 18px, color `#ded0ea`.
- Description: 14px.
- Action button below.

**WinMix mapping:** All six pages need empty states when no data is loaded.

### 3.15 Toast

Non-intrusive notification.

- Fixed bottom-center, 13px, rounded 9px.
- Background: `#20142cef`, border `1px solid #a855f754`.
- Color: `#dec8f0`.
- Fade-in transition.

**WinMix mapping:** Already exists via `sonner`; restyle to match.

---

## 4. Page-by-Page Implementation Guide

### 4.1 DataStudio (Tactical Studio & Database)

**Demo reference:** The "Match centre" view with sidebar, match table, and match summary strip.

**Layout:**
- Top: MetricStrip with 4 KPIs (Seasons, Matches, Accuracy, Coverage).
- Main: Two-panel layout:
  - Left: SeasonPills + match table (TrackTable) with status tabs (All / Live / Finished → All / Imported / Pending).
  - Right: Selected match detail or standings panel.
- Bottom: StandingsTable + Poisson strength chart (AreaChart).

**Components to use:** MetricStrip, TrackTable, StandingsTable, AreaChart, ChipTabs (league selector), EmptyState.

**Key interactions:**
- League switch (English/Spanish) → ChipTabs at top.
- CSV/JSON import → button in heading area, opens ImportPreviewModal (already exists, restyle).
- Search teams → compact search field in toolbar.
- Table row click → loads detail in right panel or modal.

**Empty state:** "No data loaded" with import CTA button.

### 4.2 FixturePredictor (Round Predictor)

**Demo reference:** The "Match overview" / lineups view with fixture cards and game headers.

**Layout:**
- Top: MetricStrip (Top Home, Top Away, Avg Confidence, Slip Count).
- Main: Two-column grid:
  - Left column: Top 3 home candidates as FixtureCards.
  - Right column: Top 3 away candidates as FixtureCards.
- Each card shows: teams, predicted score, outcome probabilities (mini donut or bars), confidence badge.
- Bottom: SlipPanel (existing) restyled as a DataCard.

**Components to use:** FixtureCard, DonutChart (outcome probability), StatBars (market comparison), MetricStrip, ChipTabs (round selector).

**Key interactions:**
- Round selector → ChipTabs or compact select.
- Click a fixture → opens detail modal with RadarChart + StatBars.
- Add to slip → heart/follow button (reuse demo's favorite-button pattern).

**Empty state:** "No predictions available — load data and run the pipeline first."

### 4.3 LeagueAnalyzer

**Demo reference:** The "Club summary" and "Statistics" views combined.

**Layout:**
- Top: MetricStrip (Teams, Matches, Goals/Game, Avg BTT%).
- Main: AnalyticsGrid (2-column):
  - Card 1: StandingsTable (with league filter).
  - Card 2: Team form donuts (DonutChart per team or selected team).
  - Card 3 (wide): Pattern performance table or area chart.
  - Card 4: RadarChart for selected team comparison.
  - Card 5: StatBars for league-wide statistics.

**Components to use:** StandingsTable, DonutChart, RadarChart, AreaChart, StatBars, MetricStrip, ChipTabs.

**Key interactions:**
- Team picker → horizontal scroll bar of club badges (club-picker pattern from demo).
- League filter → compact select.
- Pattern list → TrackTable with pattern name, hit rate, sample size.

**Empty state:** "No league data — import a season to begin analysis."

### 4.4 PipelineAudit (Pipeline v2 Audit & Telemetry)

**Demo reference:** The "Statistics" view with metric strip, radar chart, area chart, and bar charts.

**Layout:**
- Top: MetricStrip (Brier Score, LogLoss, ECE, Skill vs B1).
- Main: AnalyticsGrid:
  - Card 1: Calibration verdict bar (horizontal bar showing calibration quality).
  - Card 2 (wide): Reliability diagram (AreaChart with diagonal reference line).
  - Card 3: Outcome distribution (DonutChart).
  - Card 4: Per-market calibration (StatBars for each market).
  - Card 5: Rolling window accuracy (AreaChart, 100-match windows).
  - Card 6: Core evidence/tiering suite status (TrackTable with pass/fail badges).

**Components to use:** MetricStrip, AreaChart, DonutChart, StatBars, TrackTable, ChipTabs (eval window selector), CalibrationVerdictBar (existing, restyle).

**Key interactions:**
- Eval window selector → ChipTabs (50/100/200 match windows).
- Market selector → ChipTabs or compact select.
- Core suite tabs → existing tab pattern, restyled as chip-tabs.

**Empty state:** "No audit data — run the pipeline to generate calibration metrics."

### 4.5 PipelineOperationsDashboard (Pipeline Operations)

**Demo reference:** The "Settings" view with toggle cards, plus the sidebar workspace controls.

**Layout:**
- Top: MetricStrip (Team Count, Weighted Teams, Pipeline Status, Last Run).
- Main: Single-column stack of DataCards:
  - Card 1: Team weight slider table (TrackTable with inline sliders).
  - Card 2: Auto-weight suggestion (button to apply, with before/after StatBars).
  - Card 3: Pipeline settings (toggle rows, styled like the demo's settings-card).
  - Card 4: Cloud tier status (connection indicator, cross-check results).
  - Card 5: Checkpoint info (compact data display).

**Components to use:** MetricStrip, DataCard, TrackTable, StatBars, ChipTabs (league selector for weights).

**Key interactions:**
- Weight slider → range input with live preview.
- Apply auto-weights → button with confirmation toast.
- Cloud tier → status badge (connected = emerald, offline = muted).
- Settings toggles → styled like demo's settings-card rows.

**Empty state:** "No data loaded — import seasons to configure pipeline operations."

### 4.6 PredictionLedger (Tip Ledger & Feedback)

**Demo reference:** The "Profile" view with metric strip, plus the match table for ledger entries.

**Layout:**
- Top: MetricStrip (Total Tips, Hit Rate, Profit/Loss, Avg Odds).
- Main: Two-panel:
  - Left: LedgerTable (TrackTable) with status tabs (All / Open / Settled).
  - Right: Market feedback panel:
    - Card 1: Per-market hit rate (StatBars).
    - Card 2: Profit trend (AreaChart).
    - Card 3: Market calibration gap (DonutChart or StatBars).
    - Card 4: Wilson interval display (compact data card).

**Components to use:** MetricStrip, TrackTable, AreaChart, StatBars, DonutChart, ChipTabs (market selector, status tabs), EmptyState.

**Key interactions:**
- Status tabs → All / Open / Settled (tab pattern from demo).
- Market selector → ChipTabs.
- Export ledger → button in heading area.
- Settle result → row action button, opens inline entry or modal.

**Empty state:** "No tips recorded — start adding predictions to your ledger."

---

## 5. Micro-Interactions & Animations

### 5.1 Hero / Page Entry

- Page heading words: mask reveal (translateY 110% → 0, opacity 0 → 1, stagger 0.16s).
- Cards: fade-up (translateY 25px → 0, opacity 0 → 1, stagger 0.12s).
- Use `prefers-reduced-motion` to disable all animations.

### 5.2 Hover States

- Table rows: `background: rgba(255,255,255,0.035)` transition 0.2s.
- Cards: subtle background lift (not transform — keep it understated for a data tool).
- Buttons: `translateY(-2px)` on hover, 0.2s transition.
- Chip tabs: background + border color change, 0.2s.
- Fixture cards: border brightening, 0.3s.

### 5.3 Floating Decorative Elements

The demo uses floating cards (collaborator-card, activity-card) around the dashboard shell. For WinMix, these are optional decorative elements on the landing/hero area only — not on data-heavy pages. If used:
- Float animation: `translateY(10px)`, 4.5s, repeat, yoyo, sine easing.
- Hidden below 1100px viewport.
- Pointer-events: none.

### 5.4 Transitions

- View switching: fade content area (opacity transition).
- Tab switching: instant content swap with underline slide.
- Modal/dialog: `showModal()` with backdrop blur, scale-in.
- Toast: fade + translateY, 0.25s.

---

## 6. Responsive Strategy

### 6.1 Desktop (≥1100px)

Full two-panel layout with sidebar visible. Analytics grids in 2 columns. All decorative elements visible.

### 6.2 Tablet (801–1100px)

Sidebar narrower (185px). Analytics grids stay 2-column but with smaller gaps. Date columns hidden in tables. Floating cards hidden.

### 6.3 Mobile (≤800px)

- Sidebar hidden — replace with mobile view selector (dropdown at top of content area).
- Analytics grids collapse to single column.
- Metric strips: 4 columns → 2 columns on very small screens.
- Search field: icon-only, expands on focus.
- Tabs: scrollable, smaller font.

### 6.4 Small Mobile (≤600px)

- Table badges collapse to stacked position.
- Score cells shrink to 11px.
- All grids: single column.
- Heading: smaller (26px).
- Dialog: near full-width.

---

## 7. Accessibility

The demo establishes several accessibility patterns to preserve:

- **Skip link:** "Skip to content" link visible on focus.
- **ARIA roles:** `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`.
- **Keyboard navigation:** Arrow keys for tabs, Home/End for first/last tab, `/` shortcut for search focus.
- **Focus visible:** `outline: 2px solid #c084fc; outline-offset: 5px` on all interactive elements.
- **Screen reader labels:** `aria-label` on icon-only buttons, `sr-only` for decorative columns.
- **Reduced motion:** All animations disabled via `prefers-reduced-motion: reduce`.
- **Color contrast:** Text on dark backgrounds must maintain WCAG AA contrast (4.5:1 for body text, 3:1 for large text). The demo's `--muted` (#919097) on `--base` (#08080a) achieves ~4.6:1.

---

## 8. Implementation Order

### Phase 1: Foundation (shared)
1. Add Inter font to the app's font stack.
2. Create the color token system in Tailwind config (or CSS custom properties).
3. Build the shared `DashboardShell`, `TopLine`, `PageHeading`, `DataCard`, `MetricStrip` components.
4. Restyle `NavRail.tsx` to match the demo sidebar.

### Phase 2: Chart Components
5. Build `RadarChart`, `AreaChart`, `DonutChart`, `StatBars` as reusable React components (SVG-based, matching the demo's visual style).
6. Build `TrackTable`, `StandingsTable`, `FixtureCard` as table/card components.

### Phase 3: Page Restyling
7. Restyle `DataStudio.tsx` — highest traffic page, sets the visual standard.
8. Restyle `PredictionLedger.tsx` — similar table-centric layout.
9. Restyle `LeagueAnalyzer.tsx` — chart-heavy, validates chart components.
10. Restyle `PipelineAudit.tsx` — most complex telemetry page.
11. Restyle `PipelineOperationsDashboard.tsx` — settings/control page.
12. Restyle `FixturePredictor.tsx` — prediction cards, ties everything together.

### Phase 4: Polish
13. Add page-entry animations (fade-up for cards, mask reveal for headings).
14. Verify all empty states across pages.
15. Test responsive behavior at all breakpoints.
16. Verify accessibility (keyboard nav, screen reader, contrast).

---

## 9. Key Constraints

1. **Do not change existing data logic.** This is a visual/UX restyling task. All existing state management, pipeline computation, cloud tier logic, and data flow remain unchanged.
2. **Reuse existing components where possible.** The project already has `DataGrid`, `DataTable`, `Panel`, `PanelState`, `MetricCard`, `FixtureCard`, `SlipCard`, etc. Restyle them rather than creating parallel components.
3. **Keep the existing routing.** The TanStack Router setup and `NavRail` navigation must continue to work.
4. **No new dependencies for charts.** The demo's charts are pure SVG. Build them as lightweight React components — do not add Chart.js, D3, or Recharts.
5. **GSAP is optional.** The demo uses GSAP for hero animations. If added, it must be lazily loaded and respect `prefers-reduced-motion`. CSS transitions are preferred for page-level interactions.
6. **Bundle size matters.** The current bundle is ~1.33MB. Do not add large dependencies. SVG chart components are lightweight.
7. **Hungarian language UI.** The existing WinMix UI text is in Hungarian. Preserve all existing text — only the visual presentation changes.

---

## 10. Design Tokens Reference (CSS Custom Properties)

```css
:root {
  /* Base */
  --base: #08080a;
  --surface: rgba(255, 255, 255, 0.05);
  --stroke: rgba(255, 255, 255, 0.10);

  /* Text */
  --text: #f8fafc;
  --muted: #919097;
  --text-dim: #72657f;
  --text-card: #d7c9e4;
  --text-value: #d5b4f2;

  /* Accents */
  --purple: #a855f7;
  --purple-soft: #c084fc;
  --purple-bg: rgba(168, 85, 247, 0.1);
  --purple-border: rgba(168, 85, 247, 0.2);
  --emerald: #34d399;
  --emerald-soft: #64c4a3;
  --emerald-bg: rgba(16, 185, 129, 0.07);
  --loss: #665373;

  /* Surfaces */
  --dashboard-bg: #0c0b10ef;
  --sidebar-bg: linear-gradient(140deg, rgba(48,40,59,0.2), rgba(16,15,20,0.4) 70%);
  --card-bg: linear-gradient(140deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01));
  --card-border: rgba(255, 255, 255, 0.06);
  --shell-border: rgba(255, 255, 255, 0.3);
  --shell-bg: linear-gradient(130deg, rgba(242,228,255,0.13), rgba(255,255,255,0.05) 35%, rgba(185,144,250,0.13));

  /* Typography */
  --font-family: 'Inter', Arial, sans-serif;
  --font-heading-weight: 500;
  --font-heading-spacing: -1.15px;
  --font-body-size: 14px;
  --font-body-line-height: 1.75;
  --font-label-size: 11px;
  --font-label-color: #8f7e9f;
  --font-eyebrow-size: 10px;
  --font-eyebrow-spacing: 1.3px;
  --font-table-header-size: 10px;
  --font-table-header-spacing: 1px;
  --font-table-cell-size: 12px;
  --font-value-size: 25px;
  --font-value-spacing: -1px;

  /* Radius */
  --radius-shell: 18px;
  --radius-dashboard: 11px;
  --radius-card: 8px;
  --radius-pill: 30px;
  --radius-tag: 4px;
}
```

---

## Summary

This document defines the complete visual and interaction specification for restyling WinMix Studio's six core pages to match the `newddesign` reference demo. The design language is a dark, glass-morphic analytics dashboard with purple/emerald team accents, Inter typography, SVG-based data visualizations, and a responsive sidebar-plus-content layout that collapses gracefully to mobile. The implementation should preserve all existing data logic, reuse existing React components where possible, and avoid heavy new dependencies.
