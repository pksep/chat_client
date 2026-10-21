FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY . .

RUN bun install --ignore-scripts

RUN bun run build:prod

FROM nginx:stable-alpine AS production

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build /usr/share/nginx/html
RUN find /usr/share/nginx/html -type d -exec chmod 0755 {} + \
    && find /usr/share/nginx/html -type f -exec chmod 0644 {} +

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
