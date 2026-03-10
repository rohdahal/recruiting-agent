import { useState } from 'react';
import { API_BASE } from '../lib/api';
import { WorkflowResult } from '../lib/types';

const WORKFLOW_TIMEOUT_MS = 45000;

export function useWorkflow() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WorkflowResult | null>(null);

  async function runWorkflow(query: string, minParserConfidence?: number) {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), WORKFLOW_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE}/api/workflow/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ query, minParserConfidence })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string | Record<string, string[]>;
        };

        if (typeof body.error === 'string') {
          throw new Error(body.error);
        }

        if (body.error && typeof body.error === 'object') {
          const firstFieldError = Object.values(body.error)[0]?.[0];
          throw new Error(firstFieldError ?? 'Workflow request validation failed');
        }

        throw new Error('Workflow failed');
      }

      const data = (await response.json()) as WorkflowResult;
      setResult(data);
    } catch (workflowError) {
      if (workflowError instanceof DOMException && workflowError.name === 'AbortError') {
        setError('Workflow timed out. Check Ollama is running and model is loaded, then try again.');
      } else {
        setError(workflowError instanceof Error ? workflowError.message : 'Unexpected error');
      }
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }

  return {
    loading,
    error,
    result,
    runWorkflow
  };
}
