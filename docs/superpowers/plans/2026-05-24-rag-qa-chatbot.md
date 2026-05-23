# RAG社内Q&Aチャットボット Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LangChain.jsを使ったRAGベースの社内Q&Aチャットボットを構築する（APIサーバー + Web UI + CLI）

**Architecture:** Hono APIサーバーがLangChain.jsのRAGパイプライン（Ollama + Qdrant）を提供し、React+ViteのWeb UIとInkのCLIが hono/client で型安全にAPIを呼び出す。Q&AデータはMarkdownファイルで管理し、起動時にベクトル化してQdrantに格納する。

**Tech Stack:** Bun, Hono, LangChain.js, @langchain/ollama, @langchain/qdrant, React+Vite, Ink, Qdrant (Docker)

---

## File Structure

```
apps/
  ai/
    src/
      index.ts          エントリーポイント (Hono サーバー起動)
      routes.ts          APIルート定義 + AppType export
      rag/
        embeddings.ts    OllamaEmbeddings 初期化
        vectorstore.ts   Qdrant接続 + 検索
        ingest.ts        ドキュメント読み込み・分割・格納
        chain.ts         RAGチェーン (検索 + LLM回答生成)
    package.json
    tsconfig.json
  front/
    src/
      main.tsx           Reactエントリーポイント
      App.tsx            チャットアプリ本体
      components/
        ChatMessage.tsx  メッセージ表示コンポーネント
        ChatInput.tsx    入力フォームコンポーネント
        Sources.tsx      参照元ドキュメント表示
      lib/
        api.ts           hono/client 初期化
    index.html
    vite.config.ts
    package.json
    tsconfig.json
  cli/
    src/
      index.tsx          Ink エントリーポイント
      App.tsx            チャットアプリ本体
      components/
        MessageList.tsx  メッセージ一覧表示
        Input.tsx        入力コンポーネント
      lib/
        api.ts           hono/client 初期化
    package.json
    tsconfig.json
data/
  qa/
    saas-accounts.md
    billing.md
    daily-report.md
    github.md
    approval.md
    calendar.md
    benefits.md
    leave.md
```

---

## Task 1: プロジェクト基盤セットアップ

**Files:**
- Modify: `apps/ai/package.json`
- Modify: `apps/ai/tsconfig.json`
- Create: `apps/ai/src/index.ts`
- Delete content: `apps/ai/index.ts` (後で削除)

- [ ] **Step 1: Qdrant Dockerコンテナを起動**

```bash
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant
```

確認:
```bash
docker ps | grep qdrant
```
Expected: qdrant コンテナが running 状態

- [ ] **Step 2: Ollamaにエンベディングモデルを追加**

```bash
ollama pull nomic-embed-text
```

確認:
```bash
ollama list | grep nomic
```
Expected: `nomic-embed-text` が表示される

- [ ] **Step 3: apps/ai に依存パッケージをインストール**

```bash
cd apps/ai
bun add hono @langchain/core @langchain/ollama @langchain/qdrant langchain zod
```

- [ ] **Step 4: apps/ai/tsconfig.json を更新**

`apps/ai/tsconfig.json` を以下に置き換える:

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,
    "types": ["bun"],
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noPropertyAccessFromIndexSignature": false,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 5: apps/ai/package.json に scripts を追加**

`apps/ai/package.json` の中に以下のscriptsを追加:

```json
{
  "scripts": {
    "dev": "bun --hot src/index.ts",
    "start": "bun src/index.ts"
  }
}
```

- [ ] **Step 6: エントリーポイントを作成**

`apps/ai/src/index.ts`:

```typescript
import { serve } from "bun";
import app from "./routes.ts";

const port = 3000;

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running at http://localhost:${port}`);
```

- [ ] **Step 7: 最小限のルートを作成して動作確認**

`apps/ai/src/routes.ts`:

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono()
  .use("*", cors())
  .get("/api/health", (c) => {
    return c.json({ status: "ok" as const });
  });

export default app;
export type AppType = typeof app;
```

- [ ] **Step 8: サーバー起動を確認**

```bash
cd apps/ai && bun run dev
```

別ターミナルで:
```bash
curl http://localhost:3000/api/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 9: 旧 index.ts を削除してコミット**

```bash
cd apps/ai && rm index.ts
git add -A apps/ai/
git commit -m "feat(ai): setup Hono server with health endpoint"
```

---

## Task 2: Q&Aデータ作成

**Files:**
- Create: `data/qa/saas-accounts.md`
- Create: `data/qa/billing.md`
- Create: `data/qa/daily-report.md`
- Create: `data/qa/github.md`
- Create: `data/qa/approval.md`
- Create: `data/qa/calendar.md`
- Create: `data/qa/benefits.md`
- Create: `data/qa/leave.md`

- [ ] **Step 1: data/qa ディレクトリを作成**

```bash
mkdir -p data/qa
```

- [ ] **Step 2: saas-accounts.md を作成**

`data/qa/saas-accounts.md`:

```markdown
# SaaSアカウント管理

## Q: 新しいSaaSアカウントを発行してもらうにはどうすればいいですか？

Slackの #it-support チャンネルで、以下の情報を添えてリクエストしてください。

1. 対象サービス名（Slack, GitHub, Figma, Jira, Notion, AWS等）
2. 利用目的（プロジェクト名を記載）
3. 必要な権限レベル（閲覧のみ / 編集 / 管理者）

通常、申請から1営業日以内にIT部門が対応します。管理者権限の場合はマネージャーの承認が必要です。

---

## Q: 退職者のアカウント削除はどのように行われますか？

退職日の前営業日にIT部門が全SaaSアカウントを一括停止します。手順は以下の通りです。

1. 人事部門から退職者リストがIT部門に共有される（退職日の5営業日前）
2. IT部門が対象者のアカウント一覧を作成
3. 退職日前営業日の18:00にアカウントを一括無効化
4. データのバックアップが必要な場合は、事前にマネージャーが #it-support で依頼

---

## Q: パスワードを忘れた場合はどうすればいいですか？

各サービスの「パスワードを忘れた」機能をまず試してください。それでも解決しない場合は、#it-support チャンネルで以下を伝えてください。

1. 対象サービス名
2. 登録メールアドレス
3. 本人確認のため社員番号

SSO（シングルサインオン）対応サービスの場合は、Google Workspace のパスワードをリセットすれば全て連動します。SSO対応サービス一覧は社内Wiki「SSO対応サービス一覧」を参照してください。

---

## Q: 二要素認証（2FA）の設定は必須ですか？

はい、全SaaSサービスで二要素認証の設定が必須です。入社時のセキュリティ研修で設定方法を案内しています。

推奨アプリ: Google Authenticator または 1Password
SMS認証は非推奨です（SIMスワップ攻撃のリスクがあるため）。

設定が完了したら、#it-support で「2FA設定完了」と報告してください。

---

## Q: 個人のSaaSアカウントを業務で使ってもいいですか？

いいえ、業務では必ず会社が発行したアカウントを使用してください。個人アカウントの業務利用は以下の理由で禁止されています。

1. 情報漏洩リスク（退職時にデータが個人に残る）
2. 監査対応が困難
3. ライセンス違反の可能性

違反が発覚した場合、セキュリティインシデントとして報告されます。
```

- [ ] **Step 3: billing.md を作成**

`data/qa/billing.md`:

```markdown
# 請求・経費精算

## Q: クライアントへの請求書はどのように発行しますか？

請求書の発行手順は以下の通りです。

1. freee会計にログイン
2. 「取引」→「請求書」→「新規作成」
3. テンプレート「TechFlow標準請求書」を選択
4. 必要事項を入力（クライアント名、金額、支払期限、案件名）
5. マネージャーの承認後、PDF出力してメールで送付

支払期限は原則「月末締め翌月末払い」です。特別な支払条件がある場合は契約書を確認してください。

---

## Q: 経費精算の方法を教えてください。

経費精算はfreee経費精算アプリで行います。

1. アプリでレシートを撮影
2. 金額・日付・勘定科目を入力
3. 「申請」ボタンを押す
4. マネージャーが承認
5. 翌月25日の給与と一緒に振り込まれる

申請期限: 発生月の翌月5日まで
対象経費: 交通費、書籍購入、外部セミナー参加費、業務用備品

---

## Q: 交通費の精算はどうすればいいですか？

交通費は以下のルールで精算してください。

- 通勤交通費: 入社時に届け出た経路で自動支給（変更時は人事に届出）
- 業務交通費: freee経費精算アプリで都度申請
- タクシー利用: 原則禁止。終電後やクライアント訪問時のみ、事前にマネージャー承認を得て利用可
- 出張: 出張申請書を事前に提出し、出張後に実費精算

ICカードの履歴をスクリーンショットで添付すると承認がスムーズです。

---

## Q: 立替払いの上限はありますか？

1回あたり5万円が立替払いの上限です。5万円を超える場合は、事前に経理部門に連絡して会社のクレジットカードでの支払い、または事前振込を手配してください。

緊急の場合は、マネージャーの承認メール（Slackでも可）を添えて、上限を超える立替精算を申請できます。

---

## Q: 領収書をなくした場合はどうすればいいですか？

領収書がない場合は「領収書紛失届」を提出してください。

1. freee経費精算アプリで通常通り申請
2. 備考欄に「領収書紛失」と記載
3. 利用明細（クレジットカード明細等）を代替証拠として添付
4. マネージャーの承認に加え、経理部門の承認が追加で必要

年間3回以上紛失すると、経理部門から個別指導があります。
```

- [ ] **Step 4: daily-report.md を作成**

`data/qa/daily-report.md`:

```markdown
# 日報・報告

## Q: 日報はどこに書けばいいですか？

日報はNotionの「日報データベース」に記入してください。

1. Notionを開く
2. サイドバーから「日報」を選択
3. 「+ 新規」ボタンで当日の日報を作成
4. テンプレートが自動適用されるので、各項目を埋める

提出期限: 当日の18:00まで（残業時は退勤前）
提出先: 自動的にマネージャーに通知されます

---

## Q: 日報のテンプレートを教えてください。

以下のテンプレートに従って記入してください。

```
【日付】YYYY/MM/DD
【本日の業務内容】
- タスク1: 内容と進捗（例: ログイン機能の実装 - 80%完了）
- タスク2: 内容と進捗

【課題・ブロッカー】
- 解決が必要な問題があれば記載

【明日の予定】
- 予定しているタスクを記載

【学び・気づき】
- 任意。技術的な発見やプロセス改善のアイデアなど
```

---

## Q: 週報と日報の違いは何ですか？

日報は毎日の業務記録、週報は1週間の振り返りと翌週の計画です。

- 日報: 毎日18:00までにNotionに記入
- 週報: 毎週金曜17:00までにSlackの #weekly-report チャンネルに投稿

週報には以下を含めてください。
1. 今週の成果（完了したタスク）
2. 来週の計画（予定タスク）
3. KPT（Keep/Problem/Try）

---

## Q: 日報を書き忘れた場合はどうなりますか？

翌営業日の午前中までに追記してください。備考欄に「追記」と記載してください。

3回以上連続で未提出の場合、マネージャーから個別に確認があります。日報は評価面談の参考資料にもなるため、できるだけ毎日記入することを推奨します。

---

## Q: リモートワーク時の日報に特別な記載は必要ですか？

リモートワーク時は通常の日報に加えて、以下を記載してください。

- 勤務場所（自宅/コワーキングスペース名）
- 勤務開始・終了時刻
- 中抜けがあった場合はその時間帯と理由

リモートワーク日はSlackのステータスを「リモートワーク中」に設定してください。
```

- [ ] **Step 5: github.md を作成**

`data/qa/github.md`:

```markdown
# GitHub リポジトリ管理

## Q: 新しいリポジトリを作成するルールはありますか？

はい、以下の命名規則とルールに従ってください。

命名規則: `{プロジェクト名}-{サービス名}` （例: `acme-backend`, `acme-frontend`）
- すべて小文字、ハイフン区切り
- Organization: `techflow-inc`

作成手順:
1. GitHub で `techflow-inc` Organization にリポジトリを作成
2. README.md にプロジェクト概要を記載
3. `.gitignore` を言語に合わせて設定
4. `main` ブランチをデフォルトブランチに設定
5. Branch Protection を有効化（後述）

---

## Q: ブランチの命名規則はありますか？

以下の規則に従ってください。

- feature/: 新機能 `feature/add-login-page`
- fix/: バグ修正 `fix/null-pointer-error`
- hotfix/: 緊急修正 `hotfix/security-patch`
- chore/: 設定変更等 `chore/update-dependencies`
- docs/: ドキュメント `docs/api-reference`

mainブランチへの直接pushは禁止です。必ずPull Requestを経由してください。

---

## Q: Pull Requestのルールを教えてください。

PRを作成する際は以下を守ってください。

1. タイトル: `[種別] 概要` 形式（例: `[Feature] ログイン機能の追加`）
2. 説明: テンプレートに従い、変更内容・影響範囲・テスト方法を記載
3. レビュワー: 最低1名のチームメンバーをアサイン
4. CI: 全てのチェックがパスしていること
5. マージ: Squash Merge を推奨

レビュー依頼後、24時間以内にレビューすることが期待されます。レビューが遅れる場合はSlackで連絡してください。

---

## Q: CIで何がチェックされますか？

GitHub Actionsで以下が自動実行されます。

1. Lint（ESLint / Biome）
2. 型チェック（TypeScript）
3. ユニットテスト
4. ビルド確認
5. セキュリティスキャン（dependabot alerts）

CIが失敗した場合、PRのマージはブロックされます。失敗したジョブのログを確認して修正してください。

---

## Q: シークレットやAPIキーをリポジトリに入れてしまった場合はどうすればいいですか？

即座に以下の手順を実行してください。

1. Slackの #security-incident チャンネルに報告
2. 漏洩したキーを該当サービスで無効化・ローテーション
3. git-filter-repo 等でGit履歴からシークレットを除去
4. インシデントレポートを作成（テンプレート: Notion「セキュリティインシデント」）

予防策:
- `.gitignore` に `.env` を含める
- pre-commitフックで `gitleaks` を実行する設定を推奨
```

- [ ] **Step 6: approval.md を作成**

`data/qa/approval.md`:

```markdown
# 申請・稟議

## Q: 稟議書はどのような場合に必要ですか？

以下の場合に稟議書の提出が必要です。

- 10万円以上の支出（ソフトウェアライセンス、外注費、備品購入等）
- 新規取引先との契約
- 社外サービスの新規導入
- 社内規程の変更

10万円未満の場合はマネージャーの口頭承認で対応可能です。

---

## Q: 稟議書の書き方を教えてください。

Notion「稟議書テンプレート」を使用してください。以下の項目を記入します。

1. 件名: 簡潔に（例: 「GitHub Copilot Business ライセンス追加購入」）
2. 申請者: 氏名と所属部門
3. 金額: 税込総額と内訳
4. 目的・理由: なぜ必要か、期待する効果
5. 代替案の検討: 他の選択肢との比較（最低2案）
6. リスク: 導入しない場合のリスク、導入した場合のリスク
7. スケジュール: いつまでに必要か

---

## Q: 承認フローはどうなっていますか？

金額に応じて承認者が変わります。

- 10万円〜50万円: マネージャー → 部長
- 50万円〜200万円: マネージャー → 部長 → 本部長
- 200万円以上: マネージャー → 部長 → 本部長 → 代表取締役

Notionのワークフロー機能で自動的に次の承認者に回付されます。承認・却下の通知はSlackで届きます。

標準処理期間: 申請から3営業日以内

---

## Q: 急ぎの稟議はどうすればいいですか？

稟議書の備考欄に「緊急」と記載し、各承認者にSlackのDMで直接連絡してください。

緊急稟議の基準:
- セキュリティインシデント対応
- クライアントからの緊急要請
- サービス障害対応に必要な支出

緊急稟議は後日、通常の承認プロセスで追認を受ける必要があります。

---

## Q: 稟議が却下された場合はどうすればいいですか？

却下理由を確認し、以下の対応を検討してください。

1. 内容を修正して再申請（却下理由への対応を明記）
2. 代替案で再申請
3. 次の四半期の予算計画に含める

再申請は却下から1週間以内に行ってください。同じ内容での3回目の申請は原則不可です。
```

- [ ] **Step 7: calendar.md を作成**

`data/qa/calendar.md`:

```markdown
# カレンダー・会議

## Q: 会議室の予約方法を教えてください。

Google Calendarから予約できます。

1. Google Calendarで予定を作成
2. 「会議室を追加」から空いている会議室を選択
3. 参加者を追加して保存

会議室一覧:
- 大会議室A（20名）: 3階
- 中会議室B, C（8名）: 3階
- 小会議室D, E, F（4名）: 各階

予約ルール:
- 最大2週間先まで予約可能
- 1回の予約は最大2時間
- 使用しない場合は必ずキャンセル（無断不使用3回でペナルティ）

---

## Q: 定例会議の作成ルールはありますか？

定例会議を作成する際は以下を守ってください。

1. Google Calendarで「繰り返し」設定を使用
2. タイトルに「【定例】」プレフィックスを付ける（例: 【定例】開発チーム朝会）
3. アジェンダをNotionに作成し、カレンダーの説明欄にリンクを貼る
4. 参加者の「任意」「必須」を適切に設定

定例のキャンセル・変更は前日までに参加者全員に通知してください。

---

## Q: 外部のお客様との打ち合わせ予定はどう作成しますか？

以下の手順で作成してください。

1. Google Calendarで予定を作成
2. タイトル: 「【外部MTG】クライアント名 - 議題」
3. 社内参加者をカレンダーに追加
4. 外部参加者にはメールで日程調整（Calendlyまたはメール直接）
5. オンラインの場合はGoogle Meetのリンクを自動追加

オフィス来訪の場合は、受付（1階）に来訪者情報を事前登録してください。

---

## Q: カレンダーの共有設定はどうなっていますか？

以下の設定を推奨します。

- 社内メンバー: 予定の詳細を閲覧可能
- チームメンバー: 予定の変更が可能
- 社外: 空き/予定ありのみ表示

設定方法: Google Calendar → 設定 → 特定のユーザーとの共有 → 権限を選択

全社員のカレンダーは「TechFlow全社カレンダー」で確認できます。

---

## Q: 会議のキャンセルポリシーはありますか？

以下のルールに従ってください。

- 社内会議: 開始1時間前までにキャンセル通知
- 外部会議: 前日の営業時間内にキャンセル通知
- 定例会議: 参加者の半数以上が欠席の場合はキャンセルを検討

キャンセル方法: Google Calendarで予定を削除し、「ゲストに通知」を選択
```

- [ ] **Step 8: benefits.md を作成**

`data/qa/benefits.md`:

```markdown
# 福利厚生

## Q: 書籍購入の補助はありますか？

はい、業務に関連する書籍は月額5,000円まで会社負担で購入できます。

申請方法:
1. freee経費精算で「書籍購入」カテゴリで申請
2. レシートまたは購入履歴のスクリーンショットを添付
3. 書名を備考欄に記載

電子書籍も対象です。技術書に限らず、ビジネス書やマネジメント書も対象です。月の上限を超えた分は自己負担となります。

---

## Q: リモートワーク手当はありますか？

はい、リモートワーク日数に応じて月額手当が支給されます。

- 週3日以上リモート: 月額5,000円
- フルリモート: 月額10,000円

手当は通信費・光熱費の補助目的です。別途、入社時にリモートワーク環境整備費として30,000円が支給されます（モニター、デスク、椅子等）。

---

## Q: 健康診断はいつ受けられますか？

年1回、毎年4月に全社一斉で実施します。

- 対象: 全正社員（契約社員は任意）
- 費用: 全額会社負担
- 場所: 提携クリニック（新宿メディカルセンター）またはオフィス内（巡回健診）

35歳以上の社員は人間ドック（上限30,000円まで会社負担）に変更可能です。日程は3月中にSlackの #hr-info で案内されます。

---

## Q: 資格取得の支援制度はありますか？

はい、業務に関連する資格の取得費用を会社が負担します。

対象資格例:
- AWS認定各種
- Google Cloud認定
- 情報処理技術者試験
- PMP（プロジェクトマネジメント）
- TOEIC（730点以上でお祝い金10,000円）

支援内容:
- 受験料: 全額会社負担（不合格の場合は1回まで再受験も負担）
- 教材費: 上限10,000円まで
- 合格お祝い金: 資格に応じて5,000円〜30,000円

---

## Q: 社内部活動・サークルはありますか？

はい、以下の部活動があります。参加は任意で、活動費は月額1人500円まで会社が補助します。

- フットサル部（毎月第2土曜）
- ボードゲーム部（毎週金曜18:30〜）
- 読書部（月1回読書会）
- ランニング部（毎週水曜朝7:00〜）
- 写真部（不定期撮影会）

新しい部活の設立は5名以上の参加者を集めて、人事部に申請してください。

---

## Q: 育児・介護支援はありますか？

はい、以下の制度があります。

育児支援:
- 産前産後休暇（法定通り）
- 育児休業（最大2年、男性も取得推奨）
- 時短勤務（小学校3年生まで）
- 病児保育費補助（1日上限5,000円）

介護支援:
- 介護休業（最大93日）
- 介護休暇（年5日、有給）
- 時短勤務（期間制限なし）

詳細は人事部またはSlackの #hr-info で相談してください。
```

- [ ] **Step 9: leave.md を作成**

`data/qa/leave.md`:

```markdown
# 休暇申請

## Q: 有給休暇の申請方法を教えてください。

freee人事労務から申請してください。

1. freee人事労務にログイン
2. 「勤怠」→「休暇申請」
3. 日付と休暇種別（有給休暇）を選択
4. 理由は任意（記入不要）
5. 申請を送信

申請期限: 取得日の3営業日前まで（急病等の場合は当日申請可）
マネージャーが承認すると、Slackで通知が届きます。

---

## Q: 有給休暇は何日もらえますか？

労働基準法に基づき、勤続年数に応じて付与されます。

- 入社6ヶ月後: 10日
- 1年6ヶ月: 11日
- 2年6ヶ月: 12日
- 3年6ヶ月: 14日
- 4年6ヶ月: 16日
- 5年6ヶ月: 18日
- 6年6ヶ月以上: 20日

未使用の有給は翌年度に繰り越せます（最大2年間有効）。残日数はfreee人事労務で確認できます。

---

## Q: 特別休暇にはどのようなものがありますか？

以下の特別休暇があります（すべて有給）。

- 慶弔休暇: 結婚5日、配偶者出産2日、忌引3〜5日
- リフレッシュ休暇: 勤続3年ごとに5日
- バースデー休暇: 誕生月に1日
- ボランティア休暇: 年2日
- 裁判員休暇: 必要日数

申請方法は有給休暇と同じく、freee人事労務から申請してください。休暇種別で該当する特別休暇を選択します。

---

## Q: 半日有給は取れますか？

はい、午前半休と午後半休が取得可能です。

- 午前半休: 13:00出社（9:00〜13:00が休暇）
- 午後半休: 13:00退社（13:00〜18:00が休暇）

時間単位の有給（1時間単位）は現在対応していません。今後導入を検討中です。

freee人事労務で休暇申請時に「半日」を選択してください。

---

## Q: 振替休日の取り方を教えてください。

休日出勤をした場合、振替休日を取得できます。

1. 休日出勤前: マネージャーに事前承認を得る
2. 休日出勤後: freee人事労務で「振替休日」を申請
3. 振替休日の取得期限: 休日出勤日から2ヶ月以内

振替休日は半日単位での取得も可能です。取得期限を過ぎた場合は、休日出勤手当（割増賃金）として給与に加算されます。

---

## Q: 長期休暇（1週間以上）を取る場合の注意点はありますか？

以下の手順で準備してください。

1. 2週間前までにマネージャーに相談
2. 担当業務の引き継ぎ資料を作成（Notionに記載）
3. Slackのステータスを「休暇中（MM/DD〜MM/DD）」に設定
4. Google Calendarに休暇予定を登録（チーム全体に公開）
5. 自動返信メールを設定（Gmail設定 → 不在通知）

緊急連絡先として、代理担当者の連絡先をチームに共有してください。
```

- [ ] **Step 10: コミット**

```bash
git add data/
git commit -m "feat: add TechFlow company Q&A data (8 categories, ~50 entries)"
```

---

## Task 3: RAGパイプライン実装（エンベディング・ベクトルストア・取り込み）

**Files:**
- Create: `apps/ai/src/rag/embeddings.ts`
- Create: `apps/ai/src/rag/vectorstore.ts`
- Create: `apps/ai/src/rag/ingest.ts`

- [ ] **Step 1: エンベディングモジュールを作成**

`apps/ai/src/rag/embeddings.ts`:

```typescript
import { OllamaEmbeddings } from "@langchain/ollama";

export const embeddings = new OllamaEmbeddings({
  model: "nomic-embed-text",
  baseUrl: "http://localhost:11434",
});
```

- [ ] **Step 2: ベクトルストアモジュールを作成**

`apps/ai/src/rag/vectorstore.ts`:

```typescript
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
```

- [ ] **Step 3: ドキュメント取り込みモジュールを作成**

`apps/ai/src/rag/ingest.ts`:

```typescript
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
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
```

- [ ] **Step 4: 取り込みの動作確認**

一時的なテストスクリプトを作って確認:

```bash
cd apps/ai
bun -e "import { ingestDocuments } from './src/rag/ingest.ts'; const count = await ingestDocuments(); console.log('Done:', count)"
```

Expected: `Ingested XX chunks from 8 files` と表示される

- [ ] **Step 5: コミット**

```bash
cd apps/ai
git add src/rag/
git commit -m "feat(ai): add RAG pipeline - embeddings, vectorstore, ingest"
```

---

## Task 4: RAGチェーン + APIルート実装

**Files:**
- Create: `apps/ai/src/rag/chain.ts`
- Modify: `apps/ai/src/routes.ts`
- Modify: `apps/ai/src/index.ts`

- [ ] **Step 1: RAGチェーンモジュールを作成**

`apps/ai/src/rag/chain.ts`:

```typescript
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

const SYSTEM_PROMPT = `あなたはTechFlow株式会社の社内Q&Aアシスタントです。
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

export async function ragQuery(question: string): Promise<RagResult> {
  const vectorStore = await getVectorStore();
  const relevantDocs = await vectorStore.similaritySearch(question, 3);

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
```

- [ ] **Step 2: routes.ts にチャット・取り込み・ヘルスチェックのルートを追加**

`apps/ai/src/routes.ts` を以下に置き換え:

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ragQuery } from "./rag/chain.ts";
import { ingestDocuments } from "./rag/ingest.ts";

const app = new Hono()
  .use("*", cors())

  .get("/api/health", async (c) => {
    let ollama = false;
    let qdrant = false;

    try {
      const res = await fetch("http://localhost:11434/api/tags");
      ollama = res.ok;
    } catch {}

    try {
      const res = await fetch("http://localhost:6333/collections");
      qdrant = res.ok;
    } catch {}

    return c.json({ status: "ok" as const, ollama, qdrant });
  })

  .post("/api/ingest", async (c) => {
    const documentCount = await ingestDocuments();
    return c.json({ status: "ok" as const, documentCount });
  })

  .post(
    "/api/chat",
    zValidator("json", z.object({ message: z.string().min(1) })),
    async (c) => {
      const { message } = c.req.valid("json");
      const { stream, sources } = await ragQuery(message);

      return streamSSE(c, async (sseStream) => {
        for await (const chunk of stream) {
          await sseStream.writeSSE({
            data: JSON.stringify({ type: "chunk", content: chunk }),
            event: "message",
          });
        }

        await sseStream.writeSSE({
          data: JSON.stringify({
            type: "sources",
            sources: sources.map((s) => ({
              source: s.metadata.source,
              content: s.pageContent.slice(0, 200),
            })),
          }),
          event: "message",
        });
      });
    }
  );

export default app;
export type AppType = typeof app;
```

- [ ] **Step 3: @hono/zod-validator をインストール**

```bash
cd apps/ai && bun add @hono/zod-validator
```

- [ ] **Step 4: index.ts を更新（起動時にingest実行）**

`apps/ai/src/index.ts` を以下に置き換え:

```typescript
import { serve } from "bun";
import app from "./routes.ts";
import { ingestDocuments } from "./rag/ingest.ts";

const port = 3000;

console.log("Ingesting Q&A documents...");
const count = await ingestDocuments();
console.log(`Ingested ${count} chunks`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running at http://localhost:${port}`);
```

- [ ] **Step 5: 動作確認**

```bash
cd apps/ai && bun run dev
```

別ターミナルで:
```bash
# ヘルスチェック
curl http://localhost:3000/api/health

# チャット (SSEストリーム)
curl -N -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"有給休暇の申請方法を教えて"}'
```

Expected: SSEストリームでチャンク + ソース情報が返る

- [ ] **Step 6: コミット**

```bash
cd apps/ai
git add src/ package.json
git commit -m "feat(ai): add RAG chain and chat/ingest/health API routes"
```

---

## Task 5: React + Vite フロントエンド

**Files:**
- Create: `apps/front/package.json`
- Create: `apps/front/tsconfig.json`
- Create: `apps/front/vite.config.ts`
- Create: `apps/front/index.html`
- Create: `apps/front/src/main.tsx`
- Create: `apps/front/src/App.tsx`
- Create: `apps/front/src/components/ChatMessage.tsx`
- Create: `apps/front/src/components/ChatInput.tsx`
- Create: `apps/front/src/components/Sources.tsx`
- Create: `apps/front/src/lib/api.ts`

- [ ] **Step 1: apps/front をVite + Reactで初期化**

```bash
cd apps
bunx create-vite front --template react-ts
cd front
bun install
```

- [ ] **Step 2: hono/client を追加**

```bash
cd apps/front
bun add hono
```

- [ ] **Step 3: API クライアントを作成**

`apps/front/src/lib/api.ts`:

```typescript
import { hc } from "hono/client";
import type { AppType } from "../../ai/src/routes.ts";

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
  message: string
): AsyncGenerator<ChatEvent> {
  const res = await fetch("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
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
```

- [ ] **Step 4: ChatMessage コンポーネントを作成**

`apps/front/src/components/ChatMessage.tsx`:

```tsx
interface Props {
  role: "user" | "assistant";
  content: string;
}

export function ChatMessage({ role, content }: Props) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: role === "user" ? "flex-end" : "flex-start",
        marginBottom: "12px",
      }}
    >
      <div
        style={{
          maxWidth: "70%",
          padding: "10px 14px",
          borderRadius: "12px",
          backgroundColor: role === "user" ? "#2563eb" : "#f3f4f6",
          color: role === "user" ? "white" : "#1f2937",
          whiteSpace: "pre-wrap",
        }}
      >
        {content}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Sources コンポーネントを作成**

`apps/front/src/components/Sources.tsx`:

```tsx
interface Source {
  source: string;
  content: string;
}

interface Props {
  sources: Source[];
}

export function Sources({ sources }: Props) {
  if (sources.length === 0) return null;

  return (
    <div
      style={{
        margin: "8px 0",
        padding: "8px 12px",
        borderLeft: "3px solid #d1d5db",
        fontSize: "13px",
        color: "#6b7280",
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: "4px" }}>参照元:</div>
      {sources.map((s, i) => (
        <div key={i} style={{ marginBottom: "4px" }}>
          📄 {s.source}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: ChatInput コンポーネントを作成**

`apps/front/src/components/ChatInput.tsx`:

```tsx
import { useState, type FormEvent } from "react";

interface Props {
  onSend: (message: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [input, setInput] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", gap: "8px", padding: "16px" }}
    >
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="質問を入力..."
        disabled={disabled}
        style={{
          flex: 1,
          padding: "10px 14px",
          borderRadius: "8px",
          border: "1px solid #d1d5db",
          fontSize: "14px",
          outline: "none",
        }}
      />
      <button
        type="submit"
        disabled={disabled || !input.trim()}
        style={{
          padding: "10px 20px",
          borderRadius: "8px",
          border: "none",
          backgroundColor: disabled ? "#9ca3af" : "#2563eb",
          color: "white",
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: "14px",
        }}
      >
        送信
      </button>
    </form>
  );
}
```

- [ ] **Step 7: App.tsx を作成**

`apps/front/src/App.tsx`:

```tsx
import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "./components/ChatMessage";
import { ChatInput } from "./components/ChatInput";
import { Sources } from "./components/Sources";
import { streamChat, type ChatEvent } from "./lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: { source: string; content: string }[];
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(message: string) {
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setIsLoading(true);

    const assistantIndex =
      messages.length + 1; // index of the new assistant message
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      let sources: { source: string; content: string }[] = [];

      for await (const event of streamChat(message)) {
        if (event.type === "chunk") {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last) {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + event.content,
              };
            }
            return updated;
          });
        } else if (event.type === "sources") {
          sources = event.sources;
        }
      }

      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last) {
          updated[updated.length - 1] = { ...last, sources };
        }
        return updated;
      });
    } catch (error) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last) {
          updated[updated.length - 1] = {
            ...last,
            content: "エラーが発生しました。サーバーが起動しているか確認してください。",
          };
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header
        style={{
          padding: "16px",
          borderBottom: "1px solid #e5e7eb",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "20px", color: "#1f2937" }}>
          TechFlow 社内Q&A
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6b7280" }}>
          社内ドキュメントに基づいて回答します
        </p>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {messages.length === 0 && (
          <p
            style={{
              textAlign: "center",
              color: "#9ca3af",
              marginTop: "40px",
            }}
          >
            質問を入力してください（例: 「有給休暇の申請方法は？」）
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i}>
            <ChatMessage role={msg.role} content={msg.content} />
            {msg.sources && <Sources sources={msg.sources} />}
          </div>
        ))}
        {isLoading && (
          <div style={{ color: "#9ca3af", fontSize: "13px" }}>回答中...</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput onSend={handleSend} disabled={isLoading} />
    </div>
  );
}
```

- [ ] **Step 8: main.tsx を更新**

`apps/front/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

Viteが生成した `src/App.css`, `src/index.css`, `src/assets/` は削除する:

```bash
cd apps/front
rm -f src/App.css src/index.css
rm -rf src/assets
```

- [ ] **Step 9: 動作確認**

```bash
cd apps/front && bun run dev
```

ブラウザで http://localhost:5173 を開く。
apps/ai サーバーが起動した状態で質問を入力して回答が返ることを確認。

- [ ] **Step 10: コミット**

```bash
cd apps/front
git add -A .
git commit -m "feat(front): add React chat UI with SSE streaming"
```

---

## Task 6: Ink CLIクライアント

**Files:**
- Modify: `apps/cli/package.json`
- Modify: `apps/cli/tsconfig.json`
- Create: `apps/cli/src/index.tsx`
- Create: `apps/cli/src/App.tsx`
- Create: `apps/cli/src/components/MessageList.tsx`
- Create: `apps/cli/src/components/Input.tsx`
- Create: `apps/cli/src/lib/api.ts`

- [ ] **Step 1: CLIの依存パッケージをインストール**

```bash
cd apps/cli
bun add ink ink-text-input react hono
bun add -d @types/react
```

- [ ] **Step 2: tsconfig.json を更新**

`apps/cli/tsconfig.json` を以下に置き換え:

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,
    "types": ["bun"],
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noPropertyAccessFromIndexSignature": false
  },
  "include": ["src/**/*.tsx", "src/**/*.ts"]
}
```

- [ ] **Step 3: package.json にscriptsを追加**

`apps/cli/package.json` に以下のscriptsを追加:

```json
{
  "scripts": {
    "start": "bun src/index.tsx"
  }
}
```

- [ ] **Step 4: APIクライアントを作成**

`apps/cli/src/lib/api.ts`:

```typescript
import { hc } from "hono/client";
import type { AppType } from "../../../ai/src/routes.ts";

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
  message: string
): AsyncGenerator<ChatEvent> {
  const res = await fetch("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
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
```

- [ ] **Step 5: MessageList コンポーネントを作成**

`apps/cli/src/components/MessageList.tsx`:

```tsx
import React from "react";
import { Box, Text } from "ink";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: { source: string; content: string }[];
}

interface Props {
  messages: Message[];
}

export function MessageList({ messages }: Props) {
  return (
    <Box flexDirection="column">
      {messages.map((msg, i) => (
        <Box key={i} flexDirection="column" marginBottom={1}>
          <Text bold color={msg.role === "user" ? "blue" : "green"}>
            {msg.role === "user" ? "You" : "AI"}:
          </Text>
          <Box marginLeft={2}>
            <Text wrap="wrap">{msg.content}</Text>
          </Box>
          {msg.sources && msg.sources.length > 0 && (
            <Box marginLeft={2} marginTop={0}>
              <Text dimColor>
                [参照: {msg.sources.map((s) => s.source).join(", ")}]
              </Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 6: Input コンポーネントを作成**

`apps/cli/src/components/Input.tsx`:

```tsx
import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface Props {
  onSubmit: (value: string) => void;
  disabled: boolean;
}

export function Input({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState("");

  function handleSubmit(input: string) {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
  }

  if (disabled) {
    return (
      <Box>
        <Text color="yellow">回答中...</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text bold color="blue">
        You:{" "}
      </Text>
      <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
    </Box>
  );
}
```

- [ ] **Step 7: App.tsx を作成**

`apps/cli/src/App.tsx`:

```tsx
import React, { useState } from "react";
import { Box, Text } from "ink";
import { MessageList } from "./components/MessageList.tsx";
import { Input } from "./components/Input.tsx";
import { streamChat, type ChatEvent } from "./lib/api.ts";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: { source: string; content: string }[];
}

export function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(input: string) {
    setMessages((prev) => [...prev, { role: "user", content: input }]);
    setIsLoading(true);

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      let sources: { source: string; content: string }[] = [];

      for await (const event of streamChat(input)) {
        if (event.type === "chunk") {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last) {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + event.content,
              };
            }
            return updated;
          });
        } else if (event.type === "sources") {
          sources = event.sources;
        }
      }

      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last) {
          updated[updated.length - 1] = { ...last, sources };
        }
        return updated;
      });
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last) {
          updated[updated.length - 1] = {
            ...last,
            content: "エラー: サーバーに接続できません",
          };
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="single" paddingX={1} marginBottom={1}>
        <Text bold>TechFlow 社内Q&A (CLI)</Text>
      </Box>

      <MessageList messages={messages} />
      <Input onSubmit={handleSubmit} disabled={isLoading} />

      <Box marginTop={1}>
        <Text dimColor>Ctrl+C で終了</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 8: エントリーポイントを作成**

`apps/cli/src/index.tsx`:

```tsx
import React from "react";
import { render } from "ink";
import { App } from "./App.tsx";

render(<App />);
```

旧ファイルを削除:

```bash
cd apps/cli && rm -f index.ts
```

- [ ] **Step 9: 動作確認**

apps/ai サーバーが起動した状態で:

```bash
cd apps/cli && bun run start
```

ターミナルにチャットUIが表示され、質問を入力して回答がストリーミング表示されることを確認。

- [ ] **Step 10: コミット**

```bash
cd apps/cli
git add -A .
git commit -m "feat(cli): add Ink terminal chat UI with SSE streaming"
```

---

## Task 7: ワークスペース統合 + README

**Files:**
- Modify: `package.json` (root)
- Modify: `apps/ai/package.json` (ensure workspace name)
- Create: `README.md` (root)

- [ ] **Step 1: ルートpackage.jsonにスクリプトを追加**

ルート `package.json` を以下に更新:

```json
{
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev:ai": "cd apps/ai && bun run dev",
    "dev:front": "cd apps/front && bun run dev",
    "start:cli": "cd apps/cli && bun run start",
    "ingest": "cd apps/ai && bun -e \"import { ingestDocuments } from './src/rag/ingest.ts'; await ingestDocuments()\""
  }
}
```

- [ ] **Step 2: ルートREADME.mdを作成**

`README.md` (プロジェクトルート):

```markdown
# LangChain RAG Demo - TechFlow社内Q&A

LangChain.jsを使ったRAG（Retrieval Augmented Generation）のデモアプリケーション。架空のソフトウェア開発企業「TechFlow株式会社」の社内Q&Aに自然言語で質問応答できます。

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
ollama pull nomic-embed-text

### 2. Qdrantの起動

docker run -d --name qdrant -p 6333:6333 qdrant/qdrant

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
| エンベディング | Ollama (nomic-embed-text) |
| ベクトルストア | Qdrant |
| RAGフレームワーク | LangChain.js |
| フロントエンド | React + Vite |
| CLI | Ink |
```

- [ ] **Step 3: bun install を実行して全ワークスペースの依存を解決**

```bash
cd /Users/harumaxy/ghq/github.com/harumaxy/lang-chain-demo
bun install
```

- [ ] **Step 4: コミット**

```bash
git add package.json README.md
git commit -m "feat: add workspace scripts and project README"
```

---

## Task 8: エンドツーエンド動作確認

- [ ] **Step 1: Qdrantが起動していることを確認**

```bash
docker ps | grep qdrant
```

起動していなければ:
```bash
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant
```

- [ ] **Step 2: Ollamaが起動していることを確認**

```bash
ollama list
```

- [ ] **Step 3: APIサーバーを起動**

```bash
bun run dev:ai
```

Expected: `Ingested XX chunks` → `Server running at http://localhost:3000`

- [ ] **Step 4: ヘルスチェック**

```bash
curl http://localhost:3000/api/health
```

Expected: `{"status":"ok","ollama":true,"qdrant":true}`

- [ ] **Step 5: curlでチャット確認**

```bash
curl -N -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"休暇の申請方法を教えて"}'
```

Expected: SSEストリームで回答 + ソース情報

- [ ] **Step 6: Web UIで確認**

```bash
bun run dev:front
```

ブラウザで http://localhost:5173 を開き、「経費精算の方法を教えて」等を入力。ストリーミングで回答が表示されることを確認。

- [ ] **Step 7: CLIで確認**

```bash
bun run start:cli
```

ターミナルで「GitHubのブランチ命名規則は？」等を入力。回答 + 参照元が表示されることを確認。

- [ ] **Step 8: 最終コミット**

問題があれば修正して:

```bash
git add -A
git commit -m "fix: address issues found during e2e testing"
```
