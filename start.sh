#!/bin/bash
TITLE="ぽん酢鯖bot"
while true; do
  npx tsx src/index.ts
  echo "Botが終了しました。5秒後に再起動します..."
  sleep 5
done