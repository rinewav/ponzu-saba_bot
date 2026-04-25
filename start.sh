#!/bin/bash
# ぽん酢鯖 Bot Dashboard Launcher
set -euo pipefail

if [ ! -t 0 ]; then
  while true; do
    npx tsx src/index.ts
    echo "Botが終了しました。5秒後に再起動します..."
    sleep 5
  done
fi

LOG_FILE=$(mktemp)
trap 'rm -f "$LOG_FILE"; tput cnorm 2>/dev/null; clear;' EXIT

cleanup_bot() { kill "$BOT_PID" 2>/dev/null; wait "$BOT_PID" 2>/dev/null; }
trap cleanup_bot INT TERM

run_bot() {
  while true; do
    npx tsx src/index.ts >> "$LOG_FILE" 2>&1 || true
    echo "$(date '+%Y-%m-%d %H:%M:%S') [SYSTEM] Botが終了しました。5秒後に再起動します..." >> "$LOG_FILE"
    sleep 5
  done
}

run_bot &
BOT_PID=$!

MAX_LOG_LINES=3
LOG_START=0
FOOTER_ROW=0
last_mtime=0

get_cols() { tput cols 2>/dev/null || echo 80; }
get_mtime() { stat -f '%m' "$LOG_FILE" 2>/dev/null || stat -c '%Y' "$LOG_FILE" 2>/dev/null || echo '0'; }

draw_banner() {
  local cols
  cols=$(get_cols)

  tput civis 2>/dev/null
  clear

  local y=1

  printf '\033[%d;0H' "$((y++))"; tput el
  printf '\033[48;5;220m%*s\033[0m\n' "$cols" | tr ' ' '█'

  printf '\033[%d;0H' "$((y++))"; tput el
  printf '\033[48;5;220m\033[38;5;232m ██████╗  ██████╗ ███╗  ██╗███████╗██╗  ██╗      ███████╗ █████╗ ██████╗  █████╗ \033[0m\n'
  printf '\033[%d;0H' "$((y++))"; tput el
  printf '\033[48;5;220m\033[38;5;232m ██╔══██╗██╔═══██╗████╗ ██║╚══███╔╝██║  ██║      ██╔════╝██╔══██╗██╔══██╗██╔══██╗\033[0m\n'
  printf '\033[%d;0H' "$((y++))"; tput el
  printf '\033[48;5;220m\033[38;5;232m ██████╔╝██║   ██║██╔██╗██║  ███╔╝ ██║  ██║█████╗███████╗███████║██████╔╝███████║\033[0m\n'
  printf '\033[%d;0H' "$((y++))"; tput el
  printf '\033[48;5;220m\033[38;5;232m ██╔═══╝ ██║   ██║██║╚████║ ███╔╝  ██║  ██║╚════╝╚════██║██╔══██║██╔══██╗██╔══██║\033[0m\n'
  printf '\033[%d;0H' "$((y++))"; tput el
  printf '\033[48;5;220m\033[38;5;232m ██║     ╚██████╔╝██║ ╚███║███████╗╚██████╔╝     ███████║██║  ██║██████╔╝██║  ██║\033[0m\n'
  printf '\033[%d;0H' "$((y++))"; tput el
  printf '\033[48;5;220m\033[38;5;232m ╚═╝      ╚═════╝ ╚═╝  ╚══╝╚══════╝ ╚═════╝      ╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝\033[0m\n'

  printf '\033[%d;0H' "$((y++))"; tput el
  printf '\033[48;5;220m%*s\033[0m\n' "$cols" | tr ' ' '█'

  printf '\033[%d;0H' "$((y++))"; tput el
  printf '\033[38;5;220m▎\033[0m  \033[1m\033[38;5;220mぽん酢鯖 Official Bot v3.0\033[0m'
  local ts
  ts=$(date '+%Y-%m-%d %H:%M:%S')
  printf '  \033[38;5;245mPID: %s │ %s\033[0m' "$BOT_PID" "$ts"
  printf ' \033[38;5;220m▌\033[0m\n'

  printf '\033[%d;0H' "$((y++))"; tput el
  printf '\033[38;5;220m▎\033[0m'
  printf '%*s' $((cols - 2)) ""
  printf '\033[38;5;220m▌\033[0m\n'

  printf '\033[%d;0H' "$((y++))"; tput el
  printf '\033[38;5;220m▎\033[0m  \033[38;5;250mLOGS\033[0m'
  printf '%*s' $((cols - 8)) ""
  printf '\033[38;5;220m▌\033[0m\n'

  LOG_START=$y
  y=$((y + MAX_LOG_LINES))

  printf '\033[%d;0H' "$((y++))"; tput el
  printf '\033[38;5;220m▎\033[0m'
  printf '%*s' $((cols - 2)) ""
  printf '\033[38;5;220m▌\033[0m\n'

  printf '\033[%d;0H' "$((y++))"; tput el
  printf '\033[38;5;220m▀%s\033[0m\n' "$(printf '%0.s▀' $(seq 1 $((cols - 1))))"

  FOOTER_ROW=$y
}

draw_logs() {
  local cols
  cols=$(get_cols)
  local inner=$((cols - 4))

  local i
  for i in $(seq 0 $((MAX_LOG_LINES - 1))); do
    printf '\033[%d;0H' "$((LOG_START + i))"
    tput el
    printf '\033[38;5;220m▎\033[0m '
  done

  local log_lines
  log_lines=$(tail -n "$MAX_LOG_LINES" "$LOG_FILE" 2>/dev/null || true)
  if [ -n "$log_lines" ]; then
    local i=0
    while IFS= read -r line; do
      local display="${line:0:$inner}"
      display="${display//[^[:print:]]/}"
      printf '\033[%d;0H' "$((LOG_START + i))"
      tput el
      printf '\033[38;5;220m▎\033[0m \033[38;5;252m%s\033[0m' "$display"
      i=$((i + 1))
    done <<< "$log_lines"
  fi
}

draw_footer() {
  local ts
  ts=$(date '+%H:%M:%S')
  printf '\033[%d;0H' "$FOOTER_ROW"
  tput el
  printf '\033[48;5;237m  \033[38;5;70m● RUNNING\033[0m\033[48;5;237m  │  %s  │  Ctrl+C to stop \033[0m' "$ts"
}

draw_banner

while kill -0 "$BOT_PID" 2>/dev/null; do
  local_mtime=$(get_mtime)
  if [ "$local_mtime" != "$last_mtime" ]; then
    last_mtime="$local_mtime"
    draw_logs
  fi
  draw_footer
  sleep 0.5
done

printf '\033[%d;0H' "$FOOTER_ROW"
tput el
printf '\033[48;5;52m  \033[38;5;196m● STOPPED\033[0m\033[48;5;52m  │  Bot process exited. Restarting...\033[0m'
tput cnorm 2>/dev/null
sleep 3
exec "$0"
