# Monitoring & Infrastructure Guide

## Overview

Dashboarduz now includes comprehensive monitoring, caching, and infrastructure enhancements:

- **Redis Caching** - General-purpose caching layer with TTL support
- **MinIO Media Storage** - Enhanced object storage for images, documents, and media files
- **Prometheus Metrics** - Application metrics exposed at `/metrics`
- **Grafana Dashboards** - Pre-configured dashboards for monitoring
- **Structured Logging** - JSON-formatted logs with request correlation
- **Distributed Rate Limiting** - Redis-backed sliding window rate limiter

## Quick Start

### 1. Start Infrastructure Services

```bash
cd backend
docker-compose up -d postgres redis minio prometheus grafana
```

This starts:
- **PostgreSQL** on port 5432
- **Redis** on port 6379
- **MinIO** on ports 9000 (API) and 9001 (Console)
- **Prometheus** on port 9090
- **Grafana** on port 3000

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key settings:

```env
# Redis (already configured)
REDIS_URL=redis://localhost:6379/1

# MinIO Storage
OBJECT_STORAGE_ENDPOINT_URL=http://localhost:9000
OBJECT_STORAGE_ACCESS_KEY=minioadmin
OBJECT_STORAGE_SECRET_KEY=minioadmin
OBJECT_STORAGE_BUCKET=dashboarduz-media
OBJECT_STORAGE_REGION=us-east-1

# Monitoring
METRICS_ENABLED=true
LOG_JSON_FORMAT=false  # Set to true in production
LOG_LEVEL=INFO

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_GENERAL_REQUESTS=200
RATE_LIMIT_GENERAL_WINDOW_SECONDS=60
```

### 3. Initialize MinIO Bucket

Access MinIO Console at http://localhost:9001 (minioadmin/minioadmin) and create the `dashboarduz-media` bucket.

Or use the MinIO client:

```bash
docker-compose exec minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker-compose exec minio mc mb local/dashboarduz-media
```

### 4. Start the Application

```bash
cd backend
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Access Monitoring

- **Grafana**: http://localhost:3000 (admin/admin)
  - Pre-configured dashboard: "Dashboarduz Overview"
  - Metrics: HTTP requests, durations, cache hit rates, DB queries, Redis operations
  
- **Prometheus**: http://localhost:9090
  - Direct query interface
  - Target status: http://localhost:9090/targets

- **Application Metrics**: http://localhost:8000/metrics
  - Prometheus-format metrics

- **Health Checks**:
  - http://localhost:8000/health - Basic health
  - http://localhost:8000/health/db - Database connectivity
  - http://localhost:8000/health/redis - Redis connectivity
  - http://localhost:8000/health/cache - Cache functionality

## Features

### Redis Caching

General-purpose caching layer for API responses and query results:

```python
from app.core.cache import RedisCache

# In your code
cache = app.state.cache  # Available after lifespan

# Set cache with TTL
await cache.set("user:123", {"name": "John"}, ttl=300)

# Get from cache
user = await cache.get("user:123")

# Delete
await cache.delete("user:123")

# Delete by pattern
await cache.delete_pattern("user:*")

# Hash operations
await cache.hset("session:abc", "user_id", "123")
user_id = await cache.hget("session:abc", "user_id")
```

**Configuration:**
- `CACHE_ENABLED` - Enable/disable caching
- `CACHE_DEFAULT_TTL_SECONDS` - Default TTL (300s)

### MinIO Media Storage

Enhanced object storage with content-type detection and validation:

```python
from app.core import storage

# Generate media keys
key = storage.media_key(tenant_id, "avatars", "profile.jpg")
# -> "media/{tenant_id}/avatars/{uuid}.jpg"

# Upload
await storage.put_object(key, data, content_type="image/jpeg")

# Get presigned URL
url = await storage.presigned_get_url(key, expires_in=3600)

# Get presigned PUT URL (for direct uploads)
put_url = await storage.presigned_put_url(key, "image/png", expires_in=3600)

# Download
data = await storage.get_object(key)

# Delete
await storage.delete_object(key)

# List objects
objects = await storage.list_objects(f"media/{tenant_id}/", max_keys=100)

# Get total size
size = await storage.get_prefix_total_bytes(f"media/{tenant_id}/")

# Delete all objects under prefix
count = await storage.delete_prefix(f"media/{tenant_id}/")

# Validation
if storage.validate_content_type(content_type) and storage.validate_size(size):
    # Proceed with upload
    pass
```

**Key Patterns:**
- `media/{tenant_id}/{category}/{uuid}.{ext}` - General media
- `avatars/{tenant_id}/{user_id}.{ext}` - User avatars
- `recordings/{tenant_id}/{call_id}.mp3` - Call recordings
- `reports/{tenant_id}/{report_id}.pdf` - PDF reports

**Allowed Content Types:**
- Images: JPEG, PNG, WebP, GIF, SVG
- Documents: PDF, DOC, DOCX, XLS, XLSX, CSV, TXT
- Audio: MP3, WAV, OGG, WebM
- Video: MP4, WebM, QuickTime

**Max Upload Size:** 50MB

### Prometheus Metrics

Automatic instrumentation for HTTP requests, database queries, and Redis operations:

**Available Metrics:**
- `http_requests_total` - Total HTTP requests (method, endpoint, status)
- `http_request_duration_seconds` - Request duration histogram
- `http_requests_in_progress` - Currently processing requests
- `db_query_duration_seconds` - Database query duration
- `redis_operation_duration_seconds` - Redis operation duration
- `cache_hits_total` - Cache hit counter
- `cache_misses_total` - Cache miss counter
- `active_users` - Active user gauge
- `background_worker_tasks` - Background worker task count

**Example Queries:**

```promql
# Request rate
rate(http_requests_total[5m])

# Average request duration
rate(http_request_duration_seconds_sum[5m]) / rate(http_requests_total[5m])

# 95th percentile duration
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Error rate
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))

# Cache hit rate
sum(rate(cache_hits_total[5m])) / (sum(rate(cache_hits_total[5m])) + sum(rate(cache_misses_total[5m])))
```

### Structured Logging

JSON-formatted logs with request correlation:

**Enable JSON logging:**
```env
LOG_JSON_FORMAT=true
```

**Log format:**
```json
{
  "timestamp": "2026-07-13T12:34:56.789Z",
  "level": "INFO",
  "logger": "dashboarduz.request",
  "message": "GET /api/v1/users -> 200 (45.2ms)",
  "request_id": "a1b2c3d4e5f6g7h8",
  "method": "GET",
  "path": "/api/v1/users",
  "status_code": 200,
  "duration_ms": 45.2,
  "client_ip": "192.168.1.100"
}
```

**Request context:**
- `request_id` - Unique per request, propagated through logs
- `tenant_id` - Set when tenant context is available
- `user_id` - Set when user is authenticated

### Distributed Rate Limiting

Redis-backed sliding window rate limiter for distributed deployments:

**Rate Limit Buckets:**
- **Auth endpoints** (login, OTP, password-reset): 10 requests/60s
- **Webhook endpoints** (calls, billing, CRM): 120 requests/60s
- **General API endpoints**: 200 requests/60s

**Configuration:**
```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_AUTH_REQUESTS=10
RATE_LIMIT_AUTH_WINDOW_SECONDS=60
RATE_LIMIT_WEBHOOK_REQUESTS=120
RATE_LIMIT_WEBHOOK_WINDOW_SECONDS=60
RATE_LIMIT_GENERAL_REQUESTS=200
RATE_LIMIT_GENERAL_WINDOW_SECONDS=60
TRUST_X_FORWARDED_FOR=false  # Set to true behind reverse proxy
```

**Response Headers:**
- `X-RateLimit-Limit` - Maximum requests allowed
- `X-RateLimit-Remaining` - Remaining requests in window
- `Retry-After` - Seconds until limit resets (on 429)

**Fallback:** If Redis is unavailable, falls back to in-memory per-process limiter.

## Production Deployment

### 1. Enable JSON Logging

```env
LOG_JSON_FORMAT=true
LOG_LEVEL=WARNING  # or INFO for more verbosity
```

### 2. Configure Reverse Proxy

Set `TRUST_X_FORWARDED_FOR=true` when behind nginx/CloudFlare:

```env
TRUST_X_FORWARDED_FOR=true
```

### 3. Tighten CORS

```env
CORS_ALLOWED_ORIGINS=https://app.yourdomain.com
```

### 4. Secure Grafana

Change default admin password:
```env
GRAFANA_ADMIN_USER=your_admin_user
GRAFANA_ADMIN_PASSWORD=strong_password_here
```

### 5. Prometheus Retention

Adjust retention in `docker-compose.yml`:
```yaml
command:
  - "--storage.tsdb.retention.time=30d"  # Keep data for 30 days
```

### 6. Redis Persistence

Redis is configured with AOF persistence in docker-compose:
```yaml
command: redis-server --appendonly yes
```

### 7. MinIO Production

For production, use proper credentials and HTTPS:
```env
OBJECT_STORAGE_ENDPOINT_URL=https://s3.yourdomain.com
OBJECT_STORAGE_ACCESS_KEY=your_access_key
OBJECT_STORAGE_SECRET_KEY=your_secret_key
```

## Troubleshooting

### Redis Connection Issues

```bash
# Check Redis is running
docker-compose ps redis

# Test connection
docker-compose exec redis redis-cli ping

# Check logs
docker-compose logs redis
```

### MinIO Access Issues

```bash
# Check MinIO is running
docker-compose ps minio

# Access console
open http://localhost:9001

# Check logs
docker-compose logs minio
```

### Prometheus Target Down

1. Check app is running: http://localhost:8000/metrics
2. Check Prometheus targets: http://localhost:9090/targets
3. Verify `prometheus.yml` config points to correct host

### Grafana No Data

1. Check Prometheus datasource: Grafana → Configuration → Data Sources
2. Test datasource connection
3. Verify Prometheus is scraping: http://localhost:9090/targets

### Rate Limiting Not Working

1. Verify Redis is connected: http://localhost:8000/health/redis
2. Check logs for rate limit middleware initialization
3. Verify `RATE_LIMIT_ENABLED=true` in `.env`

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│   FastAPI Application (port 8000)   │
│  ┌───────────────────────────────┐  │
│  │ RequestLoggingMiddleware      │  │
│  │ SecurityHeadersMiddleware     │  │
│  │ CORSMiddleware                │  │
│  │ DistributedRateLimitMiddleware│  │
│  │ MetricsMiddleware             │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ Redis Cache Layer             │  │
│  │ MinIO Storage Layer           │  │
│  └───────────────────────────────┘  │
└──────────┬──────────────────────────┘
           │
           ├──────────────┬──────────────┐
           ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │PostgreSQL│   │  Redis   │   │  MinIO   │
    │  :5432   │   │  :6379   │   │:9000/9001│
    └──────────┘   └──────────┘   └──────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │  Prometheus  │
                   │    :9090     │
                   └──────┬───────┘
                          │
                          ▼
                   ┌──────────────┐
                   │   Grafana    │
                   │    :3000     │
                   └──────────────┘
```

## Next Steps

1. **Set up alerts** in Grafana for error rates, latency spikes, and resource exhaustion
2. **Add more dashboards** for specific modules (sales, finance, CRM)
3. **Implement caching** in high-traffic endpoints (catalog, analytics)
4. **Add media upload endpoints** using the enhanced storage layer
5. **Configure backup** for PostgreSQL, Redis, and MinIO
6. **Set up log aggregation** (ELK/Loki) for centralized logging

## Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Redis Documentation](https://redis.io/docs/)
- [MinIO Documentation](https://min.io/docs/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
