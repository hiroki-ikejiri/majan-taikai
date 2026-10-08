# セットアップ手順

本番で使えるようにするまでの手順です。Firebase（データの保存とログイン）と Cloudflare Pages（画面の公開）の 2 つを準備します。

## 1. Firebase プロジェクトを作る

1. [Firebase コンソール](https://console.firebase.google.com/) を開き、個人の Google アカウントでログインする
2. 「プロジェクトを追加」から `majan-taikai` などの名前で作る（Google アナリティクスは不要）
3. 料金プランは無料の Spark プランのままでよい

## 2. ログイン方法を有効にする

Firebase コンソールの「Authentication」→「Sign-in method」で、次の 2 つを有効にします。

| ログイン方法 | 使う人 |
|---|---|
| Google | 主催者 |
| 匿名 | 参加者（画面上はログイン操作なし） |

続けて「Authentication」→「設定」→「承認済みドメイン」に、公開先のドメインを追加します。

```
majan-taikai.pages.dev
```

## 3. Firestore（データベース）を作る

1. 「Firestore Database」→「データベースを作成」
2. ロケーションは `asia-northeast1`（東京）
3. 「本番環境モード」で作成する
4. 「ルール」タブを開き、このリポジトリの [`firestore.rules`](../firestore.rules) の中身を貼り付けて「公開」する

`firestore.rules` を変えたときは、同じ手順でもう一度貼り付けて公開してください。

## 4. アプリに Firebase の設定を入れる

1. Firebase コンソールの「プロジェクトの設定」→「マイアプリ」で、ウェブアプリ（`</>`）を追加する
2. 表示される `firebaseConfig` の値を [`public/js/config.js`](../public/js/config.js) に貼り付ける

```js
export const firebaseConfig = {
  apiKey: '...',
  authDomain: 'xxxx.firebaseapp.com',
  projectId: 'xxxx',
  storageBucket: 'xxxx.firebasestorage.app',
  messagingSenderId: '...',
  appId: '...',
};
```

この値は画面から誰でも見える前提の値なので、公開リポジトリに入れて問題ありません。データは `firestore.rules` の権限ルールで守ります。

## 5. 自動デプロイ（Cloudflare Pages）

`main` ブランチに push すると、GitHub Actions がテストを実行し、通ったら Cloudflare Pages に公開します。`mahjong-tracker` や `tracker` と同じ仕組みです。

最初に一度だけ、GitHub リポジトリに次の 2 つのシークレットを登録します。値は `mahjong-tracker` に登録したものと同じでかまいません。

| シークレット名 | 中身 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare の API トークン（Pages の編集権限つき） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウント ID |

```bash
gh secret set CLOUDFLARE_API_TOKEN -R hiroki-ikejiri/majan-taikai
```

```bash
gh secret set CLOUDFLARE_ACCOUNT_ID -R hiroki-ikejiri/majan-taikai
```

Cloudflare Pages のプロジェクト（`majan-taikai`）は、初回のデプロイで自動的に作られます。公開 URL は `https://majan-taikai.pages.dev/` です。

初回デプロイのあと、実際の公開 URL を GitHub Actions のログか Cloudflare のダッシュボードで確認してください。名前が他の人と重なると `majan-taikai-xxx.pages.dev` のように文字が足されることがあります。その場合は、手順 2 の「承認済みドメイン」に実際のドメインを追加してください。

## 6. 本番での動作確認

Firebase の権限ルールは自動テストでは確かめていないので、最初の大会の前に実機で次を確認してください。

1. iPhone の Safari で、主催者として Google ログインし、大会を作れる
2. 別の端末で共有 URL を開くだけで参加でき、結果を保存できる
3. 同じ卓の結果を 2 台でほぼ同時に保存すると、片方に「すでに入力済み」と出る
4. 参加者の端末から主催者メニュー（`#/t/<大会ID>/admin`）を開いても操作できない
