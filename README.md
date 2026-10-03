# coupon-analyzer

独立した「クーポン判定」PWAです。画面とAPIを別リポジトリに分離し、Cloudflare Service Bindingで `coupon-analyzer-api` を利用します。

- 安定解析 / 高速解析
- 最大500URL、重複URL除外、100件ずつ分割解析、最大3回再解析
- セブン・ファミマの整形済みスクリーンショットとZIP
- 商品名・容量・期限・利用済み・Giftee残高の表示
- SBギフト・スターバックスを含む解析API対応URLを画面から判定
- 手動修正と解除（このサイトだけで操作）

クーポンキャプチャーのサイトやAPIには依存しません。
