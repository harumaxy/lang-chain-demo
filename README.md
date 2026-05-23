# LangChain RAG Demo - Example社内Q&A

LangChain.jsを使ったRAG（Retrieval Augmented Generation）のデモアプリケーション。架空のソフトウェア開発企業「Example株式会社」の社内Q&Aに自然言語で質問応答できます。

## アーキテクチャ

- **apps/ai** - Hono APIサーバー（LangChain.js RAGパイプライン）
- **apps/front** - React + Vite（ブラウザチャットUI）
- **apps/cli** - Ink（ターミナルチャットUI）
- **data/qa** - Q&A Markdownデータ（8カテゴリ、約50件）

## 前提条件

- [Bun](https://bun.sh/)
- [Ollama](https://ollama.ai/) + モデル
- [Docker](https://www.docker.com/)

## セットアップ

### 1. Ollamaモデルの準備

    ollama pull qwen3:8b
    ollama pull bge-m3

### 2. Qdrantの起動

    docker compose up -d

### 3. 依存関係のインストール

    bun install

### 4. APIサーバーの起動（Q&Aデータの取り込みも自動実行）

    bun run dev:ai

### 5a. Web UIの起動

    bun run dev:front

ブラウザで http://localhost:5173 を開く

### 5b. CLIの起動

    bun run start:cli

## 技術スタック

| コンポーネント | 技術 |
|---|---|
| ランタイム | Bun |
| APIサーバー | Hono + Hono RPC |
| LLM | Ollama (qwen3:8b) |
| エンベディング | Ollama (bge-m3) |
| ベクトルストア | Qdrant |
| RAGフレームワーク | LangChain.js |
| フロントエンド | React + Vite |
| CLI | Ink |
