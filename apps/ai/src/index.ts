import { serve } from "bun";
import app from "./routes.ts";

const port = 3000;

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running at http://localhost:${port}`);
