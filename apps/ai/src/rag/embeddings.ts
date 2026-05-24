import { OllamaEmbeddings } from "@langchain/ollama";

export const embeddings = new OllamaEmbeddings({
  model: "nomic-embed-text",
  baseUrl: "http://localhost:11434",
});
