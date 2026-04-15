// GET /api/brief?horizon=3&mode=percentile
// Builds the Daily Market Brief: today vs yesterday vs ~week-ago deltas,
// ranked into "What Improved", "What Got Riskier", "Large-Cap Moves".

import { NextRequest, NextResponse } from 'next/server';
import { getAnonClient } from '../../../../shared/supabase';

type ScoreRow = {
  ticker: string;
  asset_class: string;
  risk_score: number;
  upward_probability_score: number;
  confidence: number | null;
  confidence_label: string | null;
  market_cap: number | null;
  company_name: string | null;
};

type Run = {
  id: string;
  run_date: string;
  completed_at: string | null;
  run_quality: string | null;
  source_freshness: any;
};

type TickerDelta = {
  ticker: string;
  company_name: string | null;
  asset_class: string;
  market_cap: number | null;
  current: { risk: number; upward: number; confidence: number | null; confidenceLabel: string | null };
  daily: { upwardDelta: number | null; riskDelta: number | null };
  weekly: { upwardDelta: number | null; riskDelta: number | null };
  significance: number;
};

const DAY_MS = 86400000;

function pickRuns(runs: Run[]): { latest: Run | null; previous: Run | null; weekly: Run | null } {
  if (runs.length === 0) return { latest: null, previous: null, weekly: null };
  const latest = runs[0];
  const previous = runs[1] ?? null;
  // Pick the run closest to 7 days before latest, preferring 5-9 day window
  const latestMs = new Date(latest.run_date).getTime();
  let weekly: Run | null = null;
  let bestScore = -Infinity;
  for (let i = 1; i < runs.length; i++) {
    const r = runs[i];
    const ageDays = (latestMs - new Date(r.run_date).getTime()) / DAY_MS;
    if (ageDays < 4) continue;
    // Prefer 5-9 day range, but accept up to 14
    if (ageDays > 14) continue;
    const score = -Math.abs(ageDays - 7);
    if (score > bestScore) { bestScore = score; weekly = r; }
  }
  return { latest, previous, weekly };
}

async function loadScores(supabase: ReturnType<typeof getAnonClient>, runId: string): Promise<ScoreRow[]> {
  const { data } = await supabase
    .from('ticker_scores')
    .select('ticker, asset_class, risk_score, upward_probability_score, confidence, confidence_label, market_cap, company_name')
    .eq('scoring_run_id', runId);
  return (data as ScoreRow[] | null) ?? [];
}

function toMap(rows: ScoreRow[]): Map<string, ScoreRow> {
  const m = new Map<string, ScoreRow>();
  for (const r of rows) m.set(r.ticker, r);
  return m;
}

function confFactor(label: string | null, score: number | null): number {
  if (label === 'high') return 1.15;
  if (label === 'medium') return 1.0;
  if (label === 'low') return 0.75;
  if (score != null) return 0.75 + Math.max(0, Math.min(1, score / 100)) * 0.4;
  return 0.9;
}

function largeCapBonus(cap: number | null): number {
  if (!cap) return 0;
  if (cap >= 1e12) return 4;
  if (cap >= 2e11) return 3;
  if (cap >= 5e10) return 2;
  if (cap >= 1e10) return 1;
  return 0;
}

function weeklyConfirmBonus(daily: number | null, weekly: number | null): number {
  if (daily == null || weekly == null) return 0;
  if (Math.sign(daily) === Math.sign(weekly) && Math.abs(weekly) >= 2) {
    return Math.min(5, Math.abs(weekly) * 0.4);
  }
  // Contradiction: small penalty
  if (Math.sign(daily) !== 0 && Math.sign(daily) !== Math.sign(weekly) && Math.abs(weekly) >= 4) {
    return -2;
  }
  return 0;
}

function buildDeltas(
  latest: ScoreRow[],
  prev: Map<string, ScoreRow> | null,
  weekly: Map<string, ScoreRow> | null
): TickerDelta[] {
  return latest.map((cur) => {
    const p = prev?.get(cur.ticker);
    const w = weekly?.get(cur.ticker);
    const dailyUp = p ? cur.upward_probability_score - p.upward_probability_score : null;
    const dailyRisk = p ? cur.risk_score - p.risk_score : null;
    const weeklyUp = w ? cur.upward_probability_score - w.upward_probability_score : null;
    const weeklyRisk = w ? cur.risk_score - w.risk_score : null;

    const cf = confFactor(cur.confidence_label, cur.confidence);
    const lcb = largeCapBonus(cur.market_cap);

    const absUp = Math.abs(dailyUp ?? 0);
    const absRisk = Math.abs(dailyRisk ?? 0);
    const weeklyBonus =
      weeklyConfirmBonus(dailyUp, weeklyUp) * 0.7 +
      weeklyConfirmBonus(dailyRisk, weeklyRisk) * 0.7;

    const raw = absUp * 1.0 + absRisk * 0.8;
    const significance = (raw + weeklyBonus) * cf + lcb;

    return {
      ticker: cur.ticker,
      company_name: cur.company_name,
      asset_class: cur.asset_class,
      market_cap: cur.market_cap,
      current: {
        risk: cur.risk_score,
        upward: cur.upward_probability_score,
        confidence: cur.confidence,
        confidenceLabel: cur.confidence_label,
      },
      daily: { upwardDelta: dailyUp, riskDelta: dailyRisk },
      weekly: { upwardDelta: weeklyUp, riskDelta: weeklyRisk },
      significance,
    };
  });
}

function buildImproved(deltas: TickerDelta[]): TickerDelta[] {
  return deltas
    .filter((d) => d.daily.upwardDelta != null && d.daily.upwardDelta >= 2)
    .filter((d) => (d.daily.riskDelta ?? 0) < 5)
    .filter((d) => d.current.confidenceLabel !== 'low')
    .sort((a, b) => {
      const aw = (a.weekly.upwardDelta ?? 0) > -3 ? 0 : -3;
      const bw = (b.weekly.upwardDelta ?? 0) > -3 ? 0 : -3;
      return (b.daily.upwardDelta! * 1.5 + b.significance + bw) - (a.daily.upwardDelta! * 1.5 + a.significance + aw);
    })
    .slice(0, 4);
}

function buildRiskier(deltas: TickerDelta[]): TickerDelta[] {
  return deltas
    .filter((d) => {
      const r = d.daily.riskDelta ?? 0;
      const u = d.daily.upwardDelta ?? 0;
      return r >= 3 || (r >= 1.5 && u <= 0);
    })
    .sort((a, b) => {
      const aRisk = a.daily.riskDelta ?? 0;
      const bRisk = b.daily.riskDelta ?? 0;
      const aUpOff = Math.max(0, a.daily.upwardDelta ?? 0);
      const bUpOff = Math.max(0, b.daily.upwardDelta ?? 0);
      return (bRisk * 1.5 - bUpOff + b.significance) - (aRisk * 1.5 - aUpOff + a.significance);
    })
    .slice(0, 4);
}

function buildLargeCap(deltas: TickerDelta[]): TickerDelta[] {
  const largeCaps = deltas
    .filter((d) => d.market_cap != null && d.market_cap >= 5e10)
    .filter((d) => d.daily.upwardDelta != null || d.daily.riskDelta != null);
  return largeCaps
    .sort((a, b) => {
      const am = Math.abs(a.daily.upwardDelta ?? 0) + Math.abs(a.daily.riskDelta ?? 0) * 0.8;
      const bm = Math.abs(b.daily.upwardDelta ?? 0) + Math.abs(b.daily.riskDelta ?? 0) * 0.8;
      return (bm + b.significance * 0.3) - (am + a.significance * 0.3);
    })
    .slice(0, 4);
}

function buildHeadline(
  deltas: TickerDelta[],
  horizon: number,
  hasPrev: boolean,
  hasWeekly: boolean,
  runQuality: string | null
): { headline: string; sub: string | null } {
  if (!hasPrev) {
    return {
      headline: `First ${horizon}-month snapshot — no prior run yet to compare.`,
      sub: 'The delta view will come alive once a second run is available.',
    };
  }

  const withDaily = deltas.filter((d) => d.daily.upwardDelta != null);
  const up = withDaily.filter((d) => (d.daily.upwardDelta ?? 0) > 1).length;
  const down = withDaily.filter((d) => (d.daily.upwardDelta ?? 0) < -1).length;
  const riskUp = withDaily.filter((d) => (d.daily.riskDelta ?? 0) > 1).length;
  const total = withDaily.length || 1;

  const avgUp = withDaily.reduce((s, d) => s + (d.daily.upwardDelta ?? 0), 0) / total;
  const avgRisk = withDaily.reduce((s, d) => s + (d.daily.riskDelta ?? 0), 0) / total;

  const byClass = new Map<string, { up: number; total: number }>();
  for (const d of withDaily) {
    const k = d.asset_class;
    const e = byClass.get(k) ?? { up: 0, total: 0 };
    e.total++;
    e.up += d.daily.upwardDelta ?? 0;
    byClass.set(k, e);
  }
  const classAvg = [...byClass.entries()].map(([k, v]) => ({ k, avg: v.up / Math.max(1, v.total) }));
  const bestClass = classAvg.sort((a, b) => b.avg - a.avg)[0];
  const worstClass = classAvg.sort((a, b) => a.avg - b.avg)[0];

  const quiet = Math.abs(avgUp) < 0.6 && Math.abs(avgRisk) < 0.6 && up + down < total * 0.2;

  let headline: string;
  let sub: string | null = null;

  if (runQuality === 'degraded') {
    headline = 'Signals look mixed today — some source data is stale, so treat small moves with care.';
  } else if (quiet) {
    headline = 'The map barely moved today — a quiet session with only modest shifts across the field.';
    if (hasWeekly) sub = 'Weekly context is doing more of the talking than the daily move.';
  } else if (up > down * 1.5 && avgUp > 0.8) {
    headline = `Upward signals broadened${bestClass ? ` — ${prettyClass(bestClass.k)} led the improvement` : ''}.`;
    if (riskUp > total * 0.3) sub = 'Risk ticked higher for a notable slice of names, though, so not a clean rally.';
  } else if (down > up * 1.5 && avgUp < -0.8) {
    headline = `Upward momentum faded across the board${worstClass ? `, with ${prettyClass(worstClass.k)} softest` : ''}.`;
    if (avgRisk > 0.5) sub = 'Risk edged up at the same time — a defensive-leaning day.';
  } else if (avgRisk > 1 && avgUp < 0.5) {
    headline = 'Risk drifted higher without much offsetting upside — a cautious tone overall.';
  } else {
    headline = `Mixed session: roughly ${up} names improved, ${down} weakened${bestClass ? `; ${prettyClass(bestClass.k)} stood out` : ''}.`;
  }

  return { headline, sub };
}

function prettyClass(k: string): string {
  if (k === 'stock') return 'stocks';
  if (k === 'etf') return 'ETFs';
  if (k === 'crypto') return 'crypto';
  return k;
}

export async function GET(request: NextRequest) {
  const horizon = parseInt(request.nextUrl.searchParams.get('horizon') ?? '3', 10);
  const mode = request.nextUrl.searchParams.get('mode') ?? 'percentile';
  if (mode !== 'percentile' && mode !== 'absolute') {
    return NextResponse.json({ error: 'Invalid mode.' }, { status: 400 });
  }

  const supabase = getAnonClient();
  const { data: runRows } = await supabase
    .from('scoring_runs')
    .select('id, run_date, completed_at, run_quality, source_freshness')
    .eq('time_horizon_months', horizon)
    .eq('scoring_mode', mode)
    .eq('status', 'completed')
    .order('run_date', { ascending: false })
    .limit(15);

  const runs: Run[] = (runRows ?? []).map((r: any) => ({
    id: r.id,
    run_date: r.run_date,
    completed_at: r.completed_at,
    run_quality: r.run_quality,
    source_freshness: r.source_freshness,
  }));
  // Dedupe by run_date — keep first (most recent completed_at via order)
  const seen = new Set<string>();
  const dedupedRuns = runs.filter((r) => (seen.has(r.run_date) ? false : (seen.add(r.run_date), true)));

  if (dedupedRuns.length === 0) {
    return NextResponse.json({ available: false, horizon, mode });
  }

  const picked = pickRuns(dedupedRuns);
  const { latest, previous } = picked;
  // If weekly is the same row as previous, drop it — no extra signal
  const weekly = picked.weekly && previous && picked.weekly.id === previous.id ? null : picked.weekly;
  if (!latest) return NextResponse.json({ available: false, horizon, mode });

  const [latestScores, prevScores, weeklyScores] = await Promise.all([
    loadScores(supabase, latest.id),
    previous ? loadScores(supabase, previous.id) : Promise.resolve([]),
    weekly ? loadScores(supabase, weekly.id) : Promise.resolve([]),
  ]);

  const prevMap = previous ? toMap(prevScores) : null;
  const weeklyMap = weekly ? toMap(weeklyScores) : null;

  const deltas = buildDeltas(latestScores, prevMap, weeklyMap);
  const improved = buildImproved(deltas);
  const riskier = buildRiskier(deltas);
  const largeCap = buildLargeCap(deltas);

  const { headline, sub } = buildHeadline(
    deltas,
    horizon,
    !!previous,
    !!weekly,
    latest.run_quality
  );

  // Context stats
  const withDaily = deltas.filter((d) => d.daily.upwardDelta != null);
  const total = withDaily.length || 1;
  const improvedCount = withDaily.filter((d) => (d.daily.upwardDelta ?? 0) > 1).length;
  const weakenedCount = withDaily.filter((d) => (d.daily.upwardDelta ?? 0) < -1).length;
  const avgUp = withDaily.reduce((s, d) => s + (d.daily.upwardDelta ?? 0), 0) / total;
  const avgRisk = withDaily.reduce((s, d) => s + (d.daily.riskDelta ?? 0), 0) / total;

  return NextResponse.json({
    available: true,
    horizon,
    mode,
    runs: {
      latest: { run_date: latest.run_date, run_quality: latest.run_quality },
      previous: previous ? { run_date: previous.run_date } : null,
      weekly: weekly ? { run_date: weekly.run_date } : null,
    },
    headline,
    sub,
    stats: {
      improvedCount,
      weakenedCount,
      totalWithDelta: total,
      avgUpwardDelta: Math.round(avgUp * 100) / 100,
      avgRiskDelta: Math.round(avgRisk * 100) / 100,
    },
    cards: {
      improved,
      riskier,
      largeCap,
    },
  });
}
