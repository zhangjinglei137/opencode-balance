#!/bin/bash
# Docker 镜像构建并推送脚本
# 用法: ./scripts/publish-docker.sh [tag]
# 示例: ./scripts/publish-docker.sh v1.2.0

set -e

IMAGE="${DOCKER_IMAGE:-opencode-balance}"
REGISTRY="${DOCKER_REGISTRY:-docker.io}"
USERNAME="${DOCKER_USERNAME:-}"

if [ -z "$USERNAME" ]; then
  echo "错误: 请设置 DOCKER_USERNAME 环境变量"
  echo "用法: DOCKER_USERNAME=yourname ./scripts/publish-docker.sh [tag]"
  exit 1
fi

TAG="${1:-latest}"
FULL_IMAGE="${REGISTRY}/${USERNAME}/${IMAGE}:${TAG}"

echo ">>> 构建镜像: ${FULL_IMAGE}"
docker build -t "${FULL_IMAGE}" .

if [ "${TAG}" != "latest" ]; then
  echo ">>> 同时打 latest 标签"
  docker tag "${FULL_IMAGE}" "${REGISTRY}/${USERNAME}/${IMAGE}:latest"
fi

echo ">>> 推送镜像"
docker push "${FULL_IMAGE}"

if [ "${TAG}" != "latest" ]; then
  docker push "${REGISTRY}/${USERNAME}/${IMAGE}:latest"
fi

echo ">>> 完成: ${FULL_IMAGE}"
