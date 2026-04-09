'use client';

import { useState, useEffect } from 'react';

interface UseScoresResult {
  data: any;
  isLoading: boolean;
  error: string | null;
}

export function useScores(horizon: number, mode: string = 'percentile'): UseScoresResult {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    fetch(`/api/scores?horizon=${horizon}&mode=${mode}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [horizon, mode]);

  return { data, isLoading, error };
}
