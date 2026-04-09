// GET /api/scores?horizon=3&mode=percentile
import { NextRequest, NextResponse } from 'next/server';
import { getAnonClient } from '../../../../shared/supabase';

export async function GET(request: NextRequest) {
  const horizon = parseInt(request.nextUrl.searchParams.get('horizon') ?? '3', 10);
  const mode = request.nextUrl.searchParams.get('mode') ?? 'percentile';

  if (mode !== 'percentile' && mode !== 'absolute') {
    return NextResponse.json({ error: 'Invalid mode. Use "percentile" or "absolute".' }, { status: 400 });
  }

  const supabase = getAnonClient();

  const { data: latestRun } = await supabase
    .from('scoring_runs')
    .select('id, run_date')
    .eq('time_horizon_months', horizon)
    .eq('scoring_mode', mode)
    .eq('status', 'completed')
    .order('run_date', { ascending: false })
    .limit(1)
    .single();

  if (!latestRun) {
    return NextResponse.json({ error: 'No scoring data available', horizon, mode }, { status: 404 });
  }

  const { data: scores, error } = await supabase
    .from('ticker_scores')
    .select('*')
    .eq('scoring_run_id', latestRun.id)
    .order('ticker');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    run_date: latestRun.run_date,
    horizon,
    mode,
    count: scores?.length ?? 0,
    scores,
  });
}
