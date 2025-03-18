import os
import hashlib
import pickle
import logging
import time

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# Cache directory
CACHE_DIR = "embedding_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

def get_cached_embedding(text, model="text-embedding-3-large"):
    """Get embedding with caching to avoid redundant API calls."""
    # Create a hash of the text and model
    text_hash = hashlib.md5(text.encode()).hexdigest()
    model_dir = f"{CACHE_DIR}/{model}"
    cache_file = f"{model_dir}/{text_hash}.pkl"
    
    # Check if cached embedding exists
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "rb") as f:
                embedding = pickle.load(f)
                logging.debug(f"Cache hit for text hash: {text_hash[:8]}...")
                return embedding
        except Exception as e:
            logging.error(f"Error loading cached embedding: {e}")
            # Continue to generate a new embedding if loading fails
    
    # Return None if not cached - the caller will generate the embedding
    return None

def cache_embedding(text, embedding, model="text-embedding-3-large"):
    """Cache an embedding to avoid future API calls."""
    if embedding is None:
        return False
        
    # Create a hash of the text and model
    text_hash = hashlib.md5(text.encode()).hexdigest()
    model_dir = f"{CACHE_DIR}/{model}"
    cache_file = f"{model_dir}/{text_hash}.pkl"
    
    # Ensure directory exists
    os.makedirs(model_dir, exist_ok=True)
    
    try:
        # Save embedding to cache
        with open(cache_file, "wb") as f:
            pickle.dump(embedding, f)
        return True
    except Exception as e:
        logging.error(f"Error caching embedding: {e}")
        return False

def clear_cache(model=None):
    """Clear the embedding cache for a specific model or all models."""
    cleared_count = 0
    
    if model:
        model_dir = f"{CACHE_DIR}/{model}"
        if os.path.exists(model_dir):
            for filename in os.listdir(model_dir):
                os.remove(os.path.join(model_dir, filename))
                cleared_count += 1
            logging.info(f"Cleared {cleared_count} cached embeddings for model {model}")
    else:
        if os.path.exists(CACHE_DIR):
            for model_dir in os.listdir(CACHE_DIR):
                model_path = os.path.join(CACHE_DIR, model_dir)
                if os.path.isdir(model_path):
                    for filename in os.listdir(model_path):
                        os.remove(os.path.join(model_path, filename))
                        cleared_count += 1
                    logging.info(f"Cleared {cleared_count} cached embeddings for model {model_dir}")
    
    return cleared_count

def get_cache_stats():
    """Get statistics about the embedding cache."""
    stats = {"total_size": 0, "total_files": 0, "models": {}}
    
    if os.path.exists(CACHE_DIR):
        for model_dir in os.listdir(CACHE_DIR):
            model_path = os.path.join(CACHE_DIR, model_dir)
            if os.path.isdir(model_path):
                model_size = 0
                model_files = 0
                
                for filename in os.listdir(model_path):
                    file_path = os.path.join(model_path, filename)
                    file_size = os.path.getsize(file_path)
                    model_size += file_size
                    model_files += 1
                
                stats["models"][model_dir] = {
                    "size_bytes": model_size,
                    "size_mb": model_size / (1024 * 1024),
                    "file_count": model_files
                }
                
                stats["total_size"] += model_size
                stats["total_files"] += model_files
        
        stats["total_size_mb"] = stats["total_size"] / (1024 * 1024)
    
    return stats