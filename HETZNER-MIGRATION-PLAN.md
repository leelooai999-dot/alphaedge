# Hetzner VPS Migration Plan — MonteCarloo + Pyeces

**Date:** March 29, 2026
**Goal:** Move from Railway ($5-15/mo, limited, trial plan) to Hetzner VPS + S3 storage
**Status:** Planning

---

## COST COMPARISON

### Current: Railway (Trial Plan)
| Service | Cost | Limits |
|---------|------|--------|
| alphaedge-api (backend) | ~$5/mo | 1 vCPU, 512MB RAM, 3 volumes max |
| Postgres | ~$5/mo | Shared, limited connections |
| Redis | ~$3/mo | Just provisioned |
| Postgres-bl9c (duplicate) | ~$5/mo | Needs deletion |
| Vercel (frontend) | Free | Auto-deploy, fine as-is |
| **Total** | **~$15-18/mo** | **Single container, no scaling, volume limits** |

### Proposed: Hetzner VPS
| Service | Cost | Specs |
|---------|------|-------|
| **CX22** (recommended start) | **€3.99/mo ($4.30)** | 2 vCPU, 4GB RAM, 40GB NVMe, 20TB traffic |
| **CX32** (if need more) | **€6.49/mo ($7.00)** | 3 vCPU, 8GB RAM, 80GB NVMe, 20TB traffic |
| **CX42** (growth) | **€14.49/mo ($15.60)** | 4 vCPU, 16GB RAM, 160GB NVMe, 20TB traffic |
| Hetzner Object Storage (S3) | **€0/mo** (5GB free) then €0.0058/GB | S3-compatible, EU/US regions |
| Vercel (frontend) | Free | Keep as-is |
| **Total (CX22 start)** | **~$4.30/mo** | **4x more power than Railway at 1/4 the cost** |

### Comparison: Other Providers
| Provider | Equivalent Specs | Cost/mo |
|----------|-----------------|---------|
| **Hetzner CX22** | 2 vCPU, 4GB, 40GB | **$4.30** |
| AWS Lightsail | 2 vCPU, 4GB, 80GB | $24.00 |
| AWS EC2 t3.medium | 2 vCPU, 4GB | ~$30+ |
| DigitalOcean | 2 vCPU, 4GB, 80GB | $24.00 |
| Railway (current) | ~0.5 vCPU, 512MB | $15-18 |
| Fly.io | 2 shared CPU, 4GB | $15.00 |
| Render | 2 vCPU, 2GB | $25.00 |

**Hetzner is 5-6x cheaper than AWS/DO for equivalent specs.** The tradeoff: you manage the server yourself (no PaaS magic). But we already have this OpenClaw VM running on a similar setup, so we know how to operate it.

---

## ARCHITECTURE ON HETZNER

```
                    ┌─────────────────────────────┐
                    │      Vercel (FREE)            │
                    │   montecarloo.com frontend    │
                    │   Auto-deploy from GitHub     │
                    └──────────┬──────────────────┘
                               │ API calls
                               ▼
┌──────────────────────────────────────────────────────────┐
│                 Hetzner CX22 VPS ($4.30/mo)              │
│                                                           │
│  ┌──────────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ MonteCarloo   │  │ Postgres  │  │ Redis              │  │
│  │ FastAPI       │  │ (local)   │  │ (local)            │  │
│  │ :8000         │  │ :5432     │  │ :6379              │  │
│  └──────────────┘  └──────────┘  └───────────────────┘  │
│                                                           │
│  ┌──────────────┐  ┌──────────────────────────────────┐  │
│  │ Pyeces        │  │ Nginx reverse proxy              │  │
│  │ Flask         │  │ :443 → :8000 (montcarloo)       │  │
│  │ :8001         │  │ :443 → :8001 (pyeces)           │  │
│  └──────────────┘  │ + Let's Encrypt SSL               │  │
│                     └──────────────────────────────────┘  │
│                                                           │
│  ┌──────────────┐  ┌──────────────────────────────────┐  │
│  │ Celery Worker │  │ systemd services for all         │  │
│  │ (Pyeces jobs) │  │ Auto-restart on crash            │  │
│  └──────────────┘  └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────────────┐
                    │ Hetzner Object Storage (S3)  │
                    │ Pyeces simulation outputs     │
                    │ OG image cache                │
                    │ Backups (pg_dump daily)        │
                    └─────────────────────────────┘
```

---

## MIGRATION STEPS (Detailed)

### Phase 1: Provision Hetzner (30 min)
1. Create account at hetzner.com
2. Provision CX22 VPS (Ashburn US-East or Hillsboro US-West for low latency to US users)
3. Choose Ubuntu 24.04 LTS
4. Add SSH key
5. Enable Hetzner Object Storage bucket (S3-compatible)

### Phase 2: Server Setup (2-3 hours)
```bash
# On the new Hetzner VPS:

# 1. System updates + basics
apt update && apt upgrade -y
apt install -y nginx certbot python3-certbot-nginx \
  postgresql postgresql-contrib redis-server \
  python3-pip python3-venv git ufw

# 2. Firewall
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable

# 3. PostgreSQL setup
sudo -u postgres createuser montecarloo --createdb
sudo -u postgres createdb montecarloo_db -O montecarloo
sudo -u postgres psql -c "ALTER USER montecarloo PASSWORD 'SECURE_PASSWORD_HERE';"

# 4. Redis (already installed, just verify)
redis-cli ping  # Should return PONG

# 5. Clone repo
git clone https://github.com/leelooai999-dot/alphaedge.git /opt/montecarloo
cd /opt/montecarloo/engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install psycopg2-binary redis  # New dependencies

# 6. Pyeces
git clone <pyeces-repo> /opt/pyeces
cd /opt/pyeces/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install celery redis boto3  # For job queue + S3
```

### Phase 3: Nginx + SSL (30 min)
```nginx
# /etc/nginx/sites-available/montecarloo
server {
    server_name api.montecarloo.com;
    
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# /etc/nginx/sites-available/pyeces
server {
    server_name pyeces.montecarloo.com;  # or separate domain
    
    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
# Enable sites + SSL
ln -s /etc/nginx/sites-available/montecarloo /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/pyeces /etc/nginx/sites-enabled/
certbot --nginx -d api.montecarloo.com -d pyeces.montecarloo.com
```

### Phase 4: Systemd Services (1 hour)
```ini
# /etc/systemd/system/montecarloo.service
[Unit]
Description=MonteCarloo API
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/montecarloo/engine
Environment="DATABASE_URL=postgresql://montecarloo:PASSWORD@localhost/montecarloo_db"
Environment="REDIS_URL=redis://localhost:6379/0"
Environment="S3_ENDPOINT=https://BUCKET.s3.REGION.hetzner.com"
Environment="S3_ACCESS_KEY=..."
Environment="S3_SECRET_KEY=..."
ExecStart=/opt/montecarloo/engine/.venv/bin/uvicorn api:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/pyeces.service
[Unit]
Description=Pyeces API
After=network.target redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/pyeces/backend
ExecStart=/opt/pyeces/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/celery-pyeces.service
[Unit]
Description=Pyeces Celery Worker
After=network.target redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/pyeces/backend
ExecStart=/opt/pyeces/backend/.venv/bin/celery -A tasks worker --loglevel=info --concurrency=2
Restart=always

[Install]
WantedBy=multi-user.target
```

### Phase 5: Data Migration (1-2 hours)
```bash
# 1. Export from Railway SQLite
# SSH into Railway or use railway run to dump
railway run --service alphaedge-api -- python3 -c "
import sqlite3, json
conn = sqlite3.connect('/data/alphaedge.db')
conn.row_factory = sqlite3.Row
# Export all tables as JSON
for table in ['scenarios', 'users', 'comments', 'points_ledger', 'badges']:
    rows = conn.execute(f'SELECT * FROM {table}').fetchall()
    with open(f'/tmp/{table}.json', 'w') as f:
        json.dump([dict(r) for r in rows], f)
    print(f'{table}: {len(rows)} rows')
"

# 2. Import into Postgres on Hetzner
# Script reads JSON dumps and inserts into Postgres tables
python3 migrate_sqlite_to_postgres.py

# 3. Verify row counts match
```

### Phase 6: DNS Cutover (5 min)
```
# GoDaddy DNS:
api.montecarloo.com → A record → <Hetzner VPS IP>
# (was pointing to Railway)
# TTL: set to 300 (5 min) before migration, then back to 3600 after
```

### Phase 7: S3 Storage Setup (1 hour)
```python
# New file: engine/storage.py
import boto3
from botocore.config import Config

s3 = boto3.client('s3',
    endpoint_url=os.environ['S3_ENDPOINT'],
    aws_access_key_id=os.environ['S3_ACCESS_KEY'],
    aws_secret_access_key=os.environ['S3_SECRET_KEY'],
    config=Config(signature_version='s3v4')
)

def upload_simulation(sim_id: str, data: dict):
    """Store Pyeces simulation output in S3."""
    s3.put_object(
        Bucket='montecarloo',
        Key=f'simulations/{sim_id}/result.json',
        Body=json.dumps(data),
        ContentType='application/json'
    )

def upload_og_image(scenario_id: str, image_bytes: bytes):
    """Cache OG images in S3 for CDN serving."""
    s3.put_object(
        Bucket='montecarloo',
        Key=f'og/{scenario_id}.png',
        Body=image_bytes,
        ContentType='image/png',
        CacheControl='public, max-age=86400'
    )
```

### Phase 8: Code Changes for Postgres + Redis (2-3 hours)
```python
# engine/db.py — Replace SQLite with Postgres
import psycopg2
from psycopg2.pool import ThreadedConnectionPool

DATABASE_URL = os.environ.get('DATABASE_URL', 'sqlite:///tmp/alphaedge.db')

if DATABASE_URL.startswith('postgresql'):
    pool = ThreadedConnectionPool(2, 10, DATABASE_URL)
    def get_db():
        conn = pool.getconn()
        conn.autocommit = False
        return conn
    def release_db(conn):
        pool.putconn(conn)
else:
    # SQLite fallback for local dev
    ...

# engine/cache.py — Redis caching layer
import redis, hashlib, json

r = redis.from_url(os.environ.get('REDIS_URL', 'redis://localhost:6379/0'))

def cache_simulation(ticker, events, horizon, result, ttl=300):
    key = f"sim:{ticker}:{hashlib.md5(json.dumps(events, sort_keys=True).encode()).hexdigest()}:{horizon}"
    r.setex(key, ttl, json.dumps(result))

def get_cached_simulation(ticker, events, horizon):
    key = f"sim:{ticker}:{hashlib.md5(json.dumps(events, sort_keys=True).encode()).hexdigest()}:{horizon}"
    cached = r.get(key)
    return json.loads(cached) if cached else None
```

### Phase 9: Decommission Railway (after 48h stable)
1. Verify Hetzner serving all traffic correctly
2. Monitor for 48 hours
3. Export final data snapshot from Railway
4. Delete Railway services (Postgres, Redis, alphaedge-api, Postgres-bl9c)
5. Cancel Railway billing

---

## LLM FALLBACK MECHANISM (Codex Free Tier → Claude)

For the character simulation engine and any LLM-powered features:

```python
# engine/llm_router.py
import os, time, logging
from openai import OpenAI
from anthropic import Anthropic

logger = logging.getLogger(__name__)

openai_client = OpenAI()  # Uses OPENAI_API_KEY env var
anthropic_client = Anthropic()  # Uses ANTHROPIC_API_KEY env var

# Track rate limit state
_openai_limited_until = 0

def chat_completion(messages: list, model: str = "gpt-5.3", **kwargs) -> str:
    """Route to OpenAI first, fall back to Claude on rate limit."""
    global _openai_limited_until
    
    # If we're in a rate-limit cooldown, go straight to Claude
    if time.time() < _openai_limited_until:
        return _claude_fallback(messages, **kwargs)
    
    try:
        response = openai_client.chat.completions.create(
            model=model,
            messages=messages,
            **kwargs
        )
        return response.choices[0].message.content
    except Exception as e:
        error_str = str(e)
        if "429" in error_str or "rate_limit" in error_str.lower():
            # Rate limited — cooldown for 60 seconds, use Claude
            _openai_limited_until = time.time() + 60
            logger.warning(f"OpenAI rate limited, falling back to Claude for 60s")
            return _claude_fallback(messages, **kwargs)
        elif "401" in error_str or "403" in error_str:
            # Auth error — permanent fallback
            logger.error(f"OpenAI auth error: {e}")
            return _claude_fallback(messages, **kwargs)
        else:
            raise

def _claude_fallback(messages: list, **kwargs) -> str:
    """Fall back to Claude via Anthropic API."""
    # Convert OpenAI message format to Anthropic format
    system_msg = None
    claude_messages = []
    for m in messages:
        if m["role"] == "system":
            system_msg = m["content"]
        else:
            claude_messages.append({"role": m["role"], "content": m["content"]})
    
    response = anthropic_client.messages.create(
        model="claude-haiku-4-5",  # Fast + cheap for fallback
        max_tokens=kwargs.get("max_tokens", 1024),
        system=system_msg or "",
        messages=claude_messages,
    )
    return response.content[0].text
```

---

## TIMELINE

| Day | Task | Hours |
|-----|------|-------|
| 1 (today) | Provision Hetzner + server setup + Postgres/Redis local | 3-4h |
| 1 | Code changes: db.py → Postgres, cache.py → Redis, llm_router.py | 2-3h |
| 2 | Nginx + SSL + systemd services + Pyeces deployment | 2-3h |
| 2 | Data migration from Railway SQLite → Hetzner Postgres | 1-2h |
| 2 | S3 storage setup + Pyeces integration | 1-2h |
| 3 | DNS cutover + testing + monitoring | 1h |
| 3 | Decommission Railway (after 48h stable) | 30min |
| **Total** | | **~12-16 hours** |

---

## MONTHLY COST AFTER MIGRATION

| Service | Cost |
|---------|------|
| Hetzner CX22 VPS | $4.30/mo |
| Hetzner Object Storage | ~$0-1/mo |
| Vercel (frontend) | Free |
| Domain (GoDaddy) | ~$12/year |
| **Total** | **~$5/mo** (down from $15-18/mo on Railway) |

Savings: ~$10-13/mo, with 4x more compute power.
At 100K users: upgrade to CX32 ($7/mo) or CX42 ($15.60/mo) — still cheaper than Railway.
