import { hc } from "hono/client";
import type { AppType } from "../../../apps/ai/src/routes.ts";

export const client = hc<AppType>("http://localhost:3000");

export interface ChatChunk {
  type: "chunk";
  content: string;
}

export interface ChatSources {
  type: "sources";
  sources: { source: string; content: string }[];
}

export type ChatEvent = ChatChunk | ChatSources;

export async function* streamChat(
  message: string,
  options?: RequestInit,
): AsyncGenerator<ChatEvent> {
  const res = await fetch("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    ...options,
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data:")) {
        const data = line.slice(5).trim();
        if (data) {
          yield JSON.parse(data) as ChatEvent;
        }
      }
    }
  }
}
