FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY . .

RUN bun install --ignore-scripts

RUN bun run build:prod

FROM caddy:2-alpine

RUN mkdir -p /usr/share/caddy

COPY --from=builder /app/build /usr/share/caddy

COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:8080/ || exit 1
