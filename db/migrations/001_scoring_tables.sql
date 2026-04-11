-- Migration 001: Create scoring tables for aiMATA v2
-- Idempotent — safe to re-run against an already-migrated database.

CREATE TABLE IF NOT EXISTS scoring_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL,
  time_horizon_months INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_tickers INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  scoring_mode TEXT NOT NULL DEFAULT 'percentile' CHECK (scoring_mode IN ('percentile', 'absolute'))
);

-- Add scoring_mode if upgrading from pre-dual-mode schema
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scoring_runs' AND column_name = 'scoring_mode'
  ) THEN
    ALTER TABLE scoring_runs ADD COLUMN scoring_mode TEXT NOT NULL DEFAULT 'percentile'
      CHECK (scoring_mode IN ('percentile', 'absolute'));
  END IF;
END $$;

-- Freshness + quality columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scoring_runs' AND column_name='source_freshness') THEN
    ALTER TABLE scoring_runs ADD COLUMN source_freshness JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scoring_runs' AND column_name='run_quality') THEN
    ALTER TABLE scoring_runs ADD COLUMN run_quality TEXT DEFAULT 'healthy' CHECK (run_quality IN ('healthy','degraded','blocked'));
  END IF;
END $$;

-- Confidence columns on ticker_scores
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ticker_scores' AND column_name='confidence') THEN
    ALTER TABLE ticker_scores ADD COLUMN confidence NUMERIC(5,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ticker_scores' AND column_name='confidence_label') THEN
    ALTER TABLE ticker_scores ADD COLUMN confidence_label TEXT;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_scoring_runs_date_horizon;
CREATE UNIQUE INDEX IF NOT EXISTS idx_scoring_runs_date_horizon
  ON scoring_runs(run_date, time_horizon_months, scoring_mode);

CREATE TABLE IF NOT EXISTS ticker_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scoring_run_id UUID REFERENCES scoring_runs(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  time_horizon_months INTEGER NOT NULL,
  risk_score NUMERIC(5,2) NOT NULL,
  upward_probability_score NUMERIC(5,2) NOT NULL,
  volatility_score NUMERIC(5,2),
  max_drawdown_score NUMERIC(5,2),
  beta_score NUMERIC(5,2),
  liquidity_risk_score NUMERIC(5,2),
  fundamental_fragility_score NUMERIC(5,2),
  trend_momentum_score NUMERIC(5,2),
  mean_reversion_score NUMERIC(5,2),
  fundamental_value_score NUMERIC(5,2),
  sentiment_score NUMERIC(5,2),
  macro_regime_score NUMERIC(5,2),
  seasonal_score NUMERIC(5,2),
  market_cap BIGINT,
  current_price NUMERIC(12,4),
  company_name TEXT,
  score_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  scoring_mode TEXT NOT NULL DEFAULT 'percentile' CHECK (scoring_mode IN ('percentile', 'absolute'))
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticker_scores' AND column_name = 'scoring_mode'
  ) THEN
    ALTER TABLE ticker_scores ADD COLUMN scoring_mode TEXT NOT NULL DEFAULT 'percentile'
      CHECK (scoring_mode IN ('percentile', 'absolute'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ticker_scores_run ON ticker_scores(scoring_run_id);
CREATE INDEX IF NOT EXISTS idx_ticker_scores_date_horizon ON ticker_scores(score_date, time_horizon_months);
CREATE INDEX IF NOT EXISTS idx_ticker_scores_ticker ON ticker_scores(ticker);

CREATE TABLE IF NOT EXISTS scoring_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_horizon_months INTEGER NOT NULL,
  score_type TEXT NOT NULL CHECK (score_type IN ('risk', 'upward_probability')),
  component TEXT NOT NULL,
  weight NUMERIC(4,3) NOT NULL CHECK (weight >= 0 AND weight <= 1),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scoring_weights_unique
  ON scoring_weights(time_horizon_months, score_type, component);

-- Ticker explanations
CREATE TABLE IF NOT EXISTS ticker_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  time_horizon_months INTEGER NOT NULL,
  scoring_mode TEXT NOT NULL,
  latest_scoring_run_id UUID REFERENCES scoring_runs(id),
  explanation_text TEXT NOT NULL,
  explanation_version INTEGER NOT NULL DEFAULT 1,
  risk_score_snapshot NUMERIC(5,2),
  upward_score_snapshot NUMERIC(5,2),
  confidence_snapshot NUMERIC(5,2),
  run_quality_snapshot TEXT,
  driver_signature TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticker_explanations_unique
  ON ticker_explanations(ticker, time_horizon_months, scoring_mode);

-- RLS
ALTER TABLE scoring_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticker_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticker_explanations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anon read scoring_runs') THEN
    CREATE POLICY "Allow anon read scoring_runs" ON scoring_runs FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anon read ticker_scores') THEN
    CREATE POLICY "Allow anon read ticker_scores" ON ticker_scores FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anon read scoring_weights') THEN
    CREATE POLICY "Allow anon read scoring_weights" ON scoring_weights FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anon read ticker_explanations') THEN
    CREATE POLICY "Allow anon read ticker_explanations" ON ticker_explanations FOR SELECT USING (true);
  END IF;
END $$;
