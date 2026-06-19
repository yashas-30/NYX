import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # LLM Defaults
    DEFAULT_LOCAL_MODEL: str = "ollama/llama3"
    DEFAULT_CLOUD_MODEL: str = "claude-3-5-sonnet-20240620"
    
    # LiteLLM Fallback configurations
    # If the primary cloud model fails, fallback to these
    LITELLM_FALLBACKS: list[str] = ["gpt-4o", "gemini-1.5-pro"]
    
    # Semantic Routing Settings
    ROUTER_EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    
    # Privacy Proxy Settings
    GLINER_MODEL: str = "urchade/gliner_small-v2.1"
    
    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
