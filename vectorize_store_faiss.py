import os
import time
import openai
import faiss
import numpy as np
import logging
from dotenv import load_dotenv
from openai import OpenAIError, RateLimitError
# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# OpenAI API Key (Ensure you set this in your environment variables for security)
# Load environment variables from .env
load_dotenv()

# Get OpenAI API key
# openai.api_key = os.getenv("OPENAI_API_KEY")
openai.api_key = ""
if openai.api_key is None:
    print("⚠ ERROR: OpenAI API key not found. Ensure .env file is correctly configured.")
else:
    print("✅ OpenAI API key loaded successfully.")


PROCESSED_FILE = "processed_chunks.txt"
FAISS_INDEX_FILE = "faiss_index.bin"

def get_embedding(text, max_retries=5):
    """Generates OpenAI embedding with retries for rate limits."""
    retries = 0
    while retries < max_retries:
        try:
            response = openai.embeddings.create(
                model="text-embedding-ada-002",
                input=text
            )
            return response.data[0].embedding  # ✅ Correct attribute access

        except RateLimitError as e:  # ✅ Fixed error handling
            wait_time = 2 ** retries  # Exponential backoff
            logging.warning(f"⚠ Rate limit hit. Retrying in {wait_time} seconds...")
            time.sleep(wait_time)
            retries += 1
        
        except OpenAIError as e:  # ✅ Catch all OpenAI API errors
            logging.error(f"❌ OpenAI API error: {e}")
            break

        except Exception as e:  # ✅ Handle unexpected errors
            logging.error(f"❌ Unexpected error: {e}")
            break

    logging.error("❌ Failed to get embedding after multiple retries.")
    return None

def load_chunks(file_path):
    """Loads text chunks from the processed text file."""
    try:
        with open(file_path, "r", encoding="utf-8") as file:
            chunks = file.read().split("\n\n")  # Chunks are separated by double newlines
        logging.info(f"Loaded {len(chunks)} text chunks for embedding.")
        return chunks
    except Exception as e:
        logging.error(f"Error loading chunks from file: {e}")
        return []

def store_embeddings_in_faiss(chunks):
    """Generates embeddings and stores them in FAISS."""
    if not chunks:
        logging.error("No chunks found for embedding. Exiting...")
        return
    
    dimension = 1536  # OpenAI's embedding dimension
    index = faiss.IndexFlatL2(dimension)  # L2 norm (Euclidean) based FAISS index
    chunk_ids = []  # Track chunk IDs for mapping
    
    vectors = []
    for i, chunk in enumerate(chunks):
        embedding = get_embedding(chunk)
        if embedding:
            vectors.append(embedding)
            chunk_ids.append(i)

    # Convert list of vectors to numpy array
    if vectors:
        vectors_np = np.array(vectors, dtype=np.float32)
        index.add(vectors_np)  # Add vectors to FAISS index
        faiss.write_index(index, FAISS_INDEX_FILE)  # Save index to file
        logging.info(f"Stored {len(vectors)} embeddings in FAISS.")
    else:
        logging.error("No valid embeddings were generated. Exiting...")

# Run the FAISS vectorization process
if __name__ == "__main__":
    chunks = load_chunks(PROCESSED_FILE)
    store_embeddings_in_faiss(chunks)
