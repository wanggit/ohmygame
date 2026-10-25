#!/usr/bin/env bash
# OhMyGame 开发控制脚本:启动 / 停止 / 重启 / 构建当前项目
#
# 用法:
#   ./dev.sh start [web|desktop]   启动(默认 web:daemon 43110 + 渲染器 43120)
#   ./dev.sh stop                  停止(杀进程树并清理 43110/43120 端口残留)
#   ./dev.sh restart [web|desktop] 重启
#   ./dev.sh build                 构建(host + renderer + player)
#   ./dev.sh status                查看运行状态与端口占用
#   ./dev.sh logs [行数]           查看启动日志(默认 50 行)
#
# 日志:.data/dev.log    PID:.data/dev.pid(.data/ 已被 gitignore)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# 非交互 shell 通常没有 ~/.bun/bin,先兜底再检查
export PATH="$HOME/.bun/bin:$PATH"
DATA_DIR="$ROOT/.data"
LOG_FILE="$DATA_DIR/dev.log"
PID_FILE="$DATA_DIR/dev.pid"
WEB_PORTS="43110 43120"   # daemon + 渲染器固定端口(desktop 的 daemon 为随机端口)

die() { echo "错误: $*" >&2; exit 1; }

need_bun() {
  command -v bun >/dev/null 2>&1 || die "未找到 bun。安装: curl -fsSL https://bun.sh/install | bash"
}

is_running() {
  [ -f "$PID_FILE" ] || return 1
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# 递归杀掉进程树(concurrently 会派生 daemon/renderer/electron 子进程)
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

port_pids() {
  lsof -nP -ti tcp:"$1" 2>/dev/null || true
}

clear_web_ports() {
  local port pids
  for port in $WEB_PORTS; do
    pids="$(port_pids "$port")"
    if [ -n "$pids" ]; then
      echo "清理端口 $port 残留进程: $(echo $pids | tr '\n' ' ')"
      echo "$pids" | xargs kill 2>/dev/null || true
    fi
  done
}

wait_for_exit() {
  local pid="$1" i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 1
  done
  return 0
}

wait_for_ports() {
  # dev 冷启动要先跑 build:player,给足等待时间
  local i port pending
  for i in $(seq 1 90); do
    pending=""
    for port in $WEB_PORTS; do
      [ -n "$(port_pids "$port")" ] || pending="$pending $port"
    done
    if [ -z "$pending" ]; then
      echo "端口就绪: $(echo $WEB_PORTS | tr ' ' ',')"
      return 0
    fi
    sleep 1
  done
  echo "警告: 等待超时,端口仍未就绪:$pending(可 ./dev.sh logs 查看原因)" >&2
  return 1
}

start() {
  local mode="${1:-web}" script
  need_bun
  if is_running; then
    die "已在运行 (PID $(cat "$PID_FILE"))。先 ./dev.sh stop 或用 ./dev.sh restart"
  fi
  case "$mode" in
    web) script="dev" ;;
    desktop) script="dev:desktop" ;;
    *) die "未知模式 \"$mode\",可选 web | desktop" ;;
  esac
  local port pids
  for port in $WEB_PORTS; do
    pids="$(port_pids "$port")"
    [ -z "$pids" ] || die "端口 $port 已被占用 (PID: $(echo $pids | tr '\n' ' ')),先 ./dev.sh stop"
  done
  mkdir -p "$DATA_DIR"
  echo "启动 $mode 模式(bun run $script)..."
  # 用 exec 让 PID 文件指向真正的 dev 主进程,stop 时才能杀掉整个进程树
  nohup bash -c 'echo $$ > "$1"; exec bun run "$2"' _ "$PID_FILE" "$script" >"$LOG_FILE" 2>&1 &
  # PID 文件由后台 bash 写入,轮询等它出现再读,避免竞态
  local waited=0
  while [ ! -f "$PID_FILE" ] && [ "$waited" -lt 30 ]; do sleep 0.1; waited=$((waited + 1)); done
  echo "已后台启动 (PID $(cat "$PID_FILE" 2>/dev/null || echo 未知)),日志: $LOG_FILE"
  wait_for_ports || true
  "$0" status
}

stop() {
  if is_running; then
    local pid
    pid="$(cat "$PID_FILE")"
    echo "停止进程树 (PID $pid)..."
    kill_tree "$pid"
    wait_for_exit "$pid"
    kill -9 "$pid" 2>/dev/null || true
  else
    echo "没有正在运行的启动记录"
  fi
  clear_web_ports
  rm -f "$PID_FILE"
  echo "已停止"
}

restart() {
  stop
  start "${1:-web}"
}

build() {
  need_bun
  echo "构建 host + renderer + player(bun run build)..."
  bun run build
  echo "构建完成"
}

status() {
  if is_running; then
    echo "运行中 (PID $(cat "$PID_FILE")),日志: $LOG_FILE"
  else
    echo "未运行(./dev.sh start 可启动)"
  fi
  local port pids
  for port in $WEB_PORTS; do
    pids="$(port_pids "$port")"
    if [ -n "$pids" ]; then
      echo "端口 $port: 占用 ($(echo $pids | tr '\n' ' '))"
    else
      echo "端口 $port: 空闲"
    fi
  done
}

logs() {
  [ -f "$LOG_FILE" ] || die "还没有日志文件($LOG_FILE)"
  tail -n "${1:-50}" "$LOG_FILE"
}

case "${1:-}" in
  start) shift; start "${1:-web}" ;;
  stop) stop ;;
  restart) shift; restart "${1:-web}" ;;
  build) build ;;
  status) status ;;
  logs) shift; logs "${1:-50}" ;;
  *) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
