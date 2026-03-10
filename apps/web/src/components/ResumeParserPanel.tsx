import { ParsedResumeCandidate } from '../lib/types';
import { useMemo, useState } from 'react';

interface ResumeParserPanelProps {
  mode: string;
  loading: boolean;
  error: string | null;
  candidates: ParsedResumeCandidate[];
  onRefresh: () => void;
}

export function ResumeParserPanel({ mode, loading, error, candidates, onRefresh }: ResumeParserPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCandidates = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) {
      return candidates;
    }

    return candidates.filter((candidate) => {
      const haystack = [
        candidate.name,
        candidate.title,
        candidate.location,
        candidate.contactEmail,
        candidate.sourceFile ?? '',
        ...candidate.skills
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [candidates, searchTerm]);

  return (
    <section className="card">
      <div className="panel-header">
        <h2>Candidates</h2>
        <div className="panel-actions">
          {loading ? <span className="muted small">Refreshing…</span> : null}
          <button type="button" onClick={onRefresh} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>
      <p className="muted">
        Retrieval mode: <strong>{mode}</strong> · Parsed candidates: <strong>{candidates.length}</strong>
      </p>

      <input
        className="candidate-search"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        placeholder="Search candidates by name, title, skills, or location"
      />

      {searchTerm ? (
        <p className="muted small">Showing {filteredCandidates.length} match(es) for “{searchTerm}”.</p>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      <div className="resume-list">
        {filteredCandidates.map((candidate) => (
          <article key={candidate.id} className="resume-item">
            <div className="resume-top-row">
              <strong>{candidate.name}</strong>
              <span className={`confidence ${candidate.parserConfidence >= 0.8 ? 'high' : candidate.parserConfidence >= 0.6 ? 'mid' : 'low'}`}>
                Parser {Math.round(candidate.parserConfidence * 100)}%
              </span>
            </div>
            <div>
              <p>{candidate.title} · {candidate.location} · {candidate.yearsExperience} yrs</p>
            </div>
            <p className="muted small">{candidate.sourceFile ?? 'fallback-seed'}</p>
            <div className="chip-row">
              {candidate.skills.slice(0, 6).map((skill) => (
                <span key={`${candidate.id}-${skill}`} className="chip">{skill}</span>
              ))}
            </div>
            {candidate.parserWarnings.length ? (
              <p className="warning small">⚠ {candidate.parserWarnings.slice(0, 2).join(' · ')}</p>
            ) : (
              <p className="ok small">✓ Extraction quality looks strong</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
