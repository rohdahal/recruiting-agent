import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../lib/api';
import { ParsedResumeCandidate } from '../lib/types';

interface ResumeIndexResponse {
  mode: string;
  candidates: ParsedResumeCandidate[];
}

export function useResumeIndex() {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('unknown');
  const [candidates, setCandidates] = useState<ParsedResumeCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/resumes/candidates`);
      if (!response.ok) {
        throw new Error('Could not load parsed resume index');
      }

      const body = (await response.json()) as ResumeIndexResponse;
      setMode(body.mode);
      setCandidates(body.candidates);
    } catch (indexError) {
      setError(indexError instanceof Error ? indexError.message : 'Unknown resume index error');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refresh(true);
    }, 8000);

    return () => window.clearInterval(interval);
  }, [refresh]);

  return {
    loading,
    mode,
    candidates,
    error,
    refresh
  };
}
