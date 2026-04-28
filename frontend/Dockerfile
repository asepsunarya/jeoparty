# Build from the monorepo root: `docker build -f frontend/Dockerfile .`
FROM node:20-alpine AS builder
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY shared ./shared
COPY frontend ./frontend
RUN npm install --ignore-scripts --workspaces --include-workspace-root
RUN npm run build -w @jeoparty/shared
RUN npm run build -w @jeoparty/frontend

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/frontend/package.json ./package.json
COPY --from=builder /repo/frontend/.next ./.next
COPY --from=builder /repo/frontend/public ./public
COPY --from=builder /repo/frontend/next.config.mjs ./next.config.mjs
# npm workspaces installs node_modules at the repo root
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/shared ./node_modules/@jeoparty/shared
EXPOSE 3000
CMD ["npm", "start"]
