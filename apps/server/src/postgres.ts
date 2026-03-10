import { Pool } from 'pg';
import { CandidateProfile } from './types.js';

const connectionString = process.env.POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost:5432/ai_recruiting';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString });
  }
  return pool;
}

export async function initPostgresSchema(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS parsed_candidates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        location TEXT NOT NULL,
        years_experience INTEGER NOT NULL,
        skills TEXT[] NOT NULL,
        summary TEXT NOT NULL,
        achievements TEXT[] NOT NULL,
        contact_email TEXT NOT NULL,
        tags TEXT[] NOT NULL,
        source_file TEXT,
        parser_confidence REAL NOT NULL DEFAULT 0.5,
        parser_warnings TEXT[] NOT NULL DEFAULT '{}',
        profile_text TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_parsed_candidates_fts
      ON parsed_candidates
      USING GIN (to_tsvector('english', profile_text));
    `);
  } finally {
    client.release();
  }
}

export async function upsertCandidatesToPostgres(candidates: CandidateProfile[]): Promise<number> {
  await initPostgresSchema();

  const client = await getPool().connect();
  try {
    let upserted = 0;

    for (const candidate of candidates) {
      const profileText = [candidate.summary, ...candidate.skills, ...candidate.achievements].join(' ');

      await client.query(
        `
          INSERT INTO parsed_candidates (
            id, name, title, location, years_experience, skills, summary, achievements,
            contact_email, tags, source_file, parser_confidence, parser_warnings, profile_text, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, NOW()
          )
          ON CONFLICT (id)
          DO UPDATE SET
            name = EXCLUDED.name,
            title = EXCLUDED.title,
            location = EXCLUDED.location,
            years_experience = EXCLUDED.years_experience,
            skills = EXCLUDED.skills,
            summary = EXCLUDED.summary,
            achievements = EXCLUDED.achievements,
            contact_email = EXCLUDED.contact_email,
            tags = EXCLUDED.tags,
            source_file = EXCLUDED.source_file,
            parser_confidence = EXCLUDED.parser_confidence,
            parser_warnings = EXCLUDED.parser_warnings,
            profile_text = EXCLUDED.profile_text,
            updated_at = NOW();
        `,
        [
          candidate.id,
          candidate.name,
          candidate.title,
          candidate.location,
          candidate.yearsExperience,
          candidate.skills,
          candidate.summary,
          candidate.achievements,
          candidate.contactEmail,
          candidate.tags,
          candidate.sourceFile ?? null,
          candidate.parserConfidence ?? 0.5,
          candidate.parserWarnings ?? [],
          profileText
        ]
      );

      upserted += 1;
    }

    return upserted;
  } finally {
    client.release();
  }
}

export async function searchCandidatesInPostgres(query: string, limit = 10): Promise<CandidateProfile[]> {
  try {
    await initPostgresSchema();
    interface ParsedCandidateRow {
      id: string;
      name: string;
      title: string;
      location: string;
      years_experience: number;
      skills: string[];
      summary: string;
      achievements: string[];
      contact_email: string;
      tags: string[];
      source_file: string | null;
      parser_confidence: number | null;
      parser_warnings: string[] | null;
    }

    const result = await getPool().query<ParsedCandidateRow>(
      `
      SELECT
        id,
        name,
        title,
        location,
        years_experience,
        skills,
        summary,
        achievements,
        contact_email,
        tags,
        source_file,
        parser_confidence,
        parser_warnings
      FROM parsed_candidates
      ORDER BY
        ts_rank(
          to_tsvector('english', profile_text),
          plainto_tsquery('english', $1)
        ) DESC,
        parser_confidence DESC,
        years_experience DESC
      LIMIT $2;
    `,
      [query, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      title: row.title,
      location: row.location,
      skills: row.skills,
      yearsExperience: row.years_experience,
      summary: row.summary,
      achievements: row.achievements,
      contactEmail: row.contact_email,
      tags: row.tags,
      sourceFile: row.source_file ?? 'postgres',
      parserConfidence: Number(row.parser_confidence ?? 0.5),
      parserWarnings: row.parser_warnings ?? []
    }));
  } catch {
    return [];
  }
}

export async function listCandidatesFromPostgres(limit = 500): Promise<CandidateProfile[]> {
  try {
    await initPostgresSchema();
    interface ParsedCandidateRow {
      id: string;
      name: string;
      title: string;
      location: string;
      years_experience: number;
      skills: string[];
      summary: string;
      achievements: string[];
      contact_email: string;
      tags: string[];
      source_file: string | null;
      parser_confidence: number | null;
      parser_warnings: string[] | null;
    }

    const result = await getPool().query<ParsedCandidateRow>(
      `
      SELECT
        id,
        name,
        title,
        location,
        years_experience,
        skills,
        summary,
        achievements,
        contact_email,
        tags,
        source_file,
        parser_confidence,
        parser_warnings
      FROM parsed_candidates
      ORDER BY updated_at DESC, parser_confidence DESC, years_experience DESC
      LIMIT $1;
      `,
      [limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      title: row.title,
      location: row.location,
      skills: row.skills,
      yearsExperience: row.years_experience,
      summary: row.summary,
      achievements: row.achievements,
      contactEmail: row.contact_email,
      tags: row.tags,
      sourceFile: row.source_file ?? 'postgres',
      parserConfidence: Number(row.parser_confidence ?? 0.5),
      parserWarnings: row.parser_warnings ?? []
    }));
  } catch {
    return [];
  }
}

export async function deleteCandidateFromPostgres(candidateId: string): Promise<void> {
  try {
    await initPostgresSchema();
    await getPool().query('DELETE FROM parsed_candidates WHERE id = $1', [candidateId]);
  } catch {
    return;
  }
}
