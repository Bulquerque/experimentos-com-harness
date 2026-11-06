# Zero-network-dependency runtime: the complete static fallback UI ships with the repository.
# React/TypeScript source is included and can be compiled optionally with npm run build.
FROM node:22-alpine
ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0
WORKDIR /app
COPY --chown=node:node apps/server/src ./apps/server/src
COPY --chown=node:node apps/web/fallback ./apps/web/fallback
RUN mkdir -p /app/workspace /run/harness && chown node:node /app/workspace /run/harness
USER node
EXPOSE 8787
CMD ["node","--experimental-strip-types","apps/server/src/index.ts"]
