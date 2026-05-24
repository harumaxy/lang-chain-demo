import { serve } from "bun";
import app from "./routes.ts";
import { ingestDocuments } from "./rag/ingest.ts";

const port = 3000;

console.log("Ingesting Q&A documents...");
const count = await ingestDocuments();
console.log(`Ingested ${count} chunks`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running at http://localhost:${port}`);
