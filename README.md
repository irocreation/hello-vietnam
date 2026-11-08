# HELLO VIETNAM

Our Little Vietnam Trip。夫婦2人だけの旅行管理PWAです。React / TypeScript / Vite / SCSS、Supabase Auth・Database・Realtime、IndexedDB（Dexie）を使用します。

## 起動・検証

Node.js 22以上を使用します。

```sh
npm ci
cp .env.example .env
# .env を編集
npm run dev
npm test
npm run build
npm run preview
```

`.env` と `.env.*` はGit対象外です（`.env.example`のみ対象）。`VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY` を設定します。公開用Publishable key（`sb_publishable_...`）、または従来のanonキーだけを使用してください。secret key / service_role キーは使用できません。アプリにも管理用キーを入れないでください。

`VITE_BASE_PATH` はローカルで `/`、GitHub Pagesのプロジェクトサイトで `/hello-vietnam/`、独自ドメインで `/` にします。末尾の `/` が必要です。アプリはURLルーティングを使わないため、GitHub Pagesでも404リダイレクトは不要です。

設定が未完了の場合は設定案内画面、設定済みで未認証の場合はログイン画面が表示されます。未認証の利用者に旅行情報は表示・取得しません。

## Supabaseの初期設定

1. Supabaseでプロジェクトを用意し、Project Settings → API KeysからProject URLと公開用キーを確認して `.env` に設定します。
2. **SQL Editor → New query**を開き、[`supabase/migrations/001_private_trip.sql`](supabase/migrations/001_private_trip.sql) の**内容全文**を貼り付けてRunを押します。ファイルのパスを入力するのではありません。マイグレーションは新規プロジェクトで一度だけ実行します。途中でエラーになるとトランザクション全体がロールバックします。既存テーブルへ無理に再実行したり、テーブルを削除してやり直したりしないでください。
3. Authenticationの設定で **Allow new users to sign up**（新規登録許可）をOFFにします。Emailログインを有効にし、Anonymous sign-ins（匿名ログイン）もOFFにします。画面の項目名はDashboardのバージョンにより異なる場合があります。
4. **Authentication → Users → Add user → Create new user**から、あなた用・配偶者用のメールアドレスとパスワードをそれぞれ登録します。これは旅行アプリ用の利用者であり、Supabaseの契約・管理用アカウントを追加する操作ではありません。作成時にAuto Confirm Userがあれば有効にするか、メール確認を完了してください。パスワードはチャット・SQL・Gitへ記載しません。
5. 各ユーザーのUser UIDをコピーします。以下の管理用SQLの2つのUUIDだけを置き換え、SQL Editorで実行します。夫婦以外を追加しないでください。管理者・閲覧者はそれぞれ1人まで、1ユーザーは1グループだけに所属できます。

```sql
begin;
do $$
declare
  admin_user uuid := 'ADMIN_AUTH_USER_UUID';
  viewer_user uuid := 'VIEWER_AUTH_USER_UUID';
  trip uuid;
begin
  insert into public.travel_groups(name,start_date,end_date)
  values('Our Little Trip','2030-01-01','2030-01-05') returning id into trip;
  insert into public.group_members(trip_id,user_id,role)
  values(trip,admin_user,'admin'),(trip,viewer_user,'viewer');
end $$;
commit;
```

上記は空の旅行を作る**汎用例**です。実際の旅行名・日付へ変更してください。今回の初期フライト・持ち物・仮プランを取り込む場合は、この汎用例の代わりに、リポジトリとは別に渡した **private-setup/setup-trip.sql** を使用してください。初期旅程は公開リポジトリに含めません。そのファイルの2つのUUIDを置換し、内容全文をSQL Editorで実行します。既存の所属があると上書きせず停止します。

6. Authentication → URL ConfigurationのSite URLを、公開するGitHub PagesのURLへ設定します。このアプリはEmail＋Passwordログインを使い、一般向けのサインアップ、メール招待の受領画面、パスワード再設定画面は設けていません。パスワード変更・再設定は安全な管理手順で行ってください。
7. Database → Replication / Realtimeで `travel_documents`、`packing_checks`、`group_members` が `supabase_realtime` publicationに含まれることを確認します。マイグレーションでも既存publicationへ追加します。publicationがない環境ではSQL側では作成しないため、DashboardでRealtimeを有効化してください。
8. 管理者と閲覧者でログインし、実接続の確認リストを実行してください。

権限の付与・変更はSQL Editor等の信頼できる管理画面からのみ行います。`group_members` と `travel_groups` はフロントエンドから変更できません。`user_metadata` やクライアントが申告するroleは権限判定に使用しません。

公式資料：[Supabase Auth Users](https://supabase.com/docs/guides/auth/users)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)。

## GitHub Pagesへの配置

`.github/workflows/deploy.yml` を同梱しています。

1. アプリのコード・公開素材だけをリポジトリへpushします。`.env`、`work/`、`.openai/`、個人の初期旅程SQL、実データのJSONは配置しません。
2. Repository Settings → Secrets and variables → Actions → **Variables**で設定します。
   - `VITE_SUPABASE_URL`: Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: 公開用Publishable/anon key
   - `VITE_BASE_PATH`: `/hello-vietnam/`（リポジトリ名に合わせる）
3. Repository Settings → Pages → Build and deployment → Sourceを **GitHub Actions** にします。
4. mainへpush、またはActionsからワークフローを実行します。依存取得 → テスト → 設定検査 → ビルド → Pages公開の順に実行します。設定不足時は公開を停止します。

公開用キーは配信JavaScriptから読めます。個人データを守るのはRLSであり、キーの秘匿やURLの非公開化ではありません。GitHub Pagesは一般公開のアプリシェルを配信しますが、旅行データは認証・グループ所属がなければ読めません。

公式資料：[GitHub Pagesのカスタムワークフロー](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## データと権限

- `travel_groups`: 旅行名と日付。所属者のみSELECT。
- `group_members`: Auth UIDとグループ、admin/viewer。自分の所属のみSELECT。クライアントからの書き込み不可。
- `travel_documents`: 日程・フライト・ホテル・場所・持ち物の定義・メモを、旅行単位の型付きJSONとして保存。所属者がSELECT、管理者だけINSERT / UPDATE / DELETE。
- `packing_checks`: `(trip_id, user_id, item_id)` が主キー。本人だけSELECT / INSERT / UPDATE / DELETE。他の人のチェックは管理者も閲覧・変更できません。

すべてのテーブルでRLSを有効化しています。APIのRPCもSECURITY INVOKERとして実行し、RLSを通します。privateスキーマの限定的な所属判定関数で再帰的なRLSを避けています。フライト由来のタイムライン項目は表示時に生成し、重複保存しません。

## 自動同期・オフライン

オンライン時も編集は先にIndexedDBへ書き込み、未送信キューを作成します。サーバーから成功応答を受けるまでキューは削除しません。送信の前にSupabase Authでユーザーを検証し、DBから所属・roleを再取得します。管理者権限が取り消されている場合、共有変更を送らず端末に保持します。

共有データは旅行単位で1件にまとめて送信します。変更のたびにversionとmutation IDを使用し、同じ要求の再送は重複反映しません。別端末の更新でversionが変わっていた場合は競合画面を表示します。サーバーとローカル双方の項目・内容を展開して確認できます。利用者が選ぶまで自動上書きしません。同じアカウントの別端末による持ち物チェックの競合も検出します。自動の項目別マージは行いません。リストから削除済みの持ち物への未送信チェックは確認して破棄します。

Realtime通知、アプリ再表示、再接続時に最新データを取得します。30秒ごとの再取得も補助的に行います。UIは「同期済み / 同期中 / オフライン / 同期エラー」、未送信件数、最終同期日時を表示し、設定画面から再試行できます。

一度認証して取得済みなら、オフライン再起動時もIndexedDBの本人用キャッシュを使い、毎回ログイン通信を要求しません。管理者は共有情報をオフライン編集可能で、閲覧者は自分の持ち物チェックだけを変更できます。初回のログイン・データ取得には接続が必要です。

Service WorkerはHTML・JS・CSS・SVG・同梱フォント・PWAアイコンだけをキャッシュします。Supabase API、航空会社・予約ページ、Googleマップのタイル・画像はキャッシュしません。航空券はHTTPSリンク管理です。PDF・画像の添付、平文JSONのバックアップ・手動共有は設けていません。Supabaseの管理画面でのバックアップを使用してください。外部ページには接続が必要で、URL・住所・予約番号・メモ自体は端末に保存します。

新バージョンは更新案内を表示します。編集を保存してから「更新する」を押してください。未送信データはアプリシェルの更新後もIndexedDBに保持されます。

### ログアウトとプライバシー

ログアウトはこの端末・ブラウザの全アカウントの旅行キャッシュ、同期キュー、旧版のローカル保存データを削除します。未送信データがある場合は事前に確認します。再ログインには接続が必要です。ストレージは暗号化された安全な保管庫ではないため、パスポート番号・決済情報は保存しないでください。データやURLを分析サービスに送信せず、HTTP以外のURLスキームとHTTP URLを拒否します。外部リンクはnoopener・noreferrerで開きます。

オフライン利用を可能にするため、サーバー上での権限失効を未接続端末へ即時反映することはできません。端末自体をロックし、共有端末ではログアウトしてください。Safari等によるデータ消去、プライベートブラウズ、容量不足でキャッシュ・未送信変更が消えることがあります。旅行前にオフライン起動と同期済み表示を確認してください。

## iPhoneへのインストール

Safariで公開URLを開く → ログインして同期済みを確認 → 共有ボタン → **ホーム画面に追加**。追加後のアプリでもログイン・同期を確認してから、機内モードで起動を確認してください。iOSの通常タブとホーム画面アプリで保存領域の扱いが異なる場合があります。

Googleマップのオフライン地図はGoogleマップアプリ内で事前ダウンロードしてください。

## 実接続の受け入れ確認

自動テストの代わりに実環境確認が完了したことにはしません。下記をSupabaseと2アカウントの準備後に確認してください。

- 管理者で予定・フライトURL・ホテル・場所・メモ・持ち物を追加・編集・削除できる。
- 別ブラウザまたは別端末で閲覧者ログインし、自動反映を確認。共有編集ボタンは出ず、自分の持ち物チェックだけ操作できる。
- 夫婦のチェックが独立し、各自の再ログインでも復元される。
- 未認証ではログイン画面のみ表示。直接APIも拒否される。
- 別グループのユーザーはデータを取得できない。閲覧者の共有書き込み・権限昇格はRLSで拒否される。
- DevToolsでNetworkをOfflineにし、再読み込み・アプリ終了再起動・住所と情報閲覧・管理者編集・チェック変更を試す。Onlineへ戻し未送信件数が0になることを確認。
- 同じ管理者を別ブラウザで開き、片方をオフライン編集、もう片方も更新。再接続時に競合画面が出て、確認なしに上書きされないことを確認。
- URL未登録のボタンは利用不可。外部航空券・予約・Googleマップの閲覧はオンライン時のみ。オフラインでも保存URLと住所が読める。
- ログアウト後はキャッシュが消え、オフラインで情報が再表示されない。
- iPhone実機でセーフエリア・画面下ナビ・フォーム入力・ホーム画面追加を確認。

`npm test` はPGlite（実際のPostgreSQLエンジン）でマイグレーション・RLS・RPC・version競合・個別チェックを検証し、fake-indexeddbでオフラインキュー保持・再起動・再接続・権限失効・競合解消を検証します。クラウドのRealtime配信・Authの2アカウントログイン・iOS実機はこれとは別に確認が必要です。

## 構成

- `src/App.tsx`: 既存5画面・編集フォーム・ホテルカード・同期設定
- `src/TripProvider.tsx`: ログイン・本人キャッシュ復元・Realtime購読・ログアウト
- `src/supabase.ts`: 公開用クライアントと権限確認・RPCアダプター
- `src/sync.ts`: 永続キュー・送信・競合・再試行
- `src/data.ts`: 型・IndexedDB・共有データと本人チェックの合成
- `src/Art.tsx`: オリジナルSVGイラスト
- `src/style.scss`: 既存デザインと追加画面
- `supabase/migrations/001_private_trip.sql`: スキーマ・RLS・RPC・Realtime設定
- `tests/`: DB権限と同期の検証

英字フォントはOutfitとDM Sansを同梱しています（SIL Open Font License、`src/assets/fonts/OFL-*.txt`）。日本語は端末のゴシック体へフォールバックし、フォントの外部通信は行いません。

## 場所の写真と宿泊予定の連動

管理者はPlacesカード上部をタップして写真を選択・変更できます。写真は端末内で最大1400pxのJPEGへ変換し、EXIF等の元ファイルのメタデータを含めず、非公開のSupabase Storageへアップロードします（元画像20MBまで、保存画像1MBまで）。一般公開URLは使わず、所属者が認証付きでダウンロードします。取得済みの写真は本人用のIndexedDBキャッシュでオフライン表示し、ログアウト時に消去します。写真の新規登録には接続が必要です。「写真を外す」は表示への関連付けを外し、古いファイル自体は保持します。不要な古いファイルの整理は管理者がStorage画面から行ってください。

追加セットアップは、Storageで **place-photos** というPrivateバケットを作成（1MB・image/jpeg）し、`supabase/migrations/002_place_photos.sql` をSQL Editorで実行します。このSQLはStorageのSELECTを所属者だけ、INSERT・DELETEを管理者だけに制限します。写真そのものをGitHubへ配置しません。

宿泊先に登録したチェックイン・チェックアウト日時は、スケジュールへ自動表示します。チェックアウトは期限として表示します。住所・GoogleマップURL・メモ・予約リンクを連動し、日程表の編集ボタンは元の宿泊情報を開きます。日時未登録の場合は予定を生成しません。初期データの未編集の仮チェックイン予定は、該当都市・日付の宿泊情報が登録されたら置き換えて表示します。

共有プレビューには高解像度OG画像 `share-v2.png` を指定しています。旧プレビューは共有先のキャッシュによりしばらく残ることがあります。アイコンの再生成は `python3 scripts/render-icons.py` で行えます。
