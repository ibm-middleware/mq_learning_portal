# Multi-stage / lightweight production container for MQ Learning Portal
FROM python:3.9-slim AS runtime

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=5080 \
    HOST=0.0.0.0

WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application assets and templates
COPY app.py site.yaml ./
COPY static/ ./static/
COPY templates/ ./templates/

# Support OpenShift arbitrary user IDs by granting root group permissions
RUN chgrp -R 0 /app && chmod -R g=u /app

EXPOSE 5080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5080/health || exit 1

CMD ["gunicorn", "--bind", "0.0.0.0:5080", "--workers", "2", "--threads", "4", "app:app"]
