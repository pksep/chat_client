FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY . .

RUN bun install --ignore-scripts

RUN bun run build:prod

FROM nginx:stable-alpine AS production

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/20-desktop-updates.sh /docker-entrypoint.d/20-desktop-updates.sh
RUN chmod +x /docker-entrypoint.d/20-desktop-updates.sh
COPY --from=builder /app/build /usr/share/nginx/html
RUN chmod 0644 /usr/share/nginx/html/images/chat-wallpapers/*

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
