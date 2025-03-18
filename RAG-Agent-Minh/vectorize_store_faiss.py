import os
import time
import json
import openai
import faiss
import numpy as np
import logging
from dotenv import load_dotenv
from openai import OpenAIError, RateLimitError
from datetime import datetime, timedelta
from embedding_cache import get_cached_embedding, cache_embedding
import tiktoken

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# Load environment variables from .env
load_dotenv()

# OpenAI API Key
# openai.api_key = os.getenv("OPENAI_API_KEY")
openai.api_key = ""


if openai.api_key is None:
    logging.error("⚠ ERROR: OpenAI API key not found. Ensure .env file is correctly configured.")
    exit(1)
else:
    logging.info("✅ OpenAI API key loaded successfully.")

# File Paths
PROCESSED_FILE = "processed_chunks.json"  # Updated to JSON format
FAISS_INDEX_FILE = "faiss_index.bin"
METADATA_FILE = "faiss_metadata.json"  # Store metadata mapping

def get_embedding(text, max_retries=5, max_tokens=8000):
    """
    Generates OpenAI embedding with retries for rate limits, caching, and handling of large texts.
    Splits text into smaller parts if it exceeds the token limit.
    """
    # Check if text is very long - split and average embeddings if needed
    import tiktoken
    encoding = tiktoken.get_encoding("cl100k_base")  # OpenAI's encoding for text-embedding-3-large
    tokens = encoding.encode(text)
    
    if len(tokens) > max_tokens:
        logging.info(f"Text has {len(tokens)} tokens which exceeds {max_tokens}. Splitting and averaging embeddings.")
        
        # Split text into smaller parts
        parts = []
        current_part = []
        current_tokens = 0
        
        for token in tokens:
            if current_tokens < max_tokens:
                current_part.append(token)
                current_tokens += 1
            else:
                parts.append(encoding.decode(current_part))
                current_part = [token]
                current_tokens = 1
        
        # Add the last part if not empty
        if current_part:
            parts.append(encoding.decode(current_part))
        
        # Generate embeddings for each part and average them
        embeddings = []
        for part in parts:
            part_embedding = _get_single_embedding(part, max_retries)
            if part_embedding:
                embeddings.append(part_embedding)
        
        if embeddings:
            # Convert to numpy for easier averaging
            np_embeddings = np.array(embeddings)
            # Calculate average embedding
            avg_embedding = np.mean(np_embeddings, axis=0).tolist()
            # Cache the averaged embedding
            cache_embedding(text, avg_embedding)
            return avg_embedding
        else:
            logging.error("❌ Failed to get embeddings for text parts.")
            return None
    
    # For normal-sized texts, use the regular approach
    return _get_single_embedding(text, max_retries)

def _get_single_embedding(text, max_retries=5):
    """Helper function to get embedding for a single piece of text."""
    # Check cache first
    cached_embedding = get_cached_embedding(text)
    if cached_embedding:
        return cached_embedding
    
    # Continue with regular API call if not cached
    retries = 0
    while retries < max_retries:
        try:
            response = openai.embeddings.create(
                model="text-embedding-3-large",
                input=text
            )
            embedding = response.data[0].embedding
            
            # Cache the new embedding
            cache_embedding(text, embedding)
            
            return embedding

        except RateLimitError:
            wait_time = 2 ** retries  # Exponential backoff
            logging.warning(f"⚠ Rate limit hit. Retrying in {wait_time} seconds...")
            time.sleep(wait_time)
            retries += 1

        except OpenAIError as e:
            logging.error(f"❌ OpenAI API error: {e}")
            break

        except Exception as e:
            logging.error(f"❌ Unexpected error: {e}")
            break

    logging.error("❌ Failed to get embedding after multiple retries.")
    return None

def load_chunks(file_path):
    """Loads text chunks and metadata from the processed JSON file."""
    try:
        with open(file_path, "r", encoding="utf-8") as file:
            chunks = json.load(file)

        logging.info(f"✅ Loaded {len(chunks)} text chunks with metadata.")

        return chunks  # Returns JSON objects (not just plain text)

    except Exception as e:
        logging.error(f"❌ Error loading chunks from file: {e}")
        return []

def store_embeddings_in_faiss(chunks):
    """Generates embeddings and stores them in FAISS with metadata."""
    if not chunks:
        logging.error("❌ No chunks found for embedding. Exiting...")
        return
    
    # Start time tracking
    start_time = time.time()
    start_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    logging.info(f"🚀 Embedding process started at: {start_timestamp}")

    # Use HNSW index for better performance
    dimension = 3072  # text-embedding-3-large dimension
    index = faiss.IndexHNSWFlat(dimension, 32)  # 32 neighbors per node
    index.hnsw.efConstruction = 128  # Higher for better accuracy, but slower build
    index.hnsw.efSearch = 128  # Can be adjusted during search time
    
    metadata_mapping = {}  # Track chunk ID to metadata mapping
    
    vectors = []
    chunk_ids = []

    # Process chunks in batches to avoid memory issues
    batch_size = 100
    total_chunks = len(chunks)
    batches = (total_chunks + batch_size - 1) // batch_size
    
    for batch_idx in range(batches):
        start_idx = batch_idx * batch_size
        end_idx = min(start_idx + batch_size, total_chunks)
        batch_chunks = chunks[start_idx:end_idx]
        
        batch_vectors = []
        
        for i, chunk in enumerate(batch_chunks):
            chunk_id = start_idx + i
            if isinstance(chunk, dict) and "text" in chunk and "metadata" in chunk:
                text = chunk["text"]
                metadata = chunk["metadata"]
            else:
                text = chunk
                metadata = {}

            embedding = get_embedding(text)
            if embedding:
                batch_vectors.append(embedding)
                chunk_ids.append(chunk_id)
                
                # Store metadata with rich information
                metadata_mapping[str(chunk_id)] = {
                    **metadata,
                    "ingestion_date": datetime.now().strftime("%Y-%m-%d"),
                    "text_preview": text[:200]
                }
        
        if batch_vectors:
            vectors_np = np.array(batch_vectors, dtype=np.float32)
            index.add(vectors_np)
            logging.info(f"✅ Added batch {batch_idx+1}/{batches} with {len(batch_vectors)} vectors")
    
    # Save the index and metadata
    faiss.write_index(index, FAISS_INDEX_FILE)
    
    with open(METADATA_FILE, "w", encoding="utf-8") as meta_file:
        json.dump(metadata_mapping, meta_file, indent=4, ensure_ascii=False)
    
    end_time = time.time()
    elapsed = end_time - start_time
    logging.info(f"✅ Embeddings completed in {elapsed:.2f} seconds. Generated {len(chunk_ids)} vectors.")
    
    return metadata_mapping

def incremental_update(new_chunks):
    """Updates the FAISS index with new chunks while preserving existing ones."""
    # Load existing metadata and index if they exist
    metadata_mapping = {}
    if os.path.exists(METADATA_FILE):
        with open(METADATA_FILE, "r", encoding="utf-8") as meta_file:
            metadata_mapping = json.load(meta_file)
    
    # Calculate next available ID
    next_id = 0
    if metadata_mapping:
        next_id = max(map(int, metadata_mapping.keys())) + 1
    
    # Load existing FAISS index if it exists
    dimension = 3072  # text-embedding-3-large dimension
    if os.path.exists(FAISS_INDEX_FILE):
        index = faiss.read_index(FAISS_INDEX_FILE)
    else:
        index = faiss.IndexFlatL2(dimension)
    
    # Process new chunks
    vectors = []
    new_chunk_ids = []
    
    for i, chunk in enumerate(new_chunks):
        text = chunk["text"]
        metadata = chunk["metadata"]
        
        # Extract topic as in previous function
        filepath = metadata.get("filename", "")
        topic = "Unknown"
        if "/Coffee/" in filepath or "\\Coffee\\" in filepath:
            topic = "Coffee"
        elif "/Pepper/" in filepath or "\\Pepper\\" in filepath:
            topic = "Pepper"
        
        embedding = get_embedding(text)
        if embedding:
            vectors.append(embedding)
            chunk_id = next_id + i
            new_chunk_ids.append(chunk_id)
            metadata_mapping[str(chunk_id)] = {
                "filename": metadata.get("filename", "Unknown"),
                "file_type": metadata.get("file_type", "Unknown"),
                "topic": topic,
                "extracted_date": metadata.get("extracted_date", "Unknown"),
                "source": metadata.get("source", "Unknown"),
                "ingestion_date": datetime.now().strftime("%Y-%m-%d"),
                "text_preview": text[:200]
            }
    
    # Add new vectors to the index
    if vectors:
        vectors_np = np.array(vectors, dtype=np.float32)
        index.add(vectors_np)
        faiss.write_index(index, FAISS_INDEX_FILE)
        
        # Save updated metadata
        with open(METADATA_FILE, "w", encoding="utf-8") as meta_file:
            json.dump(metadata_mapping, meta_file, indent=4, ensure_ascii=False)
        
        return len(vectors)
    
    return 0

def store_client_embeddings(client_chunks, client_id):
    """Stores client-specific embeddings with higher priority tag."""
    # Similar to incremental update but with client-specific markers
    # Load existing data
    metadata_mapping = {}
    if os.path.exists(METADATA_FILE):
        with open(METADATA_FILE, "r", encoding="utf-8") as meta_file:
            metadata_mapping = json.load(meta_file)
    
    next_id = 0
    if metadata_mapping:
        next_id = max(map(int, metadata_mapping.keys())) + 1
    
    # Load existing FAISS index
    dimension = 3072
    if os.path.exists(FAISS_INDEX_FILE):
        index = faiss.read_index(FAISS_INDEX_FILE)
    else:
        index = faiss.IndexFlatL2(dimension)
    
    # Process client chunks
    vectors = []
    client_chunk_ids = []
    
    for i, chunk in enumerate(client_chunks):
        text = chunk["text"]
        metadata = chunk["metadata"]
        
        embedding = get_embedding(text)
        if embedding:
            vectors.append(embedding)
            chunk_id = next_id + i
            client_chunk_ids.append(chunk_id)
            metadata_mapping[str(chunk_id)] = {
                "filename": metadata.get("filename", "Unknown"),
                "file_type": metadata.get("file_type", "Unknown"),
                "topic": "ClientData",
                "client_id": client_id,  # Track which client this belongs to
                "priority": "high",  # Mark as high priority
                "temporary": True,  # Mark as temporary
                "ingestion_date": datetime.now().strftime("%Y-%m-%d"),
                "expiry_date": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"), # Example: 30-day access
                "text_preview": text[:200]
            }
    
    # Add new vectors to the index
    if vectors:
        vectors_np = np.array(vectors, dtype=np.float32)
        index.add(vectors_np)
        faiss.write_index(index, FAISS_INDEX_FILE)
        
        # Save updated metadata
        with open(METADATA_FILE, "w", encoding="utf-8") as meta_file:
            json.dump(metadata_mapping, meta_file, indent=4, ensure_ascii=False)
        
        return client_chunk_ids  # Return IDs for later removal
    
    return []

def remove_client_data(client_id):
    """Removes temporary client data from the system."""
    # This is more complex, as FAISS doesn't directly support removing vectors
    # A complete solution would require rebuilding the index without those vectors
    
    # 1. Identify vectors to remove
    metadata_mapping = {}
    if os.path.exists(METADATA_FILE):
        with open(METADATA_FILE, "r", encoding="utf-8") as meta_file:
            metadata_mapping = json.load(meta_file)
    
    # Find IDs to remove
    ids_to_remove = []
    updated_metadata = {}
    
    for chunk_id, metadata in metadata_mapping.items():
        if metadata.get("client_id") == client_id and metadata.get("temporary", False):
            ids_to_remove.append(int(chunk_id))
        else:
            updated_metadata[chunk_id] = metadata
    
    if not ids_to_remove:
        return 0  # Nothing to remove
    
    # 2. Load all vectors that should remain
    dimension = 3072
    old_index = faiss.read_index(FAISS_INDEX_FILE)
    new_index = faiss.IndexFlatL2(dimension)
    
    # This is efficient only for small to medium indices
    # For very large indices, consider alternative approaches
    all_vectors = old_index.reconstruct_n(0, old_index.ntotal)
    
    # 3. Add back only vectors we want to keep
    keep_vectors = []
    for i in range(old_index.ntotal):
        if i not in ids_to_remove:
            keep_vectors.append(all_vectors[i])
    
    if keep_vectors:
        keep_vectors_np = np.array(keep_vectors, dtype=np.float32)
        new_index.add(keep_vectors_np)
    
    # 4. Save updated index and metadata
    faiss.write_index(new_index, FAISS_INDEX_FILE)
    with open(METADATA_FILE, "w", encoding="utf-8") as meta_file:
        json.dump(updated_metadata, meta_file, indent=4, ensure_ascii=False)
    
    return len(ids_to_remove)

def discover_documents(base_dir="docs", exclude_dirs=["clients", "new", "processed"]):
    """Discover all documents in the base directory and its subdirectories."""
    all_documents = []
    
    # Walk through the directory structure
    for root, dirs, files in os.walk(base_dir):
        # Skip excluded directories
        if any(exclude_dir in root.split(os.sep) for exclude_dir in exclude_dirs):
            continue
            
        # Get topic from directory name
        dir_parts = root.split(os.sep)
        if len(dir_parts) > 1:
            topic = dir_parts[-1]  # Use the last part of the path as topic
        else:
            topic = "General"
            
        # Process files
        for file in files:
            if file.endswith(('.pdf', '.docx', '.doc', '.txt', '.rtf')):
                file_path = os.path.join(root, file)
                all_documents.append({
                    "path": file_path,
                    "topic": topic,
                    "is_new": False  # Default, will be updated based on last modified time
                })
    
    return all_documents

def detect_new_documents(documents, last_update_time=None):
    """Identify new or modified documents since last update."""
    if last_update_time is None:
        # If no last update time provided, try to read from a tracking file
        try:
            with open("last_update.txt", "r") as f:
                last_update_time = datetime.fromisoformat(f.read().strip())
        except:
            # If file doesn't exist or can't be read, use a default (e.g., 30 days ago)
            last_update_time = datetime.now() - timedelta(days=30)
    
    new_docs = []
    
    # Check each document's modification time
    for doc in documents:
        file_mtime = datetime.fromtimestamp(os.path.getmtime(doc["path"]))
        
        if file_mtime > last_update_time:
            doc["is_new"] = True
            new_docs.append(doc)
    
    # Update the last update time
    with open("last_update.txt", "w") as f:
        f.write(datetime.now().isoformat())
    
    return new_docs

def load_new_documents():
    from extract_text import extract_text_from_file
    from preprocess_text import preprocess_text
    from semantic_chunking import create_semantic_chunks
    """Combined function to discover and process new documents."""
    # First discover all documents
    all_documents = discover_documents()
    
    # Then identify new ones
    new_documents = detect_new_documents(all_documents)
    
    # Process the new documents
    new_chunks = []
    
    for doc in new_documents:
        try:
            # Extract text
            extracted_text = extract_text_from_file(doc["path"])
            
            # Preprocess text
            processed_text = preprocess_text(extracted_text)
            
            # Create semantic chunks
            chunks = create_semantic_chunks(processed_text)
            
            # Add metadata to chunks
            for chunk in chunks:
                new_chunks.append({
                    "text": chunk,
                    "metadata": {
                        "filename": doc["path"],
                        "file_type": os.path.splitext(doc["path"])[1],
                        "topic": doc["topic"],  # Use detected topic
                        "extracted_date": datetime.now().strftime("%Y-%m-%d"),
                        "source": "auto_discovery",
                        "ingestion_date": datetime.now().strftime("%Y-%m-%d")
                    }
                })
                
        except Exception as e:
            logging.error(f"❌ Error processing discovered file {doc['path']}: {e}")
    
    return new_chunks

def load_client_chunks(client_files_dir=None, client_id=None):
    """Loads client-specific documents for temporary embedding."""
    from extract_text import extract_text_from_file
    from preprocess_text import preprocess_text
    from semantic_chunking import create_semantic_chunks
    
    # Determine the client directory path
    if client_files_dir is None:
        client_files_dir = f"docs/clients/{client_id}" if client_id else "docs/clients"
    
    client_chunks = []
    
    # Check if directory exists
    if not os.path.exists(client_files_dir):
        logging.warning(f"⚠ Client files directory {client_files_dir} not found.")
        return client_chunks
    
    # Process each file in the directory
    for filename in os.listdir(client_files_dir):
        file_path = os.path.join(client_files_dir, filename)
        if os.path.isfile(file_path):
            try:
                # Extract text
                extracted_text = extract_text_from_file(file_path)
                
                # Preprocess text
                processed_text = preprocess_text(extracted_text)
                # Classify document
                document_classification = categorize_client_document(file_path, processed_text)
                # Create semantic chunks
                chunks = create_semantic_chunks(processed_text)
                
                # Add metadata to chunks - with client-specific metadata
                # Add metadata to chunks with custom fields
                for chunk in chunks:
                    client_chunks.append({
                        "text": chunk,
                        "metadata": {
                            "filename": file_path,
                            "file_type": os.path.splitext(file_path)[1],
                            "extracted_date": datetime.now().strftime("%Y-%m-%d"),
                            "source": f"client_{client_id}",
                            "client_id": client_id,
                            "confidential": True,
                            "client_priority": "high",
                            "expiry_date": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
                            "usage_restrictions": "internal_only",  # Custom field
                            "document_category": document_classification["category"],  # Custom function
                            "document_sensitivity": document_classification["sensitivity"]  # Custom classification
                        }
                    })
                
                logging.info(f"✅ Processed client file: {file_path}")
                
            except Exception as e:
                logging.error(f"❌ Error processing client file {file_path}: {e}")
    
    logging.info(f"✅ Loaded {len(client_chunks)} client-specific chunks for embedding.")
    return client_chunks

def categorize_client_document(filepath, text_content):
    """Categorize client documents by content and filename patterns."""
    lowercase_text = text_content.lower()
    
    # Determine document category
    if "financial" in lowercase_text or "budget" in lowercase_text:
        category = "financial"
    elif "technical" in lowercase_text or "specification" in lowercase_text:
        category = "technical"
    elif "marketing" in lowercase_text or "campaign" in lowercase_text:
        category = "marketing"
    else:
        category = "general"
    
    # Determine document sensitivity
    if "confidential" in lowercase_text or "private" in lowercase_text:
        sensitivity = "high"
    elif "internal" in lowercase_text:
        sensitivity = "medium"
    else:
        sensitivity = "low"
        
    return {
        "category": category,
        "sensitivity": sensitivity
    }


if __name__ == "__main__":
    import argparse
    import shutil
    
    parser = argparse.ArgumentParser(description="FAISS vector database management")
    parser.add_argument("--rebuild", action="store_true", help="Rebuild the entire index")
    parser.add_argument("--update", action="store_true", help="Update index with new data")
    parser.add_argument("--discover", action="store_true", help="Discover and process new documents")
    parser.add_argument("--add-client", help="Add client-specific data with given client ID")
    parser.add_argument("--client-dir", help="Directory containing client files")
    parser.add_argument("--remove-client", help="Remove client data with given client ID")
    
    args = parser.parse_args()
    
    if args.rebuild:
        # Full rebuild
        chunks = load_chunks(PROCESSED_FILE)
        store_embeddings_in_faiss(chunks)
    
    elif args.update:
        # Process files in the new directory
        new_chunks = load_new_documents()
        added = incremental_update(new_chunks)
        print(f"Added {added} new chunks to the index")
        
    elif args.discover:
        # Auto-discover new files in any subfolder
        new_chunks = load_new_documents()
        added = incremental_update(new_chunks)
        print(f"Discovered and added {added} chunks from new documents")
    
    elif args.add_client:
        # Add client data
        client_dir = args.client_dir or f"docs/clients/{args.add_client}"
        client_chunks = load_client_chunks(client_dir, args.add_client)
        client_ids = store_client_embeddings(client_chunks, args.add_client)
        print(f"Added {len(client_ids)} client chunks to the index")
    
    elif args.remove_client:
        # Remove client data
        removed = remove_client_data(args.remove_client)
        print(f"Removed {removed} chunks for client {args.remove_client}")
    
    else:
        # Default behavior
        chunks = load_chunks(PROCESSED_FILE)
        store_embeddings_in_faiss(chunks)