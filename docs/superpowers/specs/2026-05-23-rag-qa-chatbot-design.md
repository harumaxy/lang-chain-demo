# RAG社内Q&Aチャットボット 設計書

## 概要

架空のソフトウェア開発企業「TechFlow株式会社」の社内Q&Aナレッジベースを元に、自然言語で質問応答できるRAG（Retrieval Augmented Generation）チャットボットを構築する。LangChain.jsのRAG機能をデモする目的。

## アーキテクチャ

```
apps/
  ai/      Hono APIサーバー (LangChain + RAG処理)
  front/   React + Vite (ブラウザチャットUI)
  cli/     Ink (ターミナルチャットUI)

data/
  qa/      Q&A Markdownファイル (8カテゴリ)

外部サービス (ローカル):
  Ollama   ローカルLLM + エンベディング
  Qdrant   ベクトルストア (Docker)
```

### データフロー

```
1. 起動時 (Ingest)
   data/qa/*.md → ドキュメントローダー → テキスト分割 → Ollama Embedding → Qdrant に保存

2. 質問応答 (Query)
   ユーザー質問 → Ollama Embedding → Qdrant 類似検索 → 関連ドキュメント取得
   → LLM (Ollama) にコンテキスト付きで質問 → ストリーミング回答
```

## 技術スタック

| コンポーネント | 技術 | パッケージ |
|---|---|---|
| ランタイム | Bun | - |
| APIサーバー | Hono | `hono` |
| 型安全API呼び出し | Hono RPC | `hono/client` |
| LLMフレームワーク | LangChain.js | `langchain`, `@langchain/core` |
| チャットモデル | Ollama (qwen3:8b) | `@langchain/ollama` |
| エンベディング | Ollama (nomic-embed-text) | `@langchain/ollama` |
| ベクトルストア | Qdrant (Docker) | `@langchain/qdrant` |
| フロントエンド | React + Vite | `react`, `vite` |
| CLIフレームワーク | Ink | `ink`, `ink-text-input` |
| モノレポ | Bun workspaces | - |

## apps/ai (APIサーバー)

### 責務

- Q&Aドキュメントの取り込み（ingest）
- ベクトル検索 + LLM回答生成（RAGパイプライン）
- Hono RPCによる型付きAPI公開

### APIエンドポイント

#### `POST /api/chat`

質問を受け取り、RAGパイプラインで回答をストリーミング返却する。

- Request: `{ message: string }`
- Response: `text/event-stream` (Server-Sent Events)
  - 各チャンクに部分的な回答テキストを含む
  - 最終チャンクに参照元ドキュメント情報を含む

#### `POST /api/ingest`

Q&Aデータを再取り込みする。起動時にも自動実行される。

- Request: なし
- Response: `{ status: "ok", documentCount: number }`

#### `GET /api/health`

ヘルスチェック。Ollama・Qdrantへの接続確認を含む。

- Response: `{ status: "ok", ollama: boolean, qdrant: boolean }`

### RAGパイプライン構成

```typescript
// 1. ドキュメントローダー
DirectoryLoader + TextLoader で data/qa/*.md を読み込み

// 2. テキスト分割
RecursiveCharacterTextSplitter でQ&A単位に分割
  - セパレーター: "---" (Q&A間の区切り)
  - チャンクサイズ: 500文字
  - オーバーラップ: 50文字

// 3. エンベディング + ストア
OllamaEmbeddings → QdrantVectorStore に保存

// 4. 検索 + 生成
QdrantVectorStore.similaritySearch() → 上位3件取得
→ SystemPrompt + 検索結果 + ユーザー質問 → ChatOllama → ストリーミング回答
```

### 型エクスポート

Honoのルート定義から型をexportし、front/cliが `hono/client` で型安全に呼び出す。

```typescript
// apps/ai/src/routes.ts
const app = new Hono()
  .post("/api/chat", ...)
  .post("/api/ingest", ...)
  .get("/api/health", ...);

export type AppType = typeof app;
```

## apps/front (Web UI)

### 責務

- ブラウザベースのチャットインターフェース
- SSEによるストリーミング表示
- 参照元ドキュメントの表示

### 画面構成

単一ページのチャットUI:
- ヘッダー: アプリ名「TechFlow社内Q&A」
- メッセージエリア: ユーザーとAIの会話履歴
- 入力エリア: テキスト入力 + 送信ボタン
- 参照元パネル: 回答の根拠となったQ&Aドキュメントを表示

### API呼び出し

```typescript
import { hc } from "hono/client";
import type { AppType } from "ai/src/routes";

const client = hc<AppType>("http://localhost:3000");
```

## apps/cli (ターミナル UI)

### 責務

- ターミナルベースのチャットインターフェース
- Inkによるリアルタイムレンダリング
- ストリーミング表示 + スピナー

### UI構成

```
TechFlow 社内Q&A (CLI)
─────────────────────
You: 休暇の申請方法を教えて

AI: 休暇の申請は以下の手順で行います...
    [参照: leave.md]

You: _
```

### API呼び出し

front と同様に `hono/client` で型安全に呼び出す。

## data/qa (Q&Aデータ)

架空の企業「TechFlow株式会社」の社内Q&A。Markdownファイル8つ、各ファイルに5-8件のQ&Aを含む（合計約50件）。

### ファイル一覧

| ファイル | カテゴリ | 内容例 |
|---|---|---|
| `saas-accounts.md` | SaaSアカウント | Slack/GitHub/Figmaのアカウント発行・削除手順 |
| `billing.md` | 請求 | 請求書の発行方法、経費精算、振込先 |
| `daily-report.md` | 日報 | 日報テンプレート、提出先、週報との違い |
| `github.md` | GitHub管理 | リポジトリ命名規則、PR規約、CIルール |
| `approval.md` | 申請・稟議 | 稟議書の書き方、承認フロー、金額基準 |
| `calendar.md` | カレンダー | 会議室予約、定例作成、カレンダー共有 |
| `benefits.md` | 福利厚生 | 書籍購入、リモートワーク手当、健康診断 |
| `leave.md` | 休暇 | 有給申請、特別休暇、振替休日の取り方 |

### フォーマット

```markdown
# カテゴリ名

## Q: 質問文

回答文。具体的な手順や情報を含む。

---

## Q: 次の質問文

回答文。

---
```

## 起動方法

### 前提条件

- Bun がインストール済み
- Ollama がインストール済み + モデルがpull済み
  - `ollama pull qwen3:8b`
  - `ollama pull nomic-embed-text`
- Docker がインストール済み

### 起動手順

```bash
# 1. Qdrant を起動
docker run -d -p 6333:6333 qdrant/qdrant

# 2. 依存関係インストール
bun install

# 3. APIサーバー起動 (データ取り込みも自動実行)
cd apps/ai && bun run dev

# 4a. Web UI 起動
cd apps/front && bun run dev

# 4b. CLI 起動
cd apps/cli && bun run start
```

## スコープ外

- ユーザー認証・認可
- 会話履歴の永続化（セッション中のみ保持）
- 複数ユーザー対応
- Q&Aデータの管理UI（データはMarkdownファイルで直接編集）
- デプロイ・CI/CD設定
