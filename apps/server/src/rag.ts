import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';
import { loadCandidatesFromJson } from './data.js';
import { generateWithOllama } from './ollama.js';
import { searchCandidatesInPostgres } from './postgres.js';
import { CandidateProfile } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESUME_DIR = path.resolve(__dirname, '../../../data/resumes');
const DELETED_CANDIDATES_PATH = path.resolve(__dirname, '../../../data/deleted-candidates.json');
const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';

interface ResumeChunk {
  candidateId: string;
  text: string;
  vector: number[];
}

interface RagIndex {
  candidates: CandidateProfile[];
  chunks: ResumeChunk[];
  mode: 'embedding' | 'keyword';
}

let cachedIndex: RagIndex | null = null;
let lastIndexedAt = 0;

export async function getResumeRagIndex(forceRebuild = false): Promise<RagIndex> {
  const now = Date.now();
  if (!forceRebuild && cachedIndex && now - lastIndexedAt < 60_000) {
    return cachedIndex;
  }

  const fallbackCandidates = (await loadCandidatesFromJson()).map((candidate) => ({
    ...candidate,
    sourceFile: candidate.sourceFile ?? 'fallback-seed',
    parserConfidence: candidate.parserConfidence ?? 0.6,
    parserWarnings: candidate.parserWarnings ?? ['Using fallback JSON candidate record, not parsed from .docx resume']
  }));

  const docxFiles = await listDocxFiles();
  const parsed = await Promise.all(docxFiles.map(parseResume));
  const deletedCandidateIds = await loadDeletedCandidateIds();

  const resumeCandidates = parsed.map((item) => item.candidate);
  const candidates = [...fallbackCandidates, ...resumeCandidates].filter(
    (candidate) => !deletedCandidateIds.has(candidate.id)
  );
  const chunkTexts = [
    ...fallbackCandidates
      .filter((candidate) => !deletedCandidateIds.has(candidate.id))
      .map((candidate) => ({
      candidateId: candidate.id,
      text: [candidate.summary, ...candidate.achievements, ...candidate.skills].join(' ')
      })),
    ...parsed
      .filter((item) => !deletedCandidateIds.has(item.candidate.id))
      .flatMap((item) => item.chunks.map((chunk) => ({ candidateId: item.candidate.id, text: chunk })))
  ];

  const embeddedChunks = await embedChunks(chunkTexts);
  cachedIndex = {
    candidates,
    chunks: embeddedChunks,
    mode: embeddedChunks.some((chunk) => chunk.vector.length > 0) ? 'embedding' : 'keyword'
  };
  lastIndexedAt = now;
  return cachedIndex;
}

export async function markCandidateDeleted(candidateId: string): Promise<void> {
  const deletedCandidateIds = await loadDeletedCandidateIds();
  deletedCandidateIds.add(candidateId);
  await saveDeletedCandidateIds(deletedCandidateIds);
  cachedIndex = null;
  lastIndexedAt = 0;
}

export async function retrieveCandidatesForQuery(query: string, limit = 8): Promise<{
  candidates: CandidateProfile[];
  retrievalMode: 'postgres' | 'embedding' | 'keyword';
}> {
  const postgresCandidates = await searchCandidatesInPostgres(query, limit);
  if (postgresCandidates.length > 0) {
    return {
      candidates: postgresCandidates,
      retrievalMode: 'postgres'
    };
  }

  const index = await getResumeRagIndex();
  if (!index.candidates.length) {
    return { candidates: [], retrievalMode: index.mode };
  }

  const scores = new Map<string, number>();

  if (index.mode === 'embedding') {
    const queryVector = await embedText(query);
    if (queryVector.length > 0) {
      for (const chunk of index.chunks) {
        const similarity = cosineSimilarity(queryVector, chunk.vector);
        if (similarity > 0.0001) {
          const current = scores.get(chunk.candidateId) ?? 0;
          scores.set(chunk.candidateId, Math.max(current, similarity));
        }
      }
    }
  }

  if (scores.size === 0) {
    const queryTokens = tokenize(query);
    for (const chunk of index.chunks) {
      const overlap = keywordScore(queryTokens, tokenize(chunk.text));
      const current = scores.get(chunk.candidateId) ?? 0;
      scores.set(chunk.candidateId, Math.max(current, overlap));
    }
  }

  const rankedIds = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([candidateId]) => candidateId);

  const byId = new Map(index.candidates.map((candidate) => [candidate.id, candidate]));
  return {
    candidates: rankedIds.map((id) => byId.get(id)).filter((candidate): candidate is CandidateProfile => Boolean(candidate)),
    retrievalMode: index.mode
  };
}

async function listDocxFiles(): Promise<string[]> {
  try {
    const entries = await fs.readdir(RESUME_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.docx'))
      .map((entry) => path.join(RESUME_DIR, entry.name));
  } catch {
    return [];
  }
}

async function parseResume(filePath: string): Promise<{ candidate: CandidateProfile; chunks: string[] }> {
  const { value } = await mammoth.extractRawText({ path: filePath });
  const text = value.replace(/\t/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

  const heuristicName = firstMatch(lines, [/^name[:\-]\s*(.+)$/i]) ?? lines[0] ?? path.basename(filePath, '.docx');
  const heuristicTitle = firstMatch(lines, [/^title[:\-]\s*(.+)$/i, /^role[:\-]\s*(.+)$/i]) ?? 'Software Engineer';
  const heuristicLocation = firstMatch(lines, [/^location[:\-]\s*(.+)$/i]) ?? 'Remote';
  const heuristicEmail = firstMatch(lines, [/^email[:\-]\s*(.+)$/i]) ?? `${slugify(heuristicName)}@example.com`;
  const heuristicYearsExperience = Number(firstMatch(lines, [/^(?:experience|years)[:\-]\s*(\d+)/i]) ?? 3);
  const heuristicSummary = firstMatch(lines, [/^summary[:\-]\s*(.+)$/i]) ?? lines.slice(0, 3).join(' ').slice(0, 250);
  const heuristicAchievements = lines
    .filter((line) => line.startsWith('-') || line.startsWith('•'))
    .map((line) => line.replace(/^[-•]\s*/, ''))
    .slice(0, 4);
  const heuristicSkills = extractSkills(text);

  const llmParsed = await parseResumeWithLlm(text);

  const name = llmParsed?.name ?? heuristicName;
  const title = llmParsed?.title ?? heuristicTitle;
  const location = llmParsed?.location ?? heuristicLocation;
  const email = llmParsed?.email ?? heuristicEmail;
  const yearsExperience = llmParsed?.yearsExperience ?? heuristicYearsExperience;
  const summary = llmParsed?.summary ?? heuristicSummary;
  const achievements = llmParsed?.achievements?.length ? llmParsed.achievements : heuristicAchievements;
  const skills = llmParsed?.skills?.length ? llmParsed.skills : heuristicSkills;
  const tags = llmParsed?.tags?.length ? llmParsed.tags : ['resume-docx', 'rag-indexed'];

  const chunks = chunkText(text, 450);
  const quality = computeParserQuality({
    name,
    title,
    location,
    email,
    yearsExperience,
    summary,
    achievements,
    skills,
    text
  });

  return {
    candidate: {
      id: `resume_${slugify(path.basename(filePath, '.docx'))}`,
      name,
      title,
      location,
      skills: skills.length ? skills : ['TypeScript', 'React'],
      yearsExperience,
      summary,
      achievements,
      contactEmail: email,
      tags,
      sourceFile: path.basename(filePath),
      parserConfidence: quality.score,
      parserWarnings: llmParsed ? quality.warnings : ['LLM parser unavailable, heuristic extraction used', ...quality.warnings]
    },
    chunks
  };
}

async function parseResumeWithLlm(text: string): Promise<{
  name?: string;
  title?: string;
  location?: string;
  email?: string;
  yearsExperience?: number;
  summary?: string;
  skills?: string[];
  achievements?: string[];
  tags?: string[];
} | null> {
  const prompt = [
    'Extract candidate profile fields from this resume text.',
    'Return ONLY valid JSON with keys:',
    'name, title, location, email, yearsExperience, summary, skills, achievements, tags',
    'skills, achievements, tags must be arrays of strings.',
    'yearsExperience must be a number.',
    'If unknown, use null for scalar fields or [] for arrays.',
    '',
    'Resume text:',
    text.slice(0, 6000)
  ].join('\n');

  const raw = await generateWithOllama(prompt);
  if (!raw) {
    return null;
  }

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned) as {
      name?: string | null;
      title?: string | null;
      location?: string | null;
      email?: string | null;
      yearsExperience?: number | string | null;
      summary?: string | null;
      skills?: string[] | null;
      achievements?: string[] | null;
      tags?: string[] | null;
    };

    return {
      name: coerceString(parsed.name),
      title: coerceString(parsed.title),
      location: coerceString(parsed.location),
      email: coerceString(parsed.email),
      yearsExperience: coerceNumber(parsed.yearsExperience),
      summary: coerceString(parsed.summary),
      skills: coerceStringArray(parsed.skills),
      achievements: coerceStringArray(parsed.achievements),
      tags: coerceStringArray(parsed.tags)
    };
  } catch {
    return null;
  }
}

function coerceString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function computeParserQuality(input: {
  name: string;
  title: string;
  location: string;
  email: string;
  yearsExperience: number;
  summary: string;
  achievements: string[];
  skills: string[];
  text: string;
}): { score: number; warnings: string[] } {
  const warnings: string[] = [];
  let score = 1;

  if (!input.name || input.name.length < 3) {
    score -= 0.2;
    warnings.push('Missing or weak candidate name extraction');
  }

  if (!input.title || input.title.toLowerCase() === 'software engineer') {
    score -= 0.1;
    warnings.push('Role/title may be generic or missing');
  }

  if (!input.location || input.location.toLowerCase() === 'remote') {
    score -= 0.06;
    warnings.push('Location not clearly extracted');
  }

  if (!input.email.includes('@')) {
    score -= 0.2;
    warnings.push('No valid email found in resume text');
  }

  if (!Number.isFinite(input.yearsExperience) || input.yearsExperience <= 0) {
    score -= 0.12;
    warnings.push('Years of experience missing or unclear');
  }

  if (input.summary.length < 40) {
    score -= 0.1;
    warnings.push('Summary extraction looks short');
  }

  if (input.achievements.length === 0) {
    score -= 0.08;
    warnings.push('No bullet achievements detected');
  }

  if (input.skills.length < 2) {
    score -= 0.1;
    warnings.push('Skills extraction confidence is low');
  }

  if (input.text.length < 300) {
    score -= 0.08;
    warnings.push('Resume text is very short after DOCX parsing');
  }

  const clamped = Math.max(0.05, Math.min(1, Number(score.toFixed(2))));
  return { score: clamped, warnings };
}

function chunkText(input: string, maxLength: number): string[] {
  const paragraphs = input.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if ((current + '\n\n' + paragraph).length > maxLength && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length ? chunks : [input.slice(0, maxLength)];
}

async function embedChunks(chunks: Array<{ candidateId: string; text: string }>): Promise<ResumeChunk[]> {
  const result: ResumeChunk[] = [];
  for (const chunk of chunks) {
    const vector = await embedText(chunk.text);
    result.push({ ...chunk, vector });
  }
  return result;
}

async function embedText(text: string): Promise<number[]> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text })
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as { embedding?: number[] };
    return Array.isArray(data.embedding) ? data.embedding : [];
  } catch {
    return [];
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    magnitudeA += a[index] * a[index];
    magnitudeB += b[index] * b[index];
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((token) => token.length > 1));
}

function keywordScore(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((token) => b.has(token)).length;
  const denominator = Math.max(a.size, 1);
  return intersection / denominator;
}

function firstMatch(lines: string[], patterns: RegExp[]): string | null {
  for (const line of lines) {
    for (const pattern of patterns) {
      const matched = line.match(pattern);
      if (matched?.[1]) {
        return matched[1].trim();
      }
    }
  }

  return null;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

function extractSkills(text: string): string[] {
  const knownSkills = [
    'TypeScript',
    'JavaScript',
    'React',
    'Node.js',
    'Python',
    'LLM',
    'RAG',
    'AWS',
    'GraphQL',
    'PostgreSQL',
    'Docker',
    'Kubernetes'
  ];

  const lower = text.toLowerCase();
  return knownSkills.filter((skill) => lower.includes(skill.toLowerCase()));
}

async function loadDeletedCandidateIds(): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(DELETED_CANDIDATES_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

async function saveDeletedCandidateIds(ids: Set<string>): Promise<void> {
  const payload = JSON.stringify([...ids], null, 2);
  await fs.writeFile(DELETED_CANDIDATES_PATH, payload, 'utf-8');
}
