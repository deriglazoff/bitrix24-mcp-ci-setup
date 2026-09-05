# Bitrix24 MCP HTTP-шлюз (нативный SDK-сервер). Стандарт dobrozaim. Порт 5015.
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
RUN chmod +x deploy/docker-entrypoint.sh

EXPOSE 5015
ENV HOST=0.0.0.0 PORT=5015

# healthcheck по TCP-порту
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('net').connect(Number(process.env.PORT)||5015,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/app/deploy/docker-entrypoint.sh"]
