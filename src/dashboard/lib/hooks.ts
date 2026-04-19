'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface ScoresData {
  run_date?: string;
  scored_at?: string;
  horizon?: number;
  mode?: string;
  count?: number;
  coverage?: {
    total: number;
    with_price: number;
    with_market_cap: number;
    with_fundamental_value: number;
    with_sentiment: number;
    with_fragility: number;
  };
  factor_completeness?: number;
  source_freshness?: Record<string, string | null>;
  run_quality?: string;
  confidence_distribution?: { high: number; medium: number; low: number };
  available?: boolean;
  error?: string;
  scores?: any[];
}

interface UseScoresResult {
  data: ScoresData | null;
  isLoading: boolean;
  error: string | null;
}

export function useScores(horizon: number, mode: string = 'percentile'): UseScoresResult {
  const [data, setData] = useState<ScoresData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    fetch(`/api/scores?horizon=${horizon}&mode=${mode}`)
      .then((res) => res.json())
      .then((d: ScoresData) => {
        if (d.available === false) {
          setData(d);
          setError(null); // not an error, just no data yet
        } else {
          setData(d);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [horizon, mode]);

  return { data, isLoading, error };
}

interface UseTickerHistoryResult {
  history: any[];
  isLoading: boolean;
}

export function useTickerHistory(ticker: string | null, horizon: number, mode: string): UseTickerHistoryResult {
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!ticker) { setHistory([]); return; }
    setIsLoading(true);

    fetch(`/api/scores/history?ticker=${ticker}&horizon=${horizon}&mode=${mode}`)
      .then((res) => res.json())
      .then((d) => setHistory(d.history ?? []))
      .catch(() => setHistory([]))
      .finally(() => setIsLoading(false));
  }, [ticker, horizon, mode]);

  return { history, isLoading };
}

export interface PricePoint {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export function usePriceHistory(ticker: string | null, range: string): { prices: PricePoint[]; isLoading: boolean } {
  const [prices, setPrices] = useState<PricePoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!ticker) { setPrices([]); return; }
    setIsLoading(true);
    fetch(`/api/prices/history?ticker=${encodeURIComponent(ticker)}&range=${range}`)
      .then((res) => res.json())
      .then((d) => setPrices((d.prices ?? []).map((p: any) => ({
        ...p,
        close: Number(p.close),
        open: p.open != null ? Number(p.open) : null,
        high: p.high != null ? Number(p.high) : null,
        low: p.low != null ? Number(p.low) : null,
        volume: p.volume != null ? Number(p.volume) : null,
      }))))
      .catch(() => setPrices([]))
      .finally(() => setIsLoading(false));
  }, [ticker, range]);

  return { prices, isLoading };
}

export interface DeepAnalysisResult {
  analysis: string;
  cached: boolean;
  analysis_date: string;
  model: string;
  created_at: string;
}

export function useDeepAnalysis() {
  const [data, setData] = useState<DeepAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef(false);

  const generate = useCallback(async (params: {
    ticker: string;
    asset_class: string;
    horizon: number;
    mode: string;
    risk_score: number;
    upward_probability_score: number;
    confidence?: number | null;
    company_name?: string | null;
    run_date?: string | null;
  }) => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/deep-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Request failed');
      setData(d as DeepAnalysisResult);
    } catch (err: any) {
      setError(err.message ?? String(err));
    } finally {
      setIsLoading(false);
      inflightRef.current = false;
    }
  }, []);

  const reset = useCallback(() => { setData(null); setError(null); }, []);

  return { data, isLoading, error, generate, reset };
}

export interface BriefTicker {
  ticker: string;
  company_name: string | null;
  asset_class: string;
  market_cap: number | null;
  current: { risk: number; upward: number; confidence: number | null; confidenceLabel: string | null };
  daily: { upwardDelta: number | null; riskDelta: number | null };
  weekly: { upwardDelta: number | null; riskDelta: number | null };
  significance: number;
}

export interface BriefData {
  available: boolean;
  horizon?: number;
  mode?: string;
  runs?: {
    latest: { run_date: string; run_quality: string | null };
    previous: { run_date: string } | null;
    weekly: { run_date: string } | null;
  };
  headline?: string;
  sub?: string | null;
  stats?: {
    improvedCount: number;
    weakenedCount: number;
    totalWithDelta: number;
    avgUpwardDelta: number;
    avgRiskDelta: number;
  };
  cards?: {
    improved: BriefTicker[];
    riskier: BriefTicker[];
    largeCap: BriefTicker[];
  };
}

export function useBrief(horizon: number, mode: string): { data: BriefData | null; isLoading: boolean; error: string | null } {
  const [data, setData] = useState<BriefData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    fetch(`/api/brief?horizon=${horizon}&mode=${mode}`)
      .then((res) => res.json())
      .then((d: BriefData) => setData(d))
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [horizon, mode]);

  return { data, isLoading, error };
}
