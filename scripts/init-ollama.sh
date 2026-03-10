#!/usr/bin/env sh
set -e

MODEL_NAME="${1:-llama3.2:1b}"
EMBED_MODEL_NAME="${2:-nomic-embed-text}"

echo "Pulling ${MODEL_NAME} into local Ollama container..."
docker exec -it ai-recruiting-ollama ollama pull "${MODEL_NAME}"
echo "Pulling ${EMBED_MODEL_NAME} into local Ollama container..."
docker exec -it ai-recruiting-ollama ollama pull "${EMBED_MODEL_NAME}"
echo "Models ready: ${MODEL_NAME}, ${EMBED_MODEL_NAME}"
