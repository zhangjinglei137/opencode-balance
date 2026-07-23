# ---- Stage 1: 构建前端 ----
FROM node:22-alpine AS frontend-builder

WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Stage 2: 生产运行 ----
FROM node:22-alpine

WORKDIR /app

# 后端
COPY server/ ./server/
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 前端构建产物
COPY --from=frontend-builder /app/client/dist ./client/dist

# 数据持久化目录
RUN mkdir -p /app/data

ENV PORT=3456
EXPOSE 3456

CMD ["node", "server/index.js"]
