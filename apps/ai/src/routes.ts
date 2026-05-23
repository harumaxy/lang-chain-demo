import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { ragQuery } from "./rag/chain.ts";
import { ingestDocuments } from "./rag/ingest.ts";

const app = new Hono()
  .use("*", cors())

  .get("/api/health", async (c) => {
    let ollama = false;
    let qdrant = false;

    try {
      const res = await fetch("http://localhost:11434/api/tags");
      ollama = res.ok;
    } catch {}

    try {
      const res = await fetch("http://localhost:6333/collections");
      qdrant = res.ok;
    } catch {}

    return c.json({ status: "ok" as const, ollama, qdrant });
  })

  .post("/api/ingest", async (c) => {
    const documentCount = await ingestDocuments();
    return c.json({ status: "ok" as const, documentCount });
  })

  .post(
    "/api/chat",
    zValidator("json", z.object({ message: z.string().min(1) })),
    async (c) => {
      const { message } = c.req.valid("json");
      const { stream, sources } = await ragQuery(message);

      return streamSSE(c, async (sseStream) => {
        let started = false;
        for await (const chunk of stream) {
          if (!chunk) {
            if (!started) {
              await sseStream.writeSSE({ data: "", event: "ping" });
            }
            continue;
          }
          started = true;
          await sseStream.writeSSE({
            data: JSON.stringify({ type: "chunk", content: chunk }),
            event: "message",
          });
        }

        await sseStream.writeSSE({
          data: JSON.stringify({
            type: "sources",
            sources: sources.map((s) => ({ source: s })),
          }),
          event: "message",
        });
      });
    },
  );

export default app;
export type AppType = typeof app;
