import { ChatOllama } from "@langchain/ollama";
import { StringOutputParser } from "@langchain/core/output_parsers";
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} from "@langchain/core/prompts";
import type { Document } from "@langchain/core/documents";
import { getVectorStore } from "./vectorstore.ts";

const llm = new ChatOllama({
  model: "qwen3:8b",
  baseUrl: "http://localhost:11434",
});

const SYSTEM_PROMPT = `/no_think
あなたはTechFlow株式会社の社内Q&Aアシスタントです。
以下の社内ドキュメントの内容のみを元に、正確に回答してください。
ドキュメントに記載のない情報については「その情報は社内ドキュメントに見つかりませんでした」と回答してください。
回答は簡潔で分かりやすい日本語で行ってください。

【参考ドキュメント】
{context}`;

const prompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(SYSTEM_PROMPT),
  HumanMessagePromptTemplate.fromTemplate("{question}"),
]);

export interface RagResult {
  stream: AsyncGenerator<string>;
  sources: Document[];
}

function deduplicateDocs(docs: Document[]): Document[] {
  const seen = new Set<string>();
  return docs.filter((doc) => {
    const key = `${doc.metadata.source}:${doc.pageContent.slice(0, 100)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function ragQuery(question: string): Promise<RagResult> {
  const vectorStore = await getVectorStore();
  const rawDocs = await vectorStore.similaritySearch(question, 8);
  const relevantDocs = deduplicateDocs(rawDocs).slice(0, 5);

  const context = relevantDocs
    .map((doc) => `[${doc.metadata.source}]\n${doc.pageContent}`)
    .join("\n\n---\n\n");

  const chain = prompt.pipe(llm).pipe(new StringOutputParser());

  const stream = await chain.stream({
    context,
    question,
  });

  async function* generateChunks() {
    for await (const chunk of stream) {
      yield chunk;
    }
  }

  return {
    stream: generateChunks(),
    sources: relevantDocs,
  };
}
