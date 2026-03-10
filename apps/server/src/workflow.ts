import { extractJobSpecFromPrompt, generateOutreachMessage } from './ollama.js';
import { retrieveCandidatesForQuery } from './rag.js';
import { rankCandidates } from './scoring.js';
import { WorkflowResult } from './types.js';

export async function runRecruitingWorkflow(
  query: string,
  options?: { minParserConfidence?: number }
): Promise<WorkflowResult> {
  const toolTrace: WorkflowResult['toolTrace'] = [];
  const minParserConfidence = Math.max(0, Math.min(1, options?.minParserConfidence ?? 0));

  const jobSpec = await extractJobSpecFromPrompt(query);
  toolTrace.push({
    tool: 'parse_job_spec',
    input: query,
    outputSummary: `${jobSpec.title} in ${jobSpec.location} requiring ${jobSpec.requiredSkills.join(', ')}`
  });

  const retrieval = await retrieveCandidatesForQuery(query, 10);
  const retrievedCandidates = retrieval.candidates;
  const candidates = retrievedCandidates.filter(
    (candidate) => (candidate.parserConfidence ?? 0.5) >= minParserConfidence
  );
  toolTrace.push({
    tool: 'retrieve_candidate_profiles_rag',
    input: {
      total: retrievedCandidates.length,
      keptAfterConfidenceFilter: candidates.length,
      minParserConfidence,
      retrievalMode: retrieval.retrievalMode
    },
    outputSummary: `Retrieved ${retrievedCandidates.length} candidates from ${retrieval.retrievalMode} RAG search, kept ${candidates.length} with parser confidence >= ${minParserConfidence}`
  });

  const ranked = rankCandidates(candidates, jobSpec, query);
  toolTrace.push({
    tool: 'rank_candidates',
    input: jobSpec,
    outputSummary: `Ranked ${ranked.length} candidates using weighted evaluation`
  });

  const shortlisted = ranked.slice(0, 5);
  await Promise.all(
    shortlisted.map(async (item) => {
      item.outreachMessage = await generateOutreachMessage({
        recruiterName: 'Rohan',
        candidateName: item.candidate.name,
        role: jobSpec.title,
        highlights: item.candidate.skills.slice(0, 3)
      });
    })
  );

  toolTrace.push({
    tool: 'generate_outreach',
    input: { shortlisted: shortlisted.length },
    outputSummary: `Generated outreach drafts for top ${shortlisted.length} candidates`
  });

  const threshold = 0.62;
  return {
    query,
    shortlisted: shortlisted.filter((c) => c.score >= threshold),
    rejected: ranked.filter((c) => c.score < threshold),
    toolTrace
  };
}
