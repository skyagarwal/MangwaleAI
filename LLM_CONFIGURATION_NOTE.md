# 📝 LLM Configuration Note - Feb 6, 2026

## ⚠️ IMPORTANT: No Ollama - Using vLLM with Qwen Only

**Configuration**:
- ✅ **Primary LLM**: vLLM with Qwen/Qwen2.5-7B-Instruct-AWQ
- ✅ **Endpoint**: http://localhost:8002
- ❌ **Ollama**: NOT USED (service not available)
- ✅ **Fallback**: Cloud providers (Groq, OpenRouter) if vLLM fails

**From .env**:
```
VLLM_MODEL=Qwen/Qwen2.5-7B-Instruct-AWQ
DEFAULT_LLM_PROVIDER=vllm
VLLM_URL=http://localhost:8002
# Ollama not used - vLLM with Qwen2.5-7B is primary
```

**Action Required**:
- Remove Ollama service calls from LLM service
- Update error messages to not mention Ollama
- Ensure vLLM is the primary local LLM provider
