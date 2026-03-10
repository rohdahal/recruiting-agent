import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CandidateProfile } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.resolve(__dirname, '../../../data/candidates.json');

export async function loadCandidatesFromJson(): Promise<CandidateProfile[]> {
  const raw = await fs.readFile(DATA_PATH, 'utf-8');
  return JSON.parse(raw) as CandidateProfile[];
}

export async function loadCandidates(): Promise<CandidateProfile[]> {
  return loadCandidatesFromJson();
}
