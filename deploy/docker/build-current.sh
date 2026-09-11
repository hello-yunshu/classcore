#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:-classroom-runtime:local}"
NODE_VERSION="$(node -e 'process.stdout.write(require("./config/toolchain.json").runtime.node)')"

if [[ -n "${TARGET_PLATFORM:-}" ]]; then
  PLATFORM="$TARGET_PLATFORM"
else
  case "$(uname -m)" in
    arm64|aarch64) PLATFORM="linux/arm64" ;;
    x86_64|amd64) PLATFORM="linux/amd64" ;;
    *) echo "无法自动映射当前 CPU，请设置 TARGET_PLATFORM=linux/arm64 或 linux/amd64" >&2; exit 2 ;;
  esac
fi

echo "构建当前机器对应镜像：${PLATFORM} -> ${IMAGE} (Node ${NODE_VERSION})"
docker buildx build \
  --platform "$PLATFORM" \
  --build-arg "NODE_VERSION=${NODE_VERSION}" \
  --load \
  -f deploy/docker/Dockerfile.server \
  -t "$IMAGE" .
