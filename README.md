# Recruiting Agent

Local-first AI workflow for candidate search, ranking, and outreach generation from a single hiring prompt.

## Product Preview

![Workflow dashboard](docs/screenshots/01-workflow-dashboard.png)
![Candidate ranking + trace](docs/screenshots/02-ranking-trace.png)

## What This Project Shows

- End-to-end LLM workflow orchestration, not just a prompt demo.
- Resume ingestion from `.docx` plus RAG-style retrieval.
- Explainable ranking with score breakdown (skill, experience, location, semantic fit).
- Automated outreach draft generation for top matches.
- Practical fallbacks when local model services are unavailable.

## How It Works

Given a hiring query, the backend runs a structured pipeline:

1. `parse_job_spec` to extract role requirements from natural language.
2. `retrieve_candidate_profiles` from PostgreSQL and/or resume index.
3. `rank_candidates` with deterministic weighted scoring.
4. `generate_outreach` for shortlisted candidates.

The frontend then displays pipeline stats, tool trace, candidate cards, and generated outreach.

## Workflow Diagram

```mermaid
flowchart LR
    A[Hiring Query] --> B[parse_job_spec]
    B --> C[retrieve_candidate_profiles]
    C --> D[rank_candidates]
    D --> E[generate_outreach]
    E --> F[UI: shortlist, scores, tool trace]

    G[.docx resumes] --> C
    H[PostgreSQL index] --> C
    I[Ollama] --> B
    I --> E
```

Text flow: Query enters the API, role requirements are extracted, candidates are retrieved from indexed data, deterministic ranking is applied, and outreach drafts are generated for top matches before results are rendered in the dashboard.

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Retrieval: PostgreSQL + local resume index
- Local model runtime: Ollama
- Infra: Docker Compose

## Quick Start

Prerequisites:

- Node.js 20+
- Docker Desktop

```bash
npm install
cp .env.example .env
docker compose up -d postgres
npm run dev
```

If you are using this repo's Ollama container:

```bash
docker compose up -d ollama
./scripts/init-ollama.sh llama3.2:1b
docker exec -it ai-recruiting-ollama ollama pull nomic-embed-text
```

If port `11434` is already used by another Ollama container, keep using that container and leave:

```env
OLLAMA_BASE_URL=http://localhost:11434
```

Open:

- `http://localhost:5173` (web app)
- `http://localhost:8787/api/health` (API health)

## API

- `POST /api/workflow/run`
- `POST /api/resumes/upload`
- `POST /api/resumes/reindex`
- `GET /api/resumes/index-status`
- `GET /api/resumes/candidates`

## Environment

Default `.env.example` values:

```env
PORT=8787
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:1b
OLLAMA_EMBED_MODEL=nomic-embed-text
POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/ai_recruiting
```

## Notes

- Resume parsing works best when `.docx` includes clear fields (`Name`, `Title`, `Location`, `Experience`, `Summary`).
- Scoring is intentionally transparent and inspectable.
- This is a production-minded prototype focused on fast iteration and clear system behavior.
