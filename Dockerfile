FROM node:22-alpine AS package
WORKDIR /source
COPY package.json ./
COPY scripts/package-server.mjs ./scripts/package-server.mjs
COPY server ./server
COPY src ./src
RUN npm run build:server

FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/server-data
WORKDIR /app
COPY --from=package /source/dist-server/*.tgz ./server.tgz
RUN tar -xzf server.tgz --strip-components=1 && rm server.tgz \
    && npm ci --omit=dev && mkdir -p /app/server-data && chown node:node /app/server-data
USER node
EXPOSE 3000
VOLUME ["/app/server-data"]
CMD ["node", "server/index.js"]
