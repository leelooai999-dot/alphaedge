FROM python:3.12-slim

WORKDIR /app

# Install deps first (layer cache)
COPY engine/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy engine code
COPY engine/ /app/

# Railway sets PORT dynamically — must use it
EXPOSE ${PORT:-8000}

CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}"]
