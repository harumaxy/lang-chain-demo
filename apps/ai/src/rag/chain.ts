import type { Document } from "@langchain/core/documents";
import type { ToolCall } from "@langchain/core/messages/tool";
import { tool } from "@langchain/core/tools";
import { ChatOllama } from "@langchain/ollama";
import { Glob } from "bun";
import { z } from "zod";
import { getVectorStore } from "./vectorstore.ts";

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
  },
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
  },
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
    | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
    | { role: "tool"; content: string; tool_call_id: string }
  > = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: question },
  ];

  // Agentループ: LLMがツール呼び出しをやめて最終回答を返すまで繰り返す
  const usedSources = new Set<string>();
  const maxIterations = 5;

  for (let i = 0; i < maxIterations; i++) {
    // LLMに現在のメッセージ履歴を渡して応答を取得
    const response = await llmWithTools.invoke(messages);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      // ツール呼び出しなし = LLMが最終回答を出した
      // ストリーミングで再度呼び出して、チャンクごとに返す
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

    // LLMがツール呼び出しを要求した → アシスタントの応答を履歴に追加
    messages.push({
      role: "assistant",
      content: typeof response.content === "string" ? response.content : "",
      tool_calls: response.tool_calls,
    });

    // 要求された各ツールを実行する
    for (const toolCall of response.tool_calls) {
      // ツール名から実行する関数を探す
      const toolFn = tools.find((t) => t.name === toolCall.name);
      if (!toolFn) {
        messages.push({
          role: "tool",
          content: `ツール ${toolCall.name} が見つかりません`,
          tool_call_id: toolCall.id ?? "",
        });
        continue;
      }

      // ツールを実行
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tools配列のunion型でinvokeシグネチャが非互換のためanyで回避
      const result = await (toolFn as any).invoke(toolCall.args);

      // 参照元ドキュメントを記録（UIで「参照:」として表示するため）
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

      // ツール実行結果を履歴に追加（tool_call_idで呼び出しと結果を紐付け）
      messages.push({
        role: "tool",
        content: String(result),
        tool_call_id: toolCall.id ?? "",
      });
    }
    // ループ先頭に戻り、ツール結果を含む履歴でLLMを再度呼び出す
  }

  // 最大ループ回数に達した場合のフォールバック
  async function* fallback() {
    yield "申し訳ございません。回答の生成に時間がかかりすぎました。質問を変えてお試しください。";
  }

  return { stream: fallback(), sources: [...usedSources] };
}
