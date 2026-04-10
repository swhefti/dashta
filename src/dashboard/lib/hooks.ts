'use client';

import { useState, useEffect } from 'react';

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
