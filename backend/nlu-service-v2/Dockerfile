FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

WORKDIR /app

# Install dependencies
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn \
    transformers \
    pydantic \
    torch

# Copy service code
COPY main.py /app/

# Create cache directory
RUN mkdir -p /hf_cache

# Set environment variables
ENV HF_HOME=/hf_cache
ENV TRANSFORMERS_CACHE=/hf_cache
ENV HF_MODEL_NAME=ai4bharat/IndicBERTv2-MLM-Back-TLM
ENV INTENT_MODEL=/models/indicbert_active

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:7010/healthz || exit 1

EXPOSE 7010

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7010"]
