# ─── Backend ───────────────────────────────────────────────────────────
FROM node:22-alpine AS backend-build
WORKDIR /app/backend
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS backend
WORKDIR /app/backend
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=backend-build /app/backend/dist ./dist
EXPOSE 5000
USER node
CMD ["node", "dist/server.js"]
