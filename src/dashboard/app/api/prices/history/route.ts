// GET /api/prices/history?ticker=AAPL&range=30d
import { NextRequest, NextResponse } from 'next/server';
import { getAnonClient } from '../../../../../shared/supabase';

const RANGE_DAYS: Record<string, number> = {
  '7d': 10,
  '30d': 45,
  '3m': 95,
};

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker');
  const range = request.nextUrl.searchParams.get('range') ?? '30d';

  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });

  const limit = RANGE_DAYS[range] ?? 45;

  const supabase = getAnonClient();
  const { data, error } = await supabase
    .from('price_history')
    .select('date, open, high, low, close, volume')
    .eq('ticker', ticker)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).reverse();

  return NextResponse.json({
    ticker,
    range,
    count: rows.length,
    prices: rows,
  });
}
