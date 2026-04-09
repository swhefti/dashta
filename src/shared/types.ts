// src/shared/types.ts — Core types for aiMATA v2

export type AssetClass = 'stock' | 'etf' | 'crypto';

export type ScoreType = 'risk' | 'upward_probability';

export interface Ticker {
  symbol: string;
  name: string;
  asset_class: AssetClass;
  sector?: string;
}

export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RiskSubScores {
  volatility: number;
  max_drawdown: number;
  beta: number;
  liquidity: number;
  fundamental_fragility: number;
}

export interface UpwardSubScores {
  trend_momentum: number;
  mean_reversion: number;
  fundamental_value: number;
  sentiment: number;
  macro_regime: number;
  seasonal: number;
}

export interface TickerScore {
  ticker: string;
  asset_class: AssetClass;
  time_horizon_months: number;
  risk_score: number;
  upward_probability_score: number;
  risk_sub_scores: RiskSubScores;
  upward_sub_scores: UpwardSubScores;
  market_cap: number | null;
  current_price: number;
  company_name: string;
  score_date: string;
}

export interface ScoringWeight {
  time_horizon_months: number;
  score_type: ScoreType;
  component: string;
  weight: number;
}

export interface ScoringRun {
  id: string;
  run_date: string;
  time_horizon_months: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  total_tickers?: number;
  error_message?: string;
}

// Dashboard-specific types
export interface BubbleData {
  ticker: string;
  company_name: string;
  asset_class: AssetClass;
  x: number; // risk_score
  y: number; // upward_probability_score
  r: number; // bubble radius (derived from market_cap)
  market_cap: number | null;
  current_price: number;
  risk_sub_scores: RiskSubScores;
  upward_sub_scores: UpwardSubScores;
}

export interface ScoringConfig {
  time_horizon_months: number;
  lookback_days: number; // computed: floor(1.5 × horizon × 21)
  risk_weights: Record<keyof RiskSubScores, number>;
  upward_weights: Record<keyof UpwardSubScores, number>;
}
