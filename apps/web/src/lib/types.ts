export interface RankedCandidate {
  candidate: {
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
  };
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

export interface ParsedResumeCandidate {
  id: string;
  name: string;
  title: string;
  location: string;
  yearsExperience: number;
  skills: string[];
  contactEmail: string;
  sourceFile: string | null;
  parserConfidence: number;
  parserWarnings: string[];
}
