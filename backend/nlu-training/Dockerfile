# NLU Training Container - GPU Enabled
# This container is used for training IndicBERT models on Jupiter's GPU
# The trained models are then deployed to the inference container

FROM pytorch/pytorch:2.2.2-cuda12.1-cudnn8-runtime

WORKDIR /app

# Install training dependencies
RUN pip install --no-cache-dir \
    transformers==4.42.3 \
    datasets==2.20.0 \
    scikit-learn==1.5.1 \
    accelerate==0.32.1 \
    evaluate==0.4.2 \
    tensorboard==2.17.0 \
    fastapi==0.111.0 \
    uvicorn==0.30.1 \
    requests==2.32.3 \
    psycopg2-binary==2.9.9

# Copy training scripts
COPY train.py .
COPY server.py .
COPY export_data.py .

# Create directories
RUN mkdir -p /models /training-data /logs

# Environment
ENV PYTHONUNBUFFERED=1
ENV HF_HOME=/app/.cache/huggingface
ENV TRANSFORMERS_CACHE=/app/.cache/huggingface

# Training server runs on port 7011
EXPOSE 7011

# Default: run training server
CMD ["python", "server.py"]
