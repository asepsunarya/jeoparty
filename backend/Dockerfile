# Build from the monorepo root: `docker build -f backend/Dockerfile .`
FROM node:20-alpine AS builder
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY shared ./shared
COPY backend ./backend
RUN npm install --ignore-scripts --workspaces --include-workspace-root
RUN npm run build -w @jeoparty/shared
RUN npm run build -w @jeoparty/backend

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/backend/package.json ./package.json
COPY --from=builder /repo/backend/dist ./dist
COPY --from=builder /repo/shared/dist ./node_modules/@jeoparty/shared/dist
COPY --from=builder /repo/shared/package.json ./node_modules/@jeoparty/shared/package.json
RUN npm install --omit=dev --ignore-scripts
EXPOSE 4000
CMD ["node", "dist/main.js"]
