#!/bin/bash
# 自己署名証明書の生成スクリプト
# 実行: ./generate-cert.sh

CERT_DIR="$(dirname "$0")/certs"
mkdir -p "$CERT_DIR"

if [ -f "$CERT_DIR/key.pem" ] && [ -f "$CERT_DIR/cert.pem" ]; then
  echo "証明書はすでに存在します。再生成する場合は certs/ を削除してください。"
  exit 0
fi

openssl req -x509 -newkey rsa:2048 -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" \
  -days 3650 -nodes \
  -subj "/C=JP/ST=Tokyo/L=Tokyo/O=ponzu-saba/CN=ponzu-saba.com"

echo "✅ 証明書を生成しました: $CERT_DIR/cert.pem, $CERT_DIR/key.pem"
