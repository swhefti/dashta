// GET /api/scores?horizon=3&mode=percentile
import { NextRequest, NextResponse } from 'next/server';
import { getAnonClient } from '../../../../shared/supabase';

// Freshness thresholds — must match src/scoring/freshness.ts
const FRESHNESS_THRESHOLDS: Record<string, { days: number; severity: 'blocked' | 'degraded'; missingBlocks: boolean }> = {
  prices:       { days: 1,  severity: 'blocked',  missingBlocks: true  },
  quotes:       { days: 1,  severity: 'blocked',  missingBlocks: false },
  fundamentals: { days: 30, severity: 'degraded', missingBlocks: false },
  sentiment:    { days: 3,  severity: 'degraded', missingBlocks: false },
  regime:       { days: 3,  severity: 'degraded', missingBlocks: false },
};

interface FreshnessIssue {
  source: string;
  days_stale: number;
  severity: 'blocked' | 'degraded';
}

function recomputeFreshness(
  sourceFreshness: Record<string, string | null> | null,
  runDate: string,
): { quality: 'healthy' | 'degraded' | 'blocked'; issues: FreshnessIssue[] } {
  if (!sourceFreshness) return { quality: 'healthy', issues: [] };

  const issues: FreshnessIssue[] = [];
  let quality: 'healthy' | 'degraded' | 'blocked' = 'healthy';

  for (const [source, { days, severity, missingBlocks }] of Object.entries(FRESHNESS_THRESHOLDS)) {
    const date = sourceFreshness[source] ?? null;
    if (!date) {
      if (missingBlocks) {
        quality = 'blocked';
        issues.push({ source, days_stale: 9999, severity: 'blocked' });
      }
      continue;
    }
    const staleDays = Math.floor(
      (new Date(runDate).getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (staleDays > days) {
      if (severity === 'blocked') quality = 'blocked';
      else if (quality !== 'blocked') quality = 'degraded';
      issues.push({ source, days_stale: staleDays, severity });
    }
  }

  return { quality, issues };
}

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

  // Load explanations for these tickers
  const { data: explanations } = await supabase
    .from('ticker_explanations')
    .select('ticker, explanation_text')
    .eq('time_horizon_months', horizon)
    .eq('scoring_mode', mode);

  const explMap = new Map<string, string>();
  if (explanations) {
    for (const e of explanations) explMap.set(e.ticker, e.explanation_text);
  }

  // Fallback: fill missing current_price from latest price_history close.
  // Some tickers added later never entered market_quotes but have full
  // daily history, so the scoring run wrote NULL price.
  const missingPriceTickers = (scores ?? [])
    .filter((s: any) => s.current_price == null)
    .map((s: any) => s.ticker);
  if (missingPriceTickers.length > 0) {
    const { data: phRows } = await supabase
      .from('price_history')
      .select('ticker, date, close')
      .in('ticker', missingPriceTickers)
      .order('date', { ascending: false });
    const fallback = new Map<string, number>();
    if (phRows) {
      for (const row of phRows) {
        const t = (row as any).ticker as string;
        if (!fallback.has(t) && (row as any).close != null) {
          fallback.set(t, Number((row as any).close));
        }
      }
    }
    if (scores) {
      for (const s of scores) {
        if ((s as any).current_price == null) {
          const fb = fallback.get((s as any).ticker);
          if (fb != null) (s as any).current_price = fb;
        }
      }
    }
  }

  // Load latest fundamentals per ticker for the modal stat grid
  const tickers = (scores ?? []).map((s: any) => s.ticker);
  const fundsMap = new Map<string, any>();
  if (tickers.length > 0) {
    const { data: funds } = await supabase
      .from('fundamental_data')
      .select('ticker, date, pe_ratio, ps_ratio, revenue_growth_yoy, profit_margin, roe, debt_to_equity')
      .in('ticker', tickers)
      .order('date', { ascending: false });
    if (funds) {
      // Keep only the latest row per ticker
      for (const f of funds) {
        if (!fundsMap.has(f.ticker)) fundsMap.set(f.ticker, f);
      }
    }
  }

  // Attach explanation + fundamentals to each score
  if (scores) {
    for (const s of scores) {
      const t = (s as any).ticker;
      (s as any).explanation = explMap.get(t) ?? null;
      const f = fundsMap.get(t);
      (s as any).fundamentals = f
        ? {
            pe_ratio: f.pe_ratio != null ? Number(f.pe_ratio) : null,
            ps_ratio: f.ps_ratio != null ? Number(f.ps_ratio) : null,
            revenue_growth_yoy: f.revenue_growth_yoy != null ? Number(f.revenue_growth_yoy) : null,
            profit_margin: f.profit_margin != null ? Number(f.profit_margin) : null,
            roe: f.roe != null ? Number(f.roe) : null,
            debt_to_equity: f.debt_to_equity != null ? Number(f.debt_to_equity) : null,
          }
        : null;
    }
  }

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

  // Recompute quality and issues on-the-fly so threshold changes take effect
  // immediately without needing a new scoring run.
  const { quality: computedQuality, issues: freshnessIssues } = recomputeFreshness(
    latestRun.source_freshness as Record<string, string | null> | null,
    latestRun.run_date,
  );

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
    run_quality: computedQuality,
    freshness_issues: freshnessIssues,
    confidence_distribution: confDist,
    available: true,
    scores: all,
  });
}
