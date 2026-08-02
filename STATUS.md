# RandomCam 運用ステータス

最終確認: 2026-08-02

## 結論

**Cloudflare Workerで一般公開中。GitHub mainを正本として更新する。**

- GitHub リポジトリ: `kazcreativestudio0/randomcam`（`main`）
- 公開基盤: Cloudflare Worker randomcam（PagesのURLではなく下記URLを共有する）
- 公開URL: `https://randomcam.kaz-creative-studio0.workers.dev`（200応答を確認済み）
- Cloudflare Pages プロジェクト: `randomcam` は存在するが、GitHub 連携は **未接続**（Git Provider: No）。現構成では本番基盤に使わない
- Cloudflare Pages の本番URL: `https://randomcam.pages.dev` は 2026-08-02 時点で **404**。公開中とは扱えない
- 所有者限定の別ホスティングには同コミットのバージョンが存在するが、一般公開ではない

**GitHub main → Cloudflare Workers Builds の接続は完了。** 対象は kazcreativestudio0/randomcam の main、Build command は npm run build、Deploy command は npx wrangler deploy。Pagesは本番基盤に使いません。

## 現在できること

- 18歳以上の確認後、ブラウザのカメラ・マイク許可を要求する
- 自分のカメラ映像を確認する
- 世界共通の待機室へ入り、2人が同時に待機していれば1対1マッチを開始する
- WebRTCシグナリング、通話の終了・次の相手、通報のUIを備える
- 英語・日本語の案内ページ（/en、/ja）と検索向けメタデータを備える

## 公開前／運用上の重大な制約

- 年齢確認は自己申告のみ。利用規約・プライバシー方針・問い合わせ先の実ページも未整備
- WebRTCはSTUNのみでTURN中継がない。ネットワークの組み合わせによって通話接続できない
- 直接のP2P通話では相手にネットワーク情報が伝わる可能性がある。TURN導入と明示的なプライバシー説明が必要
- 待機キューの異常終了時の自動失効・レート制限・本格的な不正対策が未整備
- 通報用WorkerとD1は動作構成を持つが、実運用の監視・管理者手順・証跡保護を確認してから本格運用する

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
- npm run lint: エラーなし（補助Worker 3件の既存warningのみ）
- npm test: 成功（2件）
- 補助Worker（randomcam-matcher、randomcam-moderation）の wrangler deploy --dry-run: 成功

## 通常の更新フロー（現状）

1. ローカルで変更し、上記の build と lint を通す
2. npm test を通す
3. GitHub の `main` へ commit / push する
4. Cloudflare Workers Builds のGitHub連携が有効なら、`main` へのpushでCloudflare Workerへ自動反映される
5. Cloudflare Workers Builds の履歴で、そのpushのビルド成功と randomcam へのデプロイを確認する。失敗時は直前の公開版が維持される
6. 公開URLへアクセスし、200応答と主要フローを確認する

## Cloudflare 自動デプロイに進む前の判断

このコードはサーバー側Workerを含むため、Cloudflare Workersを本番基盤にする。`wrangler.json` はWorker名・生成物・静的アセットを固定し、`npm run deploy` はこの構成を本番へ送る。

Cloudflare Workers Builds をGitHub `kazcreativestudio0/randomcam` の `main` に接続し、Build command=`npm run build`、Deploy command=`npx wrangler deploy` とする。これが有効なら、GitHub pushが自動デプロイの起点になる。

Cloudflareダッシュボードの **Workers & Pages → randomcam → Settings → Builds** で、対象リポジトリ・ブランチ・Build/Deploy commandを確認できる。通常更新時は、main push後に同画面の最新Buildが成功していることを確認する。

## アクセス・オンライン状況

- Cloudflare Worker Observability は有効。公開後は Cloudflare ダッシュボードの **Workers & Pages → randomcam → Metrics / Observability** で、リクエスト数・エラー率・実行時間を集計で確認する
- Cloudflare Pages の404や所有者限定ホスティングへのアクセスは、実利用の来訪数として数えない
- 現状のマッチングWorkerは同時オンライン数の集計を公開していないため、**同時オンライン人数はまだ測定できない**
- 将来は、通話開始後に匿名の短期heartbeatをDurable Objectへ送ることで、個人を追跡せずに「現在接続中の概数」だけを集計できる。開始・離脱・一定時間無応答で減算し、IPアドレス・アカウント・会話内容は保存しない

### 過去データの確認結果（2026-08-02）

- GitHub Pages は未設定。そこから取得できるサイト利用データはない
- GitHub リポジトリの直近14日間の閲覧数は 0、clone は8回・ユニーク7件。これは**ソースコードの取得**であり、RandomCamの利用人数ではない
- 所有者限定の旧ホスティングには、トップページへの200応答と多数の静的アセット要求のログが残る。ただし、認証済みのプレビュー利用を含み、同一閲覧で複数要求が発生するため、来訪者数や利用者数には換算できない
- Cloudflare Web Analytics のサイト計測は未設定で、過去分を遡って補完することはできない。今後ユニーク来訪の推定が必要なら、公開URLが確定してからCloudflare Web Analyticsを追加する（Cookieを使わない集計方式）
