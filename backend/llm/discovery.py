
import logging
import httpx
from typing import List, Optional

logger = logging.getLogger(__name__)

async def get_available_ollama_models(base_url: str = "http://localhost:11434") -> List[str]:
    """
    Query the Ollama API for available models.
    Returns a list of model names (e.g., ['llama3:latest', 'mistral:latest']).
    """
    timeout = 5.0
    urls_to_try = [base_url]
    
    # If using localhost, try 127.0.0.1 as fallback
    if "localhost" in base_url:
        urls_to_try.append(base_url.replace("localhost", "127.0.0.1"))

    for url in urls_to_try:
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                logger.info("Querying Ollama at %s ...", url)
                resp = await client.get(f"{url}/api/tags")
                if resp.status_code == 200:
                    models = resp.json().get("models", [])
                    logger.info("Found %d models at %s", len(models), url)
                    return [m["name"] for m in models]
                else:
                    logger.warning("Ollama returned status %d at %s", resp.status_code, url)
        except Exception as e:
            logger.warning(f"Failed to discover Ollama models at {url}: {e}")
            
    return []

def select_best_model(models: List[str]) -> Optional[str]:
    """
    Select the best model from the available list based on heuristics.
    Prioritizes: Llama 3 > Mistral > Gemma > Phi-3 > Llama 2 > Others.
    """
    if not models:
        return None

    # Preference list (ordered by general quality/speed balance for edge)
    preferences = [
        "llama3.2", "llama3.1", "llama3", 
        "mistral", "mixtral", 
        "gemma", "gemma2",
        "phi3", "phi-3",
        "tinyllama", 
        "llama2"
    ]

    # Normalize model names checks
    # match existing models against preferences
    for pref in preferences:
        for model in models:
            if pref in model.lower():
                return model
    
    # Fallback to the first model if no preference matches
    return models[0]
