#!/bin/bash
# NER Server Startup Script for Jupiter (192.168.0.156)
# Runs NER model for entity extraction

cd /home/ubuntu/Devs/MangwaleAI/backend/nlu-training
source .venv/bin/activate

# Use the latest trained model
export NER_MODEL_PATH=/home/ubuntu/Devs/MangwaleAI/backend/nlu-training/models/ner_current
export NER_PORT=7011

echo "Starting NER Server on port $NER_PORT with model $NER_MODEL_PATH"
exec python ner_server.py
