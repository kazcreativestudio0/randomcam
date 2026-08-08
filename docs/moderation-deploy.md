# モデレーション Worker の公開手順

この実装は公開用 Worker とは分離した `randomcam-moderation` Worker です。証拠画像は R2 を使わず、D1 の BLOB として非公開保存し、管理 API 経由でだけ返します。画像は WebP のみ・1枚 750 KB 以下で、通報とともに30日後に完全削除されます。

## 一度だけ行う設定

1. D1 データベース `randomcam-moderation` を作成する。
2. `moderation/wrangler.jsonc` の `database_id` を作成結果で置き換える。
3. D1 スキーマを適用する。R2 の有効化、バケット作成、カード登録は不要。
4. 次の Worker secret を設定する。値をリポジトリやブラウザに保存しない。

```bash
npx wrangler secret put SESSION_HMAC_SECRET --config moderation/wrangler.jsonc
npx wrangler secret put ADMIN_PASSWORD --config moderation/wrangler.jsonc
npx wrangler secret put ADMIN_SESSION_SECRET --config moderation/wrangler.jsonc
npx wrangler secret put MATCHER_INTERNAL_SECRET --config moderation/wrangler.jsonc
npx wrangler secret put MATCHER_INTERNAL_SECRET --config matcher/wrangler.jsonc
```

`MATCHER_INTERNAL_SECRET` は moderation Worker と matcher Worker で同じランダム値にする。公開 API からこの値へアクセスできないよう、matcher は `/internal/match` をこの共有 secret がある呼び出しだけに制限する。

## 公開

```bash
npx wrangler d1 execute randomcam-moderation --remote --file=moderation/schema.sql
npx wrangler deploy --config moderation/wrangler.jsonc
npx wrangler deploy --config matcher/wrangler.jsonc
npm run build
npx wrangler deploy --config dist/server/wrangler.json --name randomcam
```

公開後、`app/page.tsx` の `MODERATION_ORIGIN` が moderation Worker の URL と一致することを確認する。Worker の cookie は HTTPS、HttpOnly、SameSite で送る。ローカル HTTP では cookie が設定されないため、通報テストは公開 Preview または本番 Worker 上で行う。

### 既存の空の D1 に旧スキーマを適用済みの場合

旧R2版の `schema.sql` をすでに実行しているが、通報データがまだない場合は、先に移行SQLを1回だけ実行してから Worker を公開する。

```bash
npx wrangler d1 execute randomcam-moderation --remote --file=moderation/migrations/0002_d1_evidence.sql
```

新規のD1には移行SQLを実行せず、`schema.sql` だけを実行する。`schema.sql` と移行SQLを同じ空DBへ両方実行すると、追加列の重複で失敗する。

## テスト項目

- 同じ match からの通報連打が1件だけになること。
- 2つの異なる match からの通報で30日停止になること。
- 停止中の同じ短期 install cookie が `/api/session` で拒否されること。
- `/admin` は未ログインでログイン画面だけが返ること。
- 証拠 URL を直接開いても、管理 cookie がなければ返らないこと。
- 期限切れ後、管理 API が画像を返さず、Cron がD1内の画像BLOBと関連レコードを削除すること。
