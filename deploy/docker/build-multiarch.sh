#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "用法: deploy/docker/build-multiarch.sh <registry/image:tag>" >&2
  exit 2
fi

IMAGE="$1"
NODE_VERSION="$(node -e 'process.stdout.write(require("./config/toolchain.json").runtime.node)')"

echo "构建并推送多架构镜像：linux/arm64 + linux/amd64 -> ${IMAGE} (Node ${NODE_VERSION})"
docker buildx build \
  --platform linux/arm64,linux/amd64 \
  --build-arg "NODE_VERSION=${NODE_VERSION}" \
  --push \
  -f deploy/docker/Dockerfile.server \
  -t "$IMAGE" .
