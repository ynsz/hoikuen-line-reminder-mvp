# 保育園・幼稚園送迎リマインダー LINE Bot MVP

夫婦間の送迎担当の認識ズレを防ぐためのLINE Bot + 簡易管理画面です。

毎日アプリを開く前提ではなく、曜日ごとの固定パターンをもとに、前日夜のLINE通知で「変更がある日だけ直す」体験に絞っています。

## 機能

- LINE Messaging API webhook
- 前日確認通知
- 当日朝通知
- 子どもごとの曜日固定パターン
- 例外日の担当変更
- 子どもごとの休み、送迎なし登録
- 複数回変更フロー
- SQLite保存
- React + Tailwind CSSの簡易管理画面

## セットアップ

```bash
cp .env.example .env
npm install
npm run seed
npm run dev
```

管理画面:

```text
http://127.0.0.1:5173/
```

5173が使用中の場合はViteが別ポートを表示します。

API:

```text
http://127.0.0.1:8787
```

## LINE設定

`.env` にLINE Developersで発行した値を入れます。

```text
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_CHANNEL_SECRET=...
```

Webhook URL:

```text
https://your-domain.example.com/line/webhook
```

ローカル検証ではngrokなどで `http://127.0.0.1:8787` を外部公開してください。

## 通知

SQLiteの `notification_settings` に保存された時刻をもとに、Asia/Tokyoタイムゾーンでcronを起動します。

- 前日確認: デフォルト20:00
- 当日通知: デフォルト06:00

LINE連携値が未設定の場合、送信内容はサーバーログへ出力されます。

## 開発用確認

前日確認メッセージのJSONプレビュー:

```bash
curl -s 'http://127.0.0.1:8787/api/line/preview/previous?date=2026-06-11'
```

当日通知メッセージのJSONプレビュー:

```bash
curl -s 'http://127.0.0.1:8787/api/line/preview/morning?date=2026-06-11'
```

テスト送信:

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"date":"2026-06-11"}' \
  http://127.0.0.1:8787/api/line/test/previous
```

## 固定URLで運用する

ローカルPC + ngrokは開発確認用です。毎日使う場合はRenderなどのWebサービスに置きます。

Renderに置く場合は、このリポジトリをGitHubにpushしてから、RenderでBlueprintとして `render.yaml` を読み込ませます。

Renderの環境変数:

```text
LINE_CHANNEL_ACCESS_TOKEN=LINE DevelopersのChannel access token
LINE_CHANNEL_SECRET=LINE DevelopersのChannel secret
DATABASE_PATH=/var/data/app.db
DEFAULT_FAMILY_ID=fam-demo
```

Renderの公開URLがたとえば以下なら、

```text
https://hoikuen-line-reminder.onrender.com
```

LINE DevelopersのWebhook URLは次にします。

```text
https://hoikuen-line-reminder.onrender.com/line/webhook
```

注意: 無料プランなどでWebサービスがスリープすると、20:00と06:00のアプリ内cronが動かない場合があります。毎日の通知に使う場合は常時起動のプランにするか、外部cronから以下を叩いてください。

```text
POST /api/cron/previous-day
POST /api/cron/morning
```

`CRON_SECRET` を設定した場合は、`x-cron-secret` ヘッダーか `?secret=...` で同じ値を渡します。

## データモデル

主要テーブル:

- `families`
- `members`
- `children`
- `weekly_rules`
- `daily_assignments`
- `notification_settings`
- `line_users`

Supabase移行時に置き換えやすいよう、SQLアクセスは `src/server/repository.ts` に集約しています。
# hoikuen-line-reminder-mvp
