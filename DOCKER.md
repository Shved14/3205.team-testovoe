# Docker Setup

This project includes Docker configuration for building and running the API and web applications.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+

## Architecture

### API Service (`apps/api/Dockerfile`)
- **Builder stage**: Node.js 20 Alpine with `npm ci` for clean dependency installation
- **Builds**: Shared package and API using NestJS
- **Runtime stage**: Minimal Node.js 20 Alpine with only production dependencies
- **Features**:
  - Multi-stage build for small image size (< 300 MB)
  - Non-root user (`nodejs` with UID 1001)
  - `dumb-init` for proper signal handling
  - Health check on `/health` endpoint
  - Exposes port 3000

### Web Service (`apps/web/Dockerfile`)
- **Builder stage**: Node.js 20 Alpine for Vite build
- **Runtime stage**: Nginx Alpine for static file serving
- **Features**:
  - Multi-stage build
  - Nginx serves static files with SPA routing
  - Health check on `/`
  - Exposes port 80

### Nginx Configuration (`apps/web/nginx.conf`)
- SPA routing with `try_files $uri /index.html`
- API proxy to `http://api:3000` with 30s read timeout
- Health endpoint proxy
- Static asset caching (1 year)
- Security headers (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection)

## Quick Start

### Build and Run

```bash
# Build and start all services
docker compose up --build

# Access the application
open http://localhost:8080
```

### Development Mode

For development, use the standard npm workspaces instead of Docker:

```bash
# Install dependencies
npm install

# Start API and web in parallel
npm run dev
```

## Environment Variables

The API service uses the following environment variables (with defaults):

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Environment mode |
| `PORT` | `3000` | API port |
| `LOG_LEVEL` | `info` | Logging level |
| `PER_JOB_CONCURRENCY` | `5` | Max concurrent URL checks per job |
| `MAX_ARTIFICIAL_DELAY_MS` | `0` | Max artificial delay for testing |
| `CANCEL_STRATEGY` | `abort` | Job cancellation strategy |
| `REQUEST_TIMEOUT_MS` | `10000` | HTTP request timeout |
| `JOB_TTL_MS` | `86400000` | Job time-to-live (24 hours) |
| `MAX_JOBS` | `1000` | Maximum jobs in memory |
| `CLEANUP_INTERVAL_MS` | `60000` | Cleanup interval (1 minute) |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Graceful shutdown timeout |

To override defaults, create a `.env` file or modify `docker-compose.yml`:

```yaml
services:
  api:
    environment:
      LOG_LEVEL: debug
      PER_JOB_CONCURRENCY: 10
```

## Docker Commands

### Build Only

```bash
# Build all services
docker compose build

# Build specific service
docker compose build api
docker compose build web
```

### Run Services

```bash
# Start in foreground
docker compose up

# Start in background
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down

# Stop and remove volumes
docker compose down -v
```

### Service Management

```bash
# Restart specific service
docker compose restart api

# Scale services (if needed)
docker compose up --scale web=2

# View service status
docker compose ps
```

## Health Checks

Both services include health checks:

- **API**: Checks `/health` endpoint every 30s
- **Web**: Checks `/` endpoint every 30s

The web service waits for the API to become healthy before starting (via `depends_on` condition).

## Image Size Optimization

The multi-stage builds ensure minimal image sizes:

- API image: ~250-300 MB (Node.js Alpine + production deps)
- Web image: ~30-50 MB (Nginx Alpine + static files)

## Troubleshooting

### Build Issues

If you encounter build issues, try:

```bash
# Clean build
docker compose down -v
docker compose build --no-cache
docker compose up
```

### Port Conflicts

If port 8080 is already in use, modify the port mapping in `docker-compose.yml`:

```yaml
services:
  web:
    ports:
      - "8081:80"  # Use 8081 instead
```

### Viewing Logs

```bash
# All logs
docker compose logs

# Specific service logs
docker compose logs api
docker compose logs web

# Follow logs
docker compose logs -f
```

### Container Shell Access

```bash
# Access API container
docker compose exec api sh

# Access web container
docker compose exec web sh
```

## Production Considerations

1. **Security**: Run with non-root users (already configured)
2. **Resource Limits**: Add resource limits to `docker-compose.yml` for production
3. **Secrets**: Use Docker secrets or environment files for sensitive data
4. **Monitoring**: Consider adding external monitoring (Prometheus, etc.)
5. **Backup**: Implement backup strategy for job data if needed

## Cleanup

```bash
# Stop and remove containers
docker compose down

# Remove images
docker compose down --rmi all

# Remove volumes
docker compose down -v

# Complete cleanup (removes everything)
docker system prune -a
```
