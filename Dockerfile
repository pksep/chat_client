FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY . .

RUN bun install --ignore-scripts

RUN bun run build:prod

FROM nginx:stable-alpine AS production

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build /usr/share/nginx/html
RUN chmod -R a+rX /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
