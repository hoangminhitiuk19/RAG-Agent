FROM python:3.10-slim

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    python3-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create data directory and copy files
COPY data/ ./data/

# Copy server code
COPY rag_server.py .
COPY utils/ ./utils/

# Expose the port
EXPOSE 8080

# Set Python to not buffer output
ENV PYTHONUNBUFFERED=1

# Start the server

CMD ["uvicorn", "rag_server:app", "--host", "0.0.0.0", "--port", "8080"]
