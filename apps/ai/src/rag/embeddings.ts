import { OllamaEmbeddings } from "@langchain/ollama";

export const embeddings = new OllamaEmbeddings({
  model: "bge-m3",
  baseUrl: "http://localhost:11434",
});
