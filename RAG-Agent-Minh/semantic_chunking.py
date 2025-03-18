import os
import nltk
import numpy as np
import json
from sentence_transformers import SentenceTransformer
import logging
import argparse
from advanced_chunking import optimized_chunking_pipeline

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# Disable TensorFlow unnecessary logs
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

# Download NLTK tokenizer
nltk.download("punkt", quiet=True)

# Load Sentence Transformer Model
model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

# Input & Output Files
INPUT_FILE = "processed_text.json"
OUTPUT_FILE = "processed_chunks.json"
SIMILARITY_LOG_FILE = "similarity_log.txt"

# Threshold for splitting chunks
SIMILARITY_THRESHOLD = 0.7

def semantic_chunking(text, metadata, use_advanced_pipeline=True):
    """Splits text into semantically meaningful chunks using either advanced pipeline or standard approach."""
    
    # If advanced pipeline is enabled, use it
    if use_advanced_pipeline:
        logging.info(f"Using advanced multi-stage chunking pipeline for {metadata.get('filename', 'Unknown')}")
        return optimized_chunking_pipeline(text, metadata)
    
    # Otherwise, use the original semantic chunking method
    logging.info(f"Using standard semantic chunking for {metadata.get('filename', 'Unknown')}")
    sentences = nltk.sent_tokenize(text)

    # Compute embeddings for each sentence
    embeddings = model.encode(sentences, convert_to_numpy=True)

    chunks = []
    current_chunk = [sentences[0]]
    similarity_scores = []
    log_entries = []

    for i in range(1, len(sentences)):
        similarity = np.dot(embeddings[i - 1], embeddings[i]) / (
            np.linalg.norm(embeddings[i - 1]) * np.linalg.norm(embeddings[i])
        )
        similarity_scores.append(similarity)
        log_entry = f"Sentence {i} -> {i+1}: Similarity = {similarity:.2f}"
        log_entries.append(log_entry)

        if similarity < SIMILARITY_THRESHOLD:
            chunks.append({
                "text": " ".join(current_chunk),
                "metadata": metadata  # Attach metadata to chunk
            })
            current_chunk = [sentences[i]]
            logging.info(f"New chunk started at sentence {i+1} due to similarity {similarity:.2f}")
            log_entries.append("--- New Chunk Started ---")
        else:
            current_chunk.append(sentences[i])

    if current_chunk:
        chunks.append({
            "text": " ".join(current_chunk),
            "metadata": metadata
        })

    with open(SIMILARITY_LOG_FILE, "w", encoding="utf-8") as log_file:
        log_file.write("\n".join(log_entries))

    return chunks

def process_text(use_advanced_pipeline=True):
    """Reads input JSON, applies semantic chunking, and saves processed chunks as JSON."""
    try:
        with open(INPUT_FILE, "r", encoding="utf-8") as file:
            documents = json.load(file)

        chunking_method = "advanced multi-stage pipeline" if use_advanced_pipeline else "standard semantic chunking"
        logging.info(f"Applying {chunking_method}...")

        all_chunks = []
        for doc in documents:
            text = doc["text"]
            metadata = {
                "filename": doc["filename"],
                "file_type": doc["file_type"],
                "extracted_date": doc["metadata"].get("extracted_date", "Unknown"),
                "source": doc["metadata"].get("source", "Unknown"),
            }
            chunks = semantic_chunking(text, metadata, use_advanced_pipeline)
            all_chunks.extend(chunks)

        with open(OUTPUT_FILE, "w", encoding="utf-8") as file:
            json.dump(all_chunks, file, indent=4, ensure_ascii=False)

        logging.info(f"Processed {len(all_chunks)} chunks saved to {OUTPUT_FILE}")

    except Exception as e:
        logging.error(f"Error processing text: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process text documents and create semantic chunks")
    parser.add_argument("--chunking-method", choices=["standard", "advanced"], 
                        default="advanced", 
                        help="Chunking method to use (standard = similarity-based, advanced = multi-stage pipeline)")
    
    args = parser.parse_args()
    use_advanced_pipeline = (args.chunking_method == "advanced")
    
    # Process text with the selected chunking method
    process_text(use_advanced_pipeline)