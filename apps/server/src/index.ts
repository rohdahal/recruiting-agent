import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { deleteCandidateFromPostgres, listCandidatesFromPostgres, upsertCandidatesToPostgres } from './postgres.js';
import { getResumeRagIndex, markCandidateDeleted } from './rag.js';
import { runRecruitingWorkflow } from './workflow.js';

const app = express();
const port = Number(process.env.PORT ?? 8787);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resumeDir = path.resolve(__dirname, '../../../data/resumes');

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdir(resumeDir, { recursive: true })
        .then(() => cb(null, resumeDir))
        .catch((error) => cb(error as Error, resumeDir));
    },
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, safeName);
    }
  }),
  fileFilter: (_req, file, cb) => {
    cb(null, file.originalname.toLowerCase().endsWith('.docx'));
  }
});

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ai-recruiting-agent-server' });
});

app.get('/api/resumes/index-status', async (_req, res) => {
  const index = await getResumeRagIndex();
  res.json({
    mode: index.mode,
    candidates: index.candidates.length,
    chunks: index.chunks.length
  });
});

app.get('/api/resumes/candidates', async (_req, res) => {
  const postgresCandidates = await listCandidatesFromPostgres();
  const sourceCandidates = postgresCandidates.length
    ? postgresCandidates
    : (await getResumeRagIndex()).candidates;
  const mode = postgresCandidates.length ? 'postgres' : 'rag-fallback';

  res.json({
    mode,
    candidates: sourceCandidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      title: candidate.title,
      location: candidate.location,
      yearsExperience: candidate.yearsExperience,
      skills: candidate.skills,
      contactEmail: candidate.contactEmail,
      sourceFile: candidate.sourceFile ?? null,
      parserConfidence: candidate.parserConfidence ?? 0.5,
      parserWarnings: candidate.parserWarnings ?? []
    }))
  });
});

app.get('/api/resumes/download/:fileName', async (req, res) => {
  const rawFileName = req.params.fileName;
  const safeFileName = path.basename(rawFileName);

  if (!safeFileName.toLowerCase().endsWith('.docx')) {
    return res.status(400).json({ error: 'Only .docx resume downloads are supported' });
  }

  const filePath = path.resolve(resumeDir, safeFileName);

  try {
    await fs.access(filePath);
    return res.download(filePath, safeFileName);
  } catch {
    return res.status(404).json({ error: 'Resume file not found' });
  }
});

const deleteCandidateSchema = z.object({
  candidateId: z.string().min(3),
  sourceFile: z.string().optional()
});

app.delete('/api/resumes/candidates/:candidateId', async (req, res) => {
  const parsed = deleteCandidateSchema.safeParse({
    candidateId: req.params.candidateId,
    sourceFile: typeof req.query.sourceFile === 'string' ? req.query.sourceFile : undefined
  });

  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid candidate delete request' });
  }

  const { candidateId, sourceFile } = parsed.data;

  if (sourceFile && sourceFile !== 'fallback-seed' && sourceFile.toLowerCase().endsWith('.docx')) {
    const safeFileName = path.basename(sourceFile);
    const filePath = path.resolve(resumeDir, safeFileName);
    try {
      await fs.unlink(filePath);
    } catch {
      // If file is already missing, continue deletion of profile records.
    }
  }

  await markCandidateDeleted(candidateId);
  await deleteCandidateFromPostgres(candidateId);

  const index = await getResumeRagIndex(true);
  return res.json({ ok: true, candidateId, remainingCandidates: index.candidates.length });
});

app.post('/api/resumes/reindex', async (_req, res) => {
  const index = await getResumeRagIndex(true);
  const upserted = await upsertCandidatesToPostgres(index.candidates);
  res.json({
    ok: true,
    mode: index.mode,
    candidates: index.candidates.length,
    chunks: index.chunks.length,
    postgresUpserted: upserted
  });
});

app.post('/api/resumes/upload', upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a .docx resume using form field "resume"' });
  }

  const index = await getResumeRagIndex(true);
  const upserted = await upsertCandidatesToPostgres(index.candidates);
  return res.json({
    ok: true,
    file: req.file.filename,
    indexedCandidates: index.candidates.length,
    indexedChunks: index.chunks.length,
    mode: index.mode,
    postgresUpserted: upserted
  });
});

const workflowSchema = z.object({
  query: z.string().min(10, 'Please provide a richer hiring prompt'),
  minParserConfidence: z.number().min(0).max(1).optional()
});

app.post('/api/workflow/run', async (req, res) => {
  const parsed = workflowSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.flatten().fieldErrors
    });
  }

  try {
    const result = await runRecruitingWorkflow(parsed.data.query, {
      minParserConfidence: parsed.data.minParserConfidence
    });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown workflow error';
    console.error('Workflow execution failed:', error);
    return res.status(500).json({ error: message });
  }
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
