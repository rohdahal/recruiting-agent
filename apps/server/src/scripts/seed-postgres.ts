import 'dotenv/config';
import { getResumeRagIndex } from '../rag.js';
import { upsertCandidatesToPostgres } from '../postgres.js';

async function main() {
  const index = await getResumeRagIndex(true);
  const upserted = await upsertCandidatesToPostgres(index.candidates);

  console.log(
    JSON.stringify(
      {
        ok: true,
        retrievalMode: index.mode,
        candidatesIndexed: index.candidates.length,
        candidatesUpserted: upserted
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('Failed to seed Postgres candidate index');
  console.error(error);
  process.exit(1);
});
