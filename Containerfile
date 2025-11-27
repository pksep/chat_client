FROM node:24-alpine AS builder

RUN npm install -g pnpm

WORKDIR /app

COPY packages/chat-core packages/chat-core

COPY ./tsconfig.json .

WORKDIR /app/packages/chat-core

RUN pnpm install --prod

RUN pnpm add vue-tsc vite vue typescript @vitejs/plugin-vue cross-env vite-plugin-dts vite-plugin-pwa

RUN VITE_BASE_MODE=app pnpm run build

FROM caddy:2-alpine

RUN mkdir -p /usr/share/caddy

COPY --from=builder /app/packages/chat-core/build /usr/share/caddy

RUN echo $':8080\nroot * /usr/share/caddy\nfile_server\nencode gzip\n\n@javascript {\n    path *.js\n}\nheader @javascript Content-Type application/javascript\n\n@wasm {\n    path *.wasm\n}\nheader @wasm Content-Type application/wasm\n\n@html {\n    path *.html\n}\nheader @html Content-Type text/html\n\ntry_files {path} {path}/ /index.html' > /etc/caddy/Caddyfile

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:8080/ || exit 1
