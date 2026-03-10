export interface CandidateProfile {
  id: string;
  name: string;
  title: string;
  location: string;
  skills: string[];
  yearsExperience: number;
  summary: string;
  achievements: string[];
  contactEmail: string;
  tags: string[];
  sourceFile?: string;
  parserConfidence?: number;
  parserWarnings?: string[];
}

export interface JobSpec {
  title: string;
  location: string;
  requiredSkills: string[];
  preferredSkills: string[];
  minYearsExperience: number;
  notes: string;
}

export interface RankedCandidate {
  candidate: CandidateProfile;
  score: number;
  breakdown: {
    skill: number;
    experience: number;
    location: number;
    semantic: number;
  };
  reason: string;
  outreachMessage?: string;
}

export interface WorkflowResult {
  query: string;
  shortlisted: RankedCandidate[];
  rejected: RankedCandidate[];
  toolTrace: Array<{ tool: string; input: unknown; outputSummary: string }>;
}
