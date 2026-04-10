// GET /api/scores/history?ticker=AAPL&horizon=3&mode=percentile
// Returns score history for a single ticker across scoring runs.
import { NextRequest, NextResponse } from 'next/server';
import { getAnonClient } from '../../../../../shared/supabase';

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker');
  const horizon = parseInt(request.nextUrl.searchParams.get('horizon') ?? '3', 10);
  const mode = request.nextUrl.searchParams.get('mode') ?? 'percentile';

  if (!ticker) {
    return NextResponse.json({ error: 'ticker parameter required' }, { status: 400 });
  }

  const supabase = getAnonClient();

  const { data, error } = await supabase
    .from('ticker_scores')
    .select('score_date, risk_score, upward_probability_score, scoring_mode')
    .eq('ticker', ticker)
    .eq('time_horizon_months', horizon)
    .eq('scoring_mode', mode)
    .order('score_date', { ascending: true })
    .limit(90); // last 90 days max

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ticker,
    horizon,
    mode,
    history: data ?? [],
  });
}
