import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { QdrantVectorStore } from "@langchain/qdrant";
import { embeddings } from "./embeddings.ts";
import { COLLECTION_NAME } from "./vectorstore.ts";
import { Document } from "@langchain/core/documents";
import { Glob } from "bun";

export async function ingestDocuments(): Promise<number> {
  const glob = new Glob("*.md");
  const qaDir = new URL("../../../../data/qa/", import.meta.url).pathname;
  const documents: Document[] = [];

  for await (const path of glob.scan(qaDir)) {
    const file = Bun.file(`${qaDir}${path}`);
    const content = await file.text();
    documents.push(
      new Document({
        pageContent: content,
        metadata: { source: path },
      })
    );
  }

  const splitter = new RecursiveCharacterTextSplitter({
    separators: ["---", "\n## ", "\n# ", "\n\n"],
    chunkSize: 500,
    chunkOverlap: 50,
  });

  const splits = await splitter.splitDocuments(documents);

  const vectorStore = await QdrantVectorStore.fromDocuments(
    splits,
    embeddings,
    {
      url: "http://localhost:6333",
      collectionName: COLLECTION_NAME,
    }
  );

  console.log(`Ingested ${splits.length} chunks from ${documents.length} files`);
  return splits.length;
}
