import { serve } from "bun";
import { ingestDocuments } from "./rag/ingest.ts";
import app from "./routes.ts";

const port = 3000;

console.log("Ingesting Q&A documents...");
const count = await ingestDocuments();
console.log(`Ingested ${count} chunks`);

serve({
  fetch: app.fetch,
  port,
  idleTimeout: 20,
});

console.log(`Server running at http://localhost:${port}`);
