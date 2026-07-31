# Builder stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files from monorepo root
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install dependencies (ci for clean install)
RUN npm ci

# Copy source files
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared package
RUN npm run build -w @repo/shared

# Build API
RUN npm run build -w @repo/api

# Runtime stage
FROM node:20-alpine AS runtime

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
  adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install only production dependencies
RUN npm ci --production

# Copy built artifacts from builder
COPY --from=builder --chown=nodejs:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/dist ./apps/api/dist

# Switch to non-root user
USER nodejs

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "apps/api/dist/main.js"]
