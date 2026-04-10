// GET /api/scores?horizon=3&mode=percentile
import { NextRequest, NextResponse } from 'next/server';
import { getAnonClient } from '../../../../shared/supabase';

export async function GET(request: NextRequest) {
  const horizon = parseInt(request.nextUrl.searchParams.get('horizon') ?? '3', 10);
  const mode = request.nextUrl.searchParams.get('mode') ?? 'percentile';

  if (mode !== 'percentile' && mode !== 'absolute') {
    return NextResponse.json({ error: 'Invalid mode.' }, { status: 400 });
  }

  const supabase = getAnonClient();

  const { data: latestRun } = await supabase
    .from('scoring_runs')
    .select('id, run_date, started_at, completed_at, scoring_mode, source_freshness, run_quality')
    .eq('time_horizon_months', horizon)
    .eq('scoring_mode', mode)
    .eq('status', 'completed')
    .order('run_date', { ascending: false })
    .limit(1)
    .single();

  if (!latestRun) {
    return NextResponse.json({
      error: `No ${horizon}mo ${mode} scores available yet.`,
      horizon, mode, available: false,
    }, { status: 200 });
  }

  const { data: scores, error } = await supabase
    .from('ticker_scores')
    .select('*')
    .eq('scoring_run_id', latestRun.id)
    .order('ticker');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all = scores ?? [];
  const factorFields = [
    'volatility_score', 'max_drawdown_score', 'beta_score', 'liquidity_risk_score',
    'fundamental_fragility_score', 'trend_momentum_score', 'mean_reversion_score',
    'fundamental_value_score', 'sentiment_score', 'macro_regime_score', 'seasonal_score',
  ];
  let totalF = 0, availF = 0;
  for (const s of all) { for (const f of factorFields) { totalF++; if ((s as any)[f] != null) availF++; } }

  // Confidence distribution
  const confDist = { high: 0, medium: 0, low: 0 };
  for (const s of all) {
    const label = (s as any).confidence_label;
    if (label === 'high') confDist.high++;
    else if (label === 'medium') confDist.medium++;
    else confDist.low++;
  }

  return NextResponse.json({
    run_date: latestRun.run_date,
    scored_at: latestRun.completed_at,
    horizon, mode,
    count: all.length,
    coverage: {
      total: all.length,
      with_price: all.filter((s: any) => s.current_price != null).length,
      with_market_cap: all.filter((s: any) => s.market_cap != null).length,
      with_fundamental_value: all.filter((s: any) => s.fundamental_value_score != null).length,
      with_sentiment: all.filter((s: any) => s.sentiment_score != null).length,
    },
    factor_completeness: totalF > 0 ? Math.round((availF / totalF) * 100) : 0,
    source_freshness: latestRun.source_freshness ?? null,
    run_quality: latestRun.run_quality ?? 'healthy',
    confidence_distribution: confDist,
    available: true,
    scores: all,
  });
}
