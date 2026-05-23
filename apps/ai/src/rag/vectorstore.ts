import { QdrantVectorStore } from "@langchain/qdrant";
import { embeddings } from "./embeddings.ts";

const COLLECTION_NAME = "techflow-qa";

export async function getVectorStore(): Promise<QdrantVectorStore> {
  return QdrantVectorStore.fromExistingCollection(embeddings, {
    url: "http://localhost:6333",
    collectionName: COLLECTION_NAME,
  });
}

export { COLLECTION_NAME };
