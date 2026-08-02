# RandomCam 運用ステータス

最終確認: 2026-08-02

## 結論

**画面プロトタイプはあるが、ランダム通話サービスとしては未完成です。**

- GitHub リポジトリ: `kazcreativestudio0/randomcam`（`main`）
- ローカル確認済みコミット: `67a13014`（2026-07-30）
- Cloudflare Pages プロジェクト: `randomcam` は存在するが、GitHub 連携は **未接続**（Git Provider: No）。現構成では本番基盤に使わない
- Cloudflare Pages の本番URL: `https://randomcam.pages.dev` は 2026-08-02 時点で **404**。公開中とは扱えない
- 所有者限定の別ホスティングには同コミットのバージョンが存在するが、一般公開ではない

したがって、**GitHub の `main` へ push して Cloudflare Pages へ自動公開される状態ではありません。**

## 現在できること

- 18歳以上の確認後、ブラウザのカメラ・マイク許可を要求する
- 自分のカメラ映像を確認する
- 「Enter the room」後にベータ待機画面を表示する

## まだできないこと

- 相手ユーザーとのマッチング、WebRTC通話、シグナリング
- ルーム管理、切断・次の相手、通報の実機能
- アカウント、年齢確認の実効性、モデレーション、プライバシー/利用規約の実ページ
- 通話サービスに必要な永続データ・監査・運用導線

## ローカル開発と検証

必要環境: Node.js 22.13 以上。

```bash
npm ci
npm run dev
npm run build
npm run lint
npm test
```

2026-08-02 の確認結果:

- `npm run build`: 成功
- `npm run lint`: 成功
- `npm test`: 失敗。実装済みのRandomCam画面を、削除済みのスターター用プレビューとして検証する古いテストが2件残っているため

## 通常の更新フロー（現状）

1. ローカルで変更し、上記の build と lint を通す
2. テストをRandomCamの実装に合わせて修正し、`npm test` を通す
3. GitHub の `main` へ commit / push する
4. Cloudflare Workers Builds のGitHub連携が有効なら、`main` へのpushでCloudflare Workerへ自動反映される
5. 連携が未設定・停止中なら、`npm run deploy` で手動反映する（本番公開を伴う）
6. 公開URLへアクセスし、200応答と主要フローを確認する

## Cloudflare 自動デプロイに進む前の判断

このコードはサーバー側Workerを含むため、Cloudflare Workersを本番基盤にする。`wrangler.json` はWorker名・生成物・静的アセットを固定し、`npm run deploy` はこの構成を本番へ送る。

Cloudflare Workers Builds をGitHub `kazcreativestudio0/randomcam` の `main` に接続し、Build command=`npm run build`、Deploy command=`npx wrangler deploy` とする。これが有効なら、GitHub pushが自動デプロイの起点になる。

## アクセス・オンライン状況

- Cloudflare Worker Observability は有効。CloudflareダッシュボードのWorkerメトリクスで、リクエスト数・エラー率・実行時間を集計で確認する
- Cloudflare Pages の404や所有者限定ホスティングへのアクセスは、実利用の来訪数として数えない
- この時点では実際の通話ルームも在室状態もないため、**同時オンライン人数は測定できない**
- 将来は、通話開始後に匿名の短期heartbeatをDurable Objectへ送ることで、個人を追跡せずに「現在接続中の概数」だけを集計できる。開始・離脱・一定時間無応答で減算し、IPアドレス・アカウント・会話内容は保存しない
