-- Migration 002: Seed default scoring weights
-- These can be adjusted in the database without code changes

-- Risk weights: 3-month horizon
INSERT INTO scoring_weights (time_horizon_months, score_type, component, weight) VALUES
  (3, 'risk', 'volatility', 0.300),
  (3, 'risk', 'max_drawdown', 0.250),
  (3, 'risk', 'beta', 0.150),
  (3, 'risk', 'liquidity', 0.150),
  (3, 'risk', 'fundamental_fragility', 0.150);

-- Risk weights: 6-month horizon
INSERT INTO scoring_weights (time_horizon_months, score_type, component, weight) VALUES
  (6, 'risk', 'volatility', 0.280),
  (6, 'risk', 'max_drawdown', 0.220),
  (6, 'risk', 'beta', 0.150),
  (6, 'risk', 'liquidity', 0.150),
  (6, 'risk', 'fundamental_fragility', 0.200);

-- Risk weights: 12-month horizon
INSERT INTO scoring_weights (time_horizon_months, score_type, component, weight) VALUES
  (12, 'risk', 'volatility', 0.250),
  (12, 'risk', 'max_drawdown', 0.200),
  (12, 'risk', 'beta', 0.150),
  (12, 'risk', 'liquidity', 0.150),
  (12, 'risk', 'fundamental_fragility', 0.250);

-- Upward probability weights: 3-month horizon
INSERT INTO scoring_weights (time_horizon_months, score_type, component, weight) VALUES
  (3, 'upward_probability', 'trend_momentum', 0.250),
  (3, 'upward_probability', 'mean_reversion', 0.150),
  (3, 'upward_probability', 'fundamental_value', 0.200),
  (3, 'upward_probability', 'sentiment', 0.200),
  (3, 'upward_probability', 'macro_regime', 0.100),
  (3, 'upward_probability', 'seasonal', 0.100);

-- Upward probability weights: 6-month horizon
INSERT INTO scoring_weights (time_horizon_months, score_type, component, weight) VALUES
  (6, 'upward_probability', 'trend_momentum', 0.200),
  (6, 'upward_probability', 'mean_reversion', 0.120),
  (6, 'upward_probability', 'fundamental_value', 0.250),
  (6, 'upward_probability', 'sentiment', 0.200),
  (6, 'upward_probability', 'macro_regime', 0.100),
  (6, 'upward_probability', 'seasonal', 0.130);

-- Upward probability weights: 12-month horizon
INSERT INTO scoring_weights (time_horizon_months, score_type, component, weight) VALUES
  (12, 'upward_probability', 'trend_momentum', 0.150),
  (12, 'upward_probability', 'mean_reversion', 0.100),
  (12, 'upward_probability', 'fundamental_value', 0.300),
  (12, 'upward_probability', 'sentiment', 0.200),
  (12, 'upward_probability', 'macro_regime', 0.100),
  (12, 'upward_probability', 'seasonal', 0.150)
ON CONFLICT (time_horizon_months, score_type, component) DO UPDATE 
  SET weight = EXCLUDED.weight, updated_at = now();
