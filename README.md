# coupon-analyzer

独立した「クーポン判定」PWAです。画面とAPIを別リポジトリに分離し、Cloudflare Service Bindingで `coupon-analyzer-api` を利用します。

- 安定解析 / 高速解析
- 最大100URL、重複URL除外、最大3回再解析
- セブン・ファミマの整形済みスクリーンショットとZIP
- 商品名・容量・期限・利用済み・Giftee残高の表示
- 手動修正と解除（このサイトだけで操作）

クーポンキャプチャーのサイトやAPIには依存しません。
