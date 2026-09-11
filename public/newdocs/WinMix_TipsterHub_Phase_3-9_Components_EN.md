# 🧩 WinMix Tipster Hub -- Component List (Phases 3--9)

## 📦 Phase 3: Scheduled Jobs & Automation

### Database Components

1.  **`scheduled_jobs` table** -- Stores scheduled tasks (job name,
    type, cron schedule, enabled status, last run time, next run time)
2.  **`job_execution_logs` table** -- Logs of job executions
    (started_at, completed_at, status, duration, errors, number of
    records processed)

### API Endpoints

3.  **`/api/jobs/list`** -- Lists all jobs (type, description, schedule,
    status, last/next run)
4.  **`/api/jobs/logs`** -- Retrieves job execution logs (filterable by
    job_id, with limit parameter)
5.  **`/api/jobs/trigger`** -- Manually trigger a job (with optional
    `force` parameter for immediate execution)
6.  **`/api/jobs/toggle`** -- Enable/disable a job (based on job_id and
    enabled flag)
7.  **`/api/jobs/scheduler`** -- Cron scheduler endpoint (called by
    Vercel Cron to check and start due jobs)

### Frontend Components

8.  **`ScheduledJobsPanel` component** -- Displays a list of jobs with
    enable/disable switches, manual triggers, and real-time status
    updates
9.  **`JobStatusCard` component** -- Individual job status card (name,
    status badge, last/next run, duration, enable switch, Run Now and
    View Logs buttons)

------------------------------------------------------------------------

## 📈 Phase 4: Feedback Loop & Model Evaluation

### Database Components

10. **`predictions` table** -- Stores predictions (predicted winner,
    goals, BTTS, confidence, CSS score, actual results and accuracy
    metrics filled later)
11. **`model_performance` table** -- Aggregated model performance data
    (by time period, accuracy metrics, confidence calibration,
    per-league breakdown)
12. **`model_comparison` table** -- Compares two models (accuracy
    difference, statistical significance p-value, winning model)

### API Endpoints

13. **`/api/predictions/track`** -- Save prediction (match_id,
    predicted_winner, confidence, CSS score, prediction factors)
14. **`/api/predictions/update-results`** -- Update results (match_id,
    actual_winner, actual_goals, auto accuracy computation)
15. **`/api/models/performance`** -- Retrieve model performance (model
    version, time range, overall/winner/BTTS accuracy, league breakdown,
    trend data)
16. **`/api/models/compare`** -- Compare two models (accuracy diff,
    statistical significance, sample size, breakdown)
17. **`/api/models/auto-prune`** -- Automatically prune low-performing
    features (below accuracy threshold)

### Frontend Components

18. **`/app/analytics/page.tsx`** -- Analytics dashboard (overall
    performance, model comparison, accuracy breakdown, confidence
    calibration, league performance)
19. **`ModelPerformanceChart` component** -- Line chart showing model
    performance over time (accuracy and confidence curves)

------------------------------------------------------------------------

## 🔍 Phase 5: Pattern Detection

### Database Components

20. **`team_patterns` table** -- Detected team patterns (pattern
    type/name, confidence, strength, valid_from/until, prediction
    impact, historical accuracy)
21. **`pattern_definitions` table** -- Predefined pattern definitions
    (detection query/function, min sample size, min confidence,
    priority)

### API Endpoints

22. **`/api/patterns/detect`** -- Detect patterns (team_name, league_id,
    pattern_types filters, returns detected patterns list)
23. **`/api/patterns/team/{teamName}`** -- Team's active and expired
    patterns (pattern name/description, confidence, strength,
    pattern-specific data)
24. **`/api/patterns/verify`** -- Verify a pattern (re-run detection
    logic based on pattern_id, refresh validity)

### Frontend Components

25. **`TeamPatternsSection` component** -- Displays detected patterns on
    team detail page (list of patterns with PatternBadge components)
26. **`PatternBadge` component** -- Visual badge per pattern
    (color-coded by type: winning streak, home dominance, high scoring,
    defensive solid, with tooltip info)

### Detection Algorithms

27. **`detectStreak()`** -- Detects win/loss streaks (3+ consecutive
    wins/losses, calculates confidence and strength)
28. **`detectHomeDominance()`** -- Detects home dominance (70%+ home win
    rate, avg goals scored/conceded)
29. **`detectHighScoring()`** -- Detects high scoring trend (3+ avg
    goals/match in last 5)
30. **`detectFormSurge()`** -- Detects form surge (30%+ form index
    increase over last 3 vs previous 3 matches)

------------------------------------------------------------------------

## 🏆 Phase 6: Champion/Challenger Framework

### Database Components

31. **`model_registry` table** -- Registered models (name/version, type:
    champion/challenger/retired, algorithm, hyperparameters, traffic
    allocation, accuracy)
32. **`model_experiments` table** -- Model experiments (champion vs
    challenger, target sample size, significance threshold, accuracy
    diff, p-value, winner, decision)
33. **`predictions` table update** -- Added model_id, model_name,
    model_version, is_shadow_mode columns

### API Endpoints

34. **`/api/models/register`** -- Register new model (name/version,
    type, algorithm, hyperparameters, traffic allocation)
35. **`/api/models/select`** -- Select model via Epsilon-Greedy (90%
    champion, 10% challenger, exploration rate)
36. **`/api/models/shadow-run`** -- Run both models in shadow mode (only
    champion's predictions shown)
37. **`/api/models/promote`** -- Promote challenger → champion (demote
    previous champion → retired, register new challenger)
38. **`/api/experiments/create`** -- Start new experiment (champion vs
    challenger, target sample size, duration)
39. **`/api/experiments/evaluate`** -- Evaluate experiment (Chi-Square
    test, significance, decision: promote/keep/continue)

### Frontend Components

40. **`/app/models/page.tsx`** -- Model management dashboard (active
    models, comparison charts, traffic pie chart, experiments table,
    promote button)
41. **`ModelCard` component** -- Model card (name, version, algorithm,
    accuracy, prediction count, traffic %, champion/challenger badge,
    View Details)

------------------------------------------------------------------------

## 🌍 Phase 7: Cross-League Intelligence

### Database Components

42. **`cross_league_correlations` table** -- Inter-league correlations
    (league_a/b_id, type, coefficient, Pearson correlation -1 to 1,
    p-value, insight summary)
43. **`meta_patterns` table** -- Meta-patterns across leagues (pattern
    name/type, supporting leagues, evidence strength, prediction impact)
44. **`league_characteristics` table** -- League characteristics (avg
    goals, home advantage, balance index, predictability, physicality,
    trends)

### API Endpoints

45. **`/api/cross-league/correlations`** -- Retrieve correlations
    (league_a/b, filters, coefficient, strength, recommendations)
46. **`/api/cross-league/analyze`** -- Compare leagues (metrics array,
    rankings, insights)
47. **`/api/meta-patterns/discover`** -- Discover meta-patterns (min
    leagues, min evidence, pattern list with impact)
48. **`/api/meta-patterns/apply`** -- Apply meta-pattern (pattern_id,
    match_id, adjusted predictions)

### Frontend Components

49. **`/app/cross-league/page.tsx`** -- Cross-league dashboard
    (comparison matrix, radar chart, meta-patterns list, insights)
50. **`LeagueComparisonRadarChart`** -- Radar chart comparing leagues
    (scoring, home advantage, predictability, balance)
51. **`CorrelationHeatmap`** -- Heatmap showing league-to-league
    correlations

### Algorithms

52. **`analyzeCrossLeagueCorrelation()`** -- Calculates correlations
    (Pearson coefficient, p-value, insight generation)
53. **`discoverMetaPatterns()`** -- Discovers meta-patterns (form
    impact, underdog analysis, unpredictability patterns)

------------------------------------------------------------------------

## 📊 Phase 8: Monitoring & Visualization

### Database Components

54. **`system_health` table** -- System monitoring (component name/type,
    status, response time, error rate, CPU/memory usage)
55. **`performance_metrics` table** -- Performance metrics (metric
    name/type/category, value, unit, component)
56. **`computation_graph` table** -- Computation graph nodes (id, name,
    type, dependencies, execution time, position, status)

### API Endpoints

57. **`/api/monitoring/health`** -- Get system health (component
    statuses, response time, errors, summary)
58. **`/api/monitoring/metrics`** -- Retrieve performance metrics
    (filters, time-based aggregation)
59. **`/api/monitoring/computation-graph`** -- Retrieve computation
    graph (nodes and edges with statuses)
60. **`/api/monitoring/alerts`** -- Get system alerts (severity,
    message, component, triggered_at, acknowledged)

### Frontend Components

61. **`/app/monitoring/page.tsx`** -- Monitoring dashboard (system
    health, metrics, computation map, real-time data)
62. **`ComputationMapDashboard`** -- Interactive React Flow graph (nodes
    colored by health, hover/click details)
63. **`SystemHealthCard`** -- Summary card of system status
64. **`PerformanceMetricsChart`** -- Line chart showing response time
    distributions (p50/p95/p99)

------------------------------------------------------------------------

## 🚀 Phase 9: Advanced Features

### 9.1 Collaborative Intelligence

65. **`user_predictions` table** -- Stores user predictions (user_id,
    match_id, predicted_winner/goals, confidence, actual_winner,
    was_correct)
66. **`crowd_wisdom` table** -- Aggregates crowd predictions (match_id,
    user vs model predictions, divergence_score)
67. **`POST /api/predictions/user`** -- Save user prediction
68. **`GET /api/predictions/crowd/{matchId}`** -- Get crowd wisdom
    (aggregated user vs model predictions)
69. **UserPredictionForm** -- Component for submitting predictions
    (winner, goals, confidence slider)
70. **CrowdWisdomDisplay** -- "85% of users predict home win" with
    divergence indicator

### 9.2 Market Integration

71. **`market_odds` table** -- Stores bookmaker odds (home/draw/away,
    over_2.5, BTTS, implied probabilities)
72. **`value_bets` table** -- Detects value bets (bet type, model vs
    market probability, expected value, Kelly Criterion, rating)
73. **`GET /api/market/odds/{matchId}`** -- Retrieve odds from external
    API
74. **`GET /api/market/value-bets`** -- Value bet list (ranked by
    rating)
75. **MarketOddsDisplay** -- Displays bookmaker odds
76. **ValueBetHighlights** -- Highlights high-value bets (color-coded,
    with Kelly calculator)

### 9.3 Temporal Decay

77. **`information_freshness` table** -- Tracks information freshness
    (team_name, info_type, last_updated_at, decay_rate, freshness 0--1)
78. **`calculateFreshness()`** -- Computes exponential decay
79. **`checkAndRefreshStaleData()`** -- Scheduled job to refresh
    outdated data automatically

### 9.4 Self-Improving System

80. **`feature_experiments` table** -- Tracks feature experiments
    (logic, baseline vs with-feature accuracy, significance)
81. **`generateNewFeatures()`** -- Auto feature engineering (polynomial,
    interaction, ratio, rolling averages)
82. **`testFeature()`** -- A/B test for new features (auto-approve if
    \>2% improvement & p\<0.05)
83. **`continuousLearning()`** -- Scheduled continuous learning pipeline
    (generate, test, prune, retrain, deploy)

------------------------------------------------------------------------

## 📊 Summary Statistics

-   **Total components:** 83\
-   **Database tables:** 15 new + 1 extension\
-   **API Endpoints:** 30+\
-   **Frontend Components/Pages:** 15+\
-   **Algorithms/Functions:** 20+\
-   **Phases covered:** 7 (Phases 3--9)\
-   **Estimated implementation time:** \~14.5 weeks (≈3.5 months)
