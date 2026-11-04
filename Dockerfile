FROM node:20-alpine AS build
WORKDIR /app/server
COPY server/package.json ./
RUN npm install --no-audit --no-fund
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    GAME_ROOT=/app \
    DB_FILE=/app/data/game.db
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/dist ./server/dist
COPY server/package.json ./server/package.json
COPY client ./client
COPY shared ./shared
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "server/dist/main.js"]
