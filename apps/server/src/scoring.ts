import { CandidateProfile, JobSpec, RankedCandidate } from './types.js';

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalize(value)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function scoreSkills(candidate: CandidateProfile, job: JobSpec): number {
  const required = job.requiredSkills.map(normalize);
  const preferred = job.preferredSkills.map(normalize);
  const candidateSkills = new Set(candidate.skills.map(normalize));

  const requiredHit = required.filter((skill) => candidateSkills.has(skill)).length;
  const preferredHit = preferred.filter((skill) => candidateSkills.has(skill)).length;

  const requiredScore = required.length ? requiredHit / required.length : 1;
  const preferredScore = preferred.length ? preferredHit / preferred.length : 0;

  return requiredScore * 0.75 + preferredScore * 0.25;
}

function scoreExperience(candidate: CandidateProfile, job: JobSpec): number {
  if (job.minYearsExperience <= 0) {
    return 1;
  }
  return Math.min(candidate.yearsExperience / job.minYearsExperience, 1.4) / 1.4;
}

function scoreLocation(candidate: CandidateProfile, job: JobSpec): number {
  const candidateLocation = normalize(candidate.location);
  const jobLocation = normalize(job.location);

  if (!jobLocation || jobLocation.includes('remote')) {
    return 1;
  }

  if (candidateLocation.includes(jobLocation) || jobLocation.includes(candidateLocation)) {
    return 1;
  }

  return candidate.tags.map(normalize).includes('remote') ? 0.8 : 0.2;
}

function scoreSemantic(candidate: CandidateProfile, query: string, job: JobSpec): number {
  const source = [candidate.summary, ...candidate.achievements, ...candidate.skills].join(' ');
  const queryContext = [query, job.title, job.notes, ...job.requiredSkills, ...job.preferredSkills].join(' ');
  return jaccard(tokenSet(source), tokenSet(queryContext));
}

function buildReason(candidate: CandidateProfile, score: number, job: JobSpec): string {
  const topSkills = candidate.skills.slice(0, 3).join(', ');
  const confidence = score > 0.8 ? 'high' : score > 0.65 ? 'medium' : 'emerging';

  return `${candidate.name} is a ${confidence} fit for ${job.title} with ${candidate.yearsExperience} years experience and strengths in ${topSkills}.`;
}

export function rankCandidates(candidates: CandidateProfile[], job: JobSpec, query: string): RankedCandidate[] {
  return candidates
    .map((candidate) => {
      const skill = scoreSkills(candidate, job);
      const experience = scoreExperience(candidate, job);
      const location = scoreLocation(candidate, job);
      const semantic = scoreSemantic(candidate, query, job);

      const score = skill * 0.45 + experience * 0.2 + location * 0.1 + semantic * 0.25;

      return {
        candidate,
        score,
        breakdown: { skill, experience, location, semantic },
        reason: buildReason(candidate, score, job)
      };
    })
    .sort((a, b) => b.score - a.score);
}
