# syntax=docker/dockerfile:1
#
# Build context: backend/ (este mismo directorio), por ejemplo:
#   docker build -t backend ./backend

FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable && pnpm config set minimum-release-age 0 --global

FROM base AS build
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --prod --frozen-lockfile

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
USER nodejs

EXPOSE 3000
CMD ["node", "dist/main.js"]
