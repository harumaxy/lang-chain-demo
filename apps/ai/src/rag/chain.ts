import { ChatOllama } from "@langchain/ollama";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { Document } from "@langchain/core/documents";
import { getVectorStore } from "./vectorstore.ts";
import { Glob } from "bun";

const llm = new ChatOllama({
  model: "qwen3:8b",
  baseUrl: "http://localhost:11434",
});

const QA_DIR = new URL("../../../../data/qa/", import.meta.url).pathname;

const searchDocuments = tool(
  async ({ query }) => {
    const vectorStore = await getVectorStore();
    const rawDocs = await vectorStore.similaritySearch(query, 8);
    const deduped = deduplicateDocs(rawDocs).slice(0, 5);
    return deduped
      .map((doc) => `[${doc.metadata.source}]\n${doc.pageContent}`)
      .join("\n\n---\n\n");
  },
  {
    name: "search_documents",
    description:
      "社内ドキュメントをキーワードで検索します。特定のトピック（休暇、経費、GitHub等）について調べたい場合に使ってください。",
    schema: z.object({
      query: z.string().describe("検索クエリ（例: 有給休暇の申請方法）"),
    }),
  }
);

const listDocuments = tool(
  async () => {
    const glob = new Glob("*.md");
    const files: { name: string; title: string }[] = [];
    for await (const path of glob.scan(QA_DIR)) {
      const content = await Bun.file(`${QA_DIR}${path}`).text();
      const titleMatch = content.match(/^# (.+)$/m);
      files.push({
        name: path,
        title: titleMatch?.[1] ?? path,
      });
    }
    return files.map((f) => `- ${f.name}: ${f.title}`).join("\n");
  },
  {
    name: "list_documents",
    description:
      "利用可能な社内ドキュメントの一覧を返します。どのようなドキュメントがあるか、カテゴリを知りたい場合に使ってください。",
    schema: z.object({}),
  }
);

const tools = [searchDocuments, listDocuments];

const SYSTEM_PROMPT = `/no_think
あなたはTechFlow株式会社の社内Q&Aアシスタントです。
ツールを使って社内ドキュメントを検索し、その内容のみを元に正確に回答してください。
ドキュメントに記載のない情報については「その情報は社内ドキュメントに見つかりませんでした」と回答してください。
回答は簡潔で分かりやすい日本語で行ってください。`;

function deduplicateDocs(docs: Document[]): Document[] {
  const seen = new Set<string>();
  return docs.filter((doc) => {
    const key = `${doc.metadata.source}:${doc.pageContent.slice(0, 100)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface RagResult {
  stream: AsyncGenerator<string>;
  sources: string[];
}

export async function ragQuery(question: string): Promise<RagResult> {
  const llmWithTools = llm.bindTools(tools);

  const messages: Array<
    | { role: "system"; content: string }
    | { role: "user"; content: string }
    | { role: "assistant"; content: string; tool_calls?: any[] }
    | { role: "tool"; content: string; tool_call_id: string }
  > = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: question },
  ];

  // Agent loop: let the LLM call tools until it produces a final answer
  const usedSources = new Set<string>();
  const maxIterations = 5;

  for (let i = 0; i < maxIterations; i++) {
    const response = await llmWithTools.invoke(messages);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      // No tool calls = final answer, stream it
      // Re-invoke with streaming for the final response
      const streamingLlm = llm.bindTools(tools);
      const stream = await streamingLlm.stream(messages);

      async function* generateChunks() {
        for await (const chunk of stream) {
          if (typeof chunk.content === "string" && chunk.content) {
            yield chunk.content;
          }
        }
      }

      return {
        stream: generateChunks(),
        sources: [...usedSources],
      };
    }

    // Process tool calls
    messages.push({
      role: "assistant",
      content: typeof response.content === "string" ? response.content : "",
      tool_calls: response.tool_calls,
    });

    for (const toolCall of response.tool_calls) {
      const toolFn = tools.find((t) => t.name === toolCall.name);
      if (!toolFn) {
        messages.push({
          role: "tool",
          content: `Tool ${toolCall.name} not found`,
          tool_call_id: toolCall.id ?? "",
        });
        continue;
      }

      const result = await toolFn.invoke(toolCall.args);

      // Track sources from search results
      if (toolCall.name === "search_documents") {
        const sourceMatches = String(result).matchAll(/\[([^\]]+\.md)\]/g);
        for (const m of sourceMatches) {
          if (m[1]) usedSources.add(m[1]);
        }
      } else if (toolCall.name === "list_documents") {
        const sourceMatches = String(result).matchAll(/- ([^\s:]+\.md)/g);
        for (const m of sourceMatches) {
          if (m[1]) usedSources.add(m[1]);
        }
      }

      messages.push({
        role: "tool",
        content: String(result),
        tool_call_id: toolCall.id ?? "",
      });
    }
  }

  // Fallback: max iterations reached
  async function* fallback() {
    yield "申し訳ございません。回答の生成に時間がかかりすぎました。質問を変えてお試しください。";
  }

  return { stream: fallback(), sources: [...usedSources] };
}
