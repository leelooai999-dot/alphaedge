#!/usr/bin/env bash
set -e
cd engine
pip install --no-cache-dir -r requirements.txt
exec uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}
