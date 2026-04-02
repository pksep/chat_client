FROM oven/bun:1-alpine AS builder

WORKDIR /app

ARG ENV_FILE=.env
COPY . .
COPY ${ENV_FILE} ./.env

RUN bun install --ignore-scripts

RUN bun run build:prod

FROM nginx:stable-alpine AS production

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
