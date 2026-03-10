import { RankedCandidate } from '../lib/types';
import { ScoreBadge } from './ScoreBadge';
import { useState } from 'react';
import { API_BASE } from '../lib/api';

interface CandidateCardProps {
  candidate: RankedCandidate;
  onDeleteCandidate?: (candidate: RankedCandidate) => Promise<void>;
  onSendRejection?: (candidate: RankedCandidate) => void;
  onMoveToNextStep?: (candidate: RankedCandidate) => void;
  movedToNextStep?: boolean;
}

export function CandidateCard({
  candidate,
  onDeleteCandidate,
  onSendRejection,
  onMoveToNextStep,
  movedToNextStep
}: CandidateCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const breakdown = candidate.breakdown ?? {
    skill: 0,
    experience: 0,
    location: 0,
    semantic: 0
  };

  return (
    <article className="card candidate-card">
      <div className="candidate-header">
        <div>
          <h3>{candidate.candidate?.name ?? 'Unknown Candidate'}</h3>
          <p>{candidate.candidate?.title ?? 'Unknown Role'} · {candidate.candidate?.location ?? 'Unknown Location'}</p>
        </div>
        <div className="candidate-actions-wrap">
          <ScoreBadge score={candidate.score} />
          {(onDeleteCandidate || onSendRejection || onMoveToNextStep) ? (
            <div className="kebab-wrap">
              <button
                type="button"
                className="kebab-btn"
                onClick={() => setMenuOpen((current) => !current)}
                aria-label="Candidate actions"
                title="Candidate actions"
              >
                ⋮
              </button>
              {menuOpen ? (
                <div className="kebab-menu">
                  {candidate.candidate?.sourceFile && candidate.candidate.sourceFile !== 'fallback-seed' ? (
                    <a
                      className="menu-link"
                      href={`${API_BASE}/api/resumes/download/${encodeURIComponent(candidate.candidate.sourceFile)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download resume
                    </a>
                  ) : null}
                  {onMoveToNextStep ? (
                    <button
                      type="button"
                      onClick={() => {
                        onMoveToNextStep(candidate);
                        setMenuOpen(false);
                      }}
                    >
                      Move to next step
                    </button>
                  ) : null}
                  {onSendRejection ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSendRejection(candidate);
                        setMenuOpen(false);
                      }}
                    >
                      Send rejection
                    </button>
                  ) : null}
                  {onDeleteCandidate ? (
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        void onDeleteCandidate(candidate);
                        setMenuOpen(false);
                      }}
                    >
                      Delete candidate
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {movedToNextStep ? <p className="next-step-pill">Moved to next step</p> : null}

      <p className="summary">{candidate.reason ?? 'No ranking rationale provided.'}</p>

      <div className="chip-row">
        {(candidate.candidate?.skills ?? []).slice(0, 6).map((skill) => (
          <span key={skill} className="chip">{skill}</span>
        ))}
      </div>

      <div className="metric-grid">
        <span>Skill {Math.round(breakdown.skill * 100)}%</span>
        <span>Experience {Math.round(breakdown.experience * 100)}%</span>
        <span>Location {Math.round(breakdown.location * 100)}%</span>
        <span>Semantic {Math.round(breakdown.semantic * 100)}%</span>
      </div>

      {candidate.outreachMessage ? (
        <details>
          <summary>Generated Outreach</summary>
          <pre>{candidate.outreachMessage}</pre>
        </details>
      ) : null}
    </article>
  );
}
