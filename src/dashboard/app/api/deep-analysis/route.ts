// POST /api/deep-analysis
// Generate or return cached deep analysis for a ticker.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';

const MODEL = 'claude-opus-4-6';
const PROMPT_VERSION = 'v1';

function getTodayZurich(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });
}

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  return createClient(url, key);
}

let systemPromptCache: string | null = null;
function loadSystemPrompt(): string {
  if (systemPromptCache) return systemPromptCache;
  const path = join(process.cwd(), 'ticker-deep-analysis-system-prompt.md');
  systemPromptCache = readFileSync(path, 'utf-8');
  return systemPromptCache;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { ticker, asset_class, horizon, mode, risk_score, upward_probability_score, confidence, company_name, run_date } = body;

  if (!ticker || !horizon || !mode) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const today = getTodayZurich();
  const supabase = getServiceClient();

  // Check cache
  const { data: cached } = await supabase
    .from('ticker_deep_analyses')
    .select('*')
    .eq('ticker', ticker)
    .eq('time_horizon_months', horizon)
    .eq('scoring_mode', mode)
    .eq('analysis_date', today)
    .limit(1)
    .single();

  if (cached) {
    return NextResponse.json({
      analysis: cached.analysis_text,
      cached: true,
      analysis_date: cached.analysis_date,
      model: cached.model,
      created_at: cached.created_at,
    });
  }

  // Generate
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
  }

  const systemPrompt = loadSystemPrompt();

  const horizonLabel = `${horizon}mo`;
  const userMessage = [
    `ticker: ${ticker}`,
    `asset_class: ${asset_class ?? 'stock'}`,
    `horizon: ${horizonLabel}`,
    `risk_score: ${Number(risk_score ?? 50).toFixed(1)}`,
    `upward_probability: ${Number(upward_probability_score ?? 50).toFixed(1)}`,
    confidence != null ? `confidence: ${Number(confidence).toFixed(0)}` : null,
    company_name ? `company_name: ${company_name}` : null,
    run_date ? `source_run_date: ${run_date}` : null,
    `analysis_date: ${today}`,
  ].filter(Boolean).join('\n');

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    // Store
    await supabase.from('ticker_deep_analyses').upsert({
      ticker,
      time_horizon_months: horizon,
      scoring_mode: mode,
      analysis_date: today,
      source_run_date: run_date ?? null,
      analysis_text: text,
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'ticker,time_horizon_months,scoring_mode,analysis_date' });

    return NextResponse.json({
      analysis: text,
      cached: false,
      analysis_date: today,
      model: MODEL,
      created_at: new Date().toISOString(),
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    return NextResponse.json({ error: `Generation failed: ${msg}` }, { status: 500 });
  }
}
