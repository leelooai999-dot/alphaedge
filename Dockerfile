FROM python:3.12-slim

WORKDIR /app

# Install deps first (layer cache)
COPY engine/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy engine code
COPY engine/ /app/

# Railway injects PORT env var
ENV PORT=8000
EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
