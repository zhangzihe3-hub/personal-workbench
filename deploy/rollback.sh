#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/personal-workbench}"
STATE_FILE="$APP_DIR/.deploy-state/last-release.env"
LOCK_FILE="/run/lock/personal-workbench-update.lock"

cd "$APP_DIR"
if [[ "${DEPLOY_LOCK_HELD:-0}" != "1" ]]; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "已有升级或回滚任务正在运行。" >&2
    exit 1
  fi
fi

if [[ ! -f "$STATE_FILE" ]]; then
  echo "没有找到可回滚版本记录：$STATE_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$STATE_FILE"

docker image inspect "$API_ROLLBACK_TAG" >/dev/null
docker image inspect "$WEB_ROLLBACK_TAG" >/dev/null

echo "恢复 API：$API_ROLLBACK_TAG"
docker image tag "$API_ROLLBACK_TAG" personal-workbench-api:latest
docker compose up -d --no-deps --force-recreate api

echo "恢复 Web：$WEB_ROLLBACK_TAG"
docker image tag "$WEB_ROLLBACK_TAG" personal-workbench-web:latest
docker compose up -d --no-deps --force-recreate web

ready=false
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error "http://127.0.0.1:${WEB_PORT:-8080}/api/health" >/dev/null; then
    ready=true
    break
  fi
  sleep 2
done

if [[ "$ready" != true ]]; then
  echo "回滚容器已启动，但健康检查未通过，请立即查看日志。" >&2
  docker compose logs --tail=100 api web >&2
  exit 1
fi

docker compose ps
echo "已回滚到升级前镜像：$RELEASE_STAMP"
echo "对应数据库备份：$DATABASE_BACKUP"
echo "数据库不会自动恢复，以避免覆盖升级后的业务数据。"
