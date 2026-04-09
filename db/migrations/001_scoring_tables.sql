-- Migration 001: Create scoring tables for aiMATA v2
-- Run in Supabase SQL editor or via MCP

-- Track each scoring pipeline execution
CREATE TABLE IF NOT EXISTS scoring_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL,
  time_horizon_months INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_tickers INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scoring_runs_date_horizon 
  ON scoring_runs(run_date, time_horizon_months);

-- Core output: one row per ticker per scoring run
CREATE TABLE IF NOT EXISTS ticker_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scoring_run_id UUID REFERENCES scoring_runs(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  time_horizon_months INTEGER NOT NULL,
  
  -- Composite scores (plotted on the chart)
  risk_score NUMERIC(5,2) NOT NULL,
  upward_probability_score NUMERIC(5,2) NOT NULL,
  
  -- Risk sub-scores
  volatility_score NUMERIC(5,2),
  max_drawdown_score NUMERIC(5,2),
  beta_score NUMERIC(5,2),
  liquidity_risk_score NUMERIC(5,2),
  fundamental_fragility_score NUMERIC(5,2),
  
  -- Upward probability sub-scores
  trend_momentum_score NUMERIC(5,2),
  mean_reversion_score NUMERIC(5,2),
  fundamental_value_score NUMERIC(5,2),
  sentiment_score NUMERIC(5,2),
  macro_regime_score NUMERIC(5,2),
  seasonal_score NUMERIC(5,2),
  
  -- Display data
  market_cap BIGINT,
  current_price NUMERIC(12,4),
  company_name TEXT,
  
  -- Metadata
  score_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticker_scores_run ON ticker_scores(scoring_run_id);
CREATE INDEX IF NOT EXISTS idx_ticker_scores_date_horizon ON ticker_scores(score_date, time_horizon_months);
CREATE INDEX IF NOT EXISTS idx_ticker_scores_ticker ON ticker_scores(ticker);

-- Configurable weights per time horizon
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

-- Enable RLS but allow service role full access
ALTER TABLE scoring_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticker_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_weights ENABLE ROW LEVEL SECURITY;

-- Policies for anon (frontend read-only)
CREATE POLICY "Allow anon read scoring_runs" ON scoring_runs FOR SELECT USING (true);
CREATE POLICY "Allow anon read ticker_scores" ON ticker_scores FOR SELECT USING (true);
CREATE POLICY "Allow anon read scoring_weights" ON scoring_weights FOR SELECT USING (true);
