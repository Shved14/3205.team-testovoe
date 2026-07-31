# Builder stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files from monorepo root
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN npm ci

# Copy source files
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Build shared package
RUN npm run build -w @repo/shared

# Build web app
RUN npm run build -w @repo/web

# Runtime stage
FROM nginx:alpine AS runtime

# Install wget for healthcheck
RUN apk add --no-cache wget

# Copy nginx config
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built web app from builder
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
