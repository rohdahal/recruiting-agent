import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CandidateCard } from './components/CandidateCard';
import { ResumeParserPanel } from './components/ResumeParserPanel';
import { useResumeIndex } from './hooks/useResumeIndex';
import { useWorkflow } from './hooks/useWorkflow';
import { API_BASE } from './lib/api';

const defaultPrompt = 'Hiring a founding full-stack engineer in New York or remote. Must have TypeScript, React, Node.js, PostgreSQL, and 5+ years of startup experience. Bonus for LLM/AI features, product ownership, and mentoring other engineers.';

export function App() {
  const [query, setQuery] = useState(defaultPrompt);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [actionStatus, setActionStatus] = useState<string>('');
  const [useConfidenceFilter, setUseConfidenceFilter] = useState(true);
  const [minParserConfidence, setMinParserConfidence] = useState(0.65);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [nextStepIds, setNextStepIds] = useState<string[]>([]);
  const { loading, error, result, runWorkflow } = useWorkflow();
  const resumeIndex = useResumeIndex();

  const topScore = useMemo(() => {
    if (!result?.shortlisted.length) {
      return 0;
    }
    return Math.round(result.shortlisted[0].score * 100);
  }, [result]);

  const selectedCandidate = useMemo(() => {
    if (!result?.shortlisted.length) {
      return null;
    }

    return result.shortlisted.find((candidate) => candidate.candidate?.id === selectedCandidateId) ?? result.shortlisted[0];
  }, [result, selectedCandidateId]);

  useEffect(() => {
    if (result?.shortlisted.length) {
      setSelectedCandidateId(result.shortlisted[0].candidate?.id ?? null);
    } else {
      setSelectedCandidateId(null);
    }
  }, [result]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runWorkflow(query, useConfidenceFilter ? minParserConfidence : 0);
  }

  async function onUploadResume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resumeFile) {
      setUploadStatus('Choose a .docx resume first.');
      return;
    }

    const formData = new FormData();
    formData.append('resume', resumeFile);

    setUploadStatus('Uploading and reindexing resume...');
    const response = await fetch(`${API_BASE}/api/resumes/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      setUploadStatus('Upload failed. Please ensure file is a .docx resume.');
      return;
    }

    const body = (await response.json()) as { file: string; mode: string };
    setUploadStatus(`Indexed ${body.file} with ${body.mode} retrieval.`);
    setResumeFile(null);
    await resumeIndex.refresh();
  }

  async function onDeleteCandidate(candidate: {
    id: string;
    name: string;
    sourceFile: string | null;
  }) {
    const confirmed = window.confirm(`Delete ${candidate.name} from candidate index?`);
    if (!confirmed) {
      return;
    }

    const params = new URLSearchParams();
    if (candidate.sourceFile) {
      params.set('sourceFile', candidate.sourceFile);
    }

    const query = params.toString();
    const deleteUrl = `${API_BASE}/api/resumes/candidates/${encodeURIComponent(candidate.id)}${query ? `?${query}` : ''}`;

    const response = await fetch(deleteUrl, { method: 'DELETE' });

    if (!response.ok) {
      setUploadStatus('Could not delete candidate. Please try again.');
      return;
    }

    setUploadStatus(`Deleted ${candidate.name} from index.`);
    await resumeIndex.refresh();
  }

  async function onDeleteRankedCandidate(candidate: {
    candidate?: { id?: string; name?: string; sourceFile?: string };
  }) {
    if (!candidate.candidate?.id) {
      return;
    }

    await onDeleteCandidate({
      id: candidate.candidate.id,
      name: candidate.candidate.name ?? 'Candidate',
      sourceFile: candidate.candidate.sourceFile ?? null
    });
    setSelectedCandidateId(null);
  }

  function onMoveToNextStep(candidate: { candidate?: { id?: string; name?: string } }) {
    const candidateId = candidate.candidate?.id;
    if (!candidateId) {
      return;
    }

    setNextStepIds((current) => (current.includes(candidateId) ? current : [...current, candidateId]));
    setActionStatus(`${candidate.candidate?.name ?? 'Candidate'} moved to next step.`);
  }

  function onSendRejection(candidate: { candidate?: { name?: string; contactEmail?: string } }) {
    const name = candidate.candidate?.name ?? 'there';
    const email = candidate.candidate?.contactEmail;
    const subject = encodeURIComponent('Update on your application');
    const body = encodeURIComponent(
      `Hi ${name},\n\nThanks for taking the time to connect with us. We’ve decided to move forward with other candidates for this role right now.\n\nWe appreciate your interest and wish you the best in your search.\n\nBest,\nRohan`
    );

    if (email) {
      window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
      setActionStatus(`Opened rejection draft for ${name}.`);
      return;
    }

    setActionStatus(`No email found for ${name}.`);
  }

  return (
    <main className="app-shell">
      <header className="hero card gradient">
        <p className="eyebrow">AI Recruiting Workflow Experiment</p>
        <h1>AI Recruiting Agent</h1>
        <p>Source, rank, and engage candidates using local LLM workflows with transparent tool traces.</p>
      </header>

      <section className="grid two-col">
        <form className="card" onSubmit={onSubmit}>
          <h2>Search + Match Prompt</h2>
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            rows={8}
            placeholder={defaultPrompt}
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Running AI workflow...' : 'Run Recruiting Workflow'}
          </button>
          <div className="filter-row">
            <label>
              <input
                type="checkbox"
                checked={useConfidenceFilter}
                onChange={(event) => setUseConfidenceFilter(event.target.checked)}
              />
              Enforce minimum parser confidence
            </label>
            <div className="range-wrap">
              <input
                type="range"
                min={0.4}
                max={0.95}
                step={0.05}
                value={minParserConfidence}
                disabled={!useConfidenceFilter}
                onChange={(event) => setMinParserConfidence(Number(event.target.value))}
              />
              <span>{Math.round(minParserConfidence * 100)}%</span>
            </div>
          </div>
          {error ? <p className="error">{error}</p> : null}
        </form>

        <section className="card stats">
          <h2>Matches</h2>
          <div className="stat-grid">
            <article>
              <p>Top Match</p>
              <strong>{topScore}%</strong>
            </article>
            <article>
              <p>Shortlisted</p>
              <strong>{result?.shortlisted.length ?? 0}</strong>
            </article>
            <article>
              <p>Rejected</p>
              <strong>{result?.rejected.length ?? 0}</strong>
            </article>
          </div>
          <p className="muted">Scoring blends skill fit, years of experience, location fit, and semantic relevance.</p>
          {!result ? <p className="muted">Run the workflow to see matched candidates.</p> : null}
          {result && result.shortlisted.length === 0 ? (
            <p className="muted">No candidates passed the shortlist threshold. Try lowering parser confidence filter.</p>
          ) : null}
          <div className="match-list">
            {(result?.shortlisted ?? []).map((candidate, index) => {
              const candidateId = candidate.candidate?.id ?? `shortlisted-${index}`;
              const isActive = selectedCandidateId === candidateId;

              return (
                <button
                  key={candidateId}
                  type="button"
                  className={`match-row ${isActive ? 'active' : ''}`}
                  onClick={() => setSelectedCandidateId(candidateId)}
                >
                  <span>{candidate.candidate?.name ?? `Candidate ${index + 1}`}</span>
                  <strong>{Math.round(candidate.score * 100)}%</strong>
                </button>
              );
            })}
          </div>
        </section>
      </section>

      {selectedCandidate ? (
        <section className="card">
          <h2>Match Details</h2>
          <CandidateCard
            candidate={selectedCandidate}
            onDeleteCandidate={onDeleteRankedCandidate}
            onMoveToNextStep={onMoveToNextStep}
            onSendRejection={onSendRejection}
            movedToNextStep={Boolean(selectedCandidate.candidate?.id && nextStepIds.includes(selectedCandidate.candidate.id))}
          />
        </section>
      ) : null}

      <form className="card" onSubmit={onUploadResume}>
        <h2>Word Resume Ingestion (.docx)</h2>
        <p className="muted">Upload candidate resumes in Word format. Index updates automatically after upload.</p>
        <input
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)}
        />
        <button type="submit">Upload + Index</button>
        {uploadStatus ? <p className="muted">{uploadStatus}</p> : null}
      </form>

      {actionStatus ? <p className="muted card">{actionStatus}</p> : null}

      <ResumeParserPanel
        mode={resumeIndex.mode}
        loading={resumeIndex.loading}
        error={resumeIndex.error}
        candidates={resumeIndex.candidates}
        onRefresh={() => {
          void resumeIndex.refresh();
        }}
      />
    </main>
  );
}
