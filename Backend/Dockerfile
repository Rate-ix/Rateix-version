# ─── Base image with Python + Tesseract pre-installed ────────────────────────
FROM python:3.11-slim

# Install Tesseract OCR + OpenCV system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY scandealerbill.py .

# Expose port
EXPOSE 8000

# Run the server
CMD ["uvicorn", "scandealerbill:app", "--host", "0.0.0.0", "--port", "8000"]
