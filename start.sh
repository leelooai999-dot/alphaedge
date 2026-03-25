#!/usr/bin/env bash
cd engine
pip install -r requirements.txt
uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}
