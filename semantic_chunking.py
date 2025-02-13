import os
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"  # Disable TensorFlow logs
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"   # Hide additional TensorFlow logs

import warnings
warnings.simplefilter(action="ignore", category=FutureWarning)  # Ignore future warnings

import nltk
import numpy as np
from sentence_transformers import SentenceTransformer
import logging

# Download NLTK tokenizer
nltk.download("punkt")


# Load Sentence Transformer Model
model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

# Input & Output Files
INPUT_FILE = "extracted_text.txt"
OUTPUT_FILE = "processed_chunks.txt"

# Threshold for splitting chunks
SIMILARITY_THRESHOLD = 0.7  # Adjust based on performance


def semantic_chunking(text):
    """Splits text into semantically meaningful chunks using Sentence Transformers."""

    # Tokenize into sentences
    sentences = nltk.sent_tokenize(text)

    # Compute embeddings for each sentence
    embeddings = model.encode(sentences, convert_to_numpy=True)

    chunks = []
    current_chunk = [sentences[0]]  # Start with the first sentence

    for i in range(1, len(sentences)):
        # Compute cosine similarity between consecutive sentences
        similarity = np.dot(embeddings[i - 1], embeddings[i]) / (
            np.linalg.norm(embeddings[i - 1]) * np.linalg.norm(embeddings[i])
        )

        if similarity < SIMILARITY_THRESHOLD:
            # If similarity drops below threshold, create a new chunk
            chunks.append(" ".join(current_chunk))
            current_chunk = [sentences[i]]
        else:
            # Otherwise, continue adding to current chunk
            current_chunk.append(sentences[i])

    # Add the last chunk
    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks


def process_text():
    """Reads input text, applies semantic chunking, and saves processed chunks."""
    try:
        with open(INPUT_FILE, "r", encoding="utf-8") as file:
            text = file.read()

        logging.info("Applying semantic chunking...")
        chunks = semantic_chunking(text)

        # Save to output file
        with open(OUTPUT_FILE, "w", encoding="utf-8") as file:
            file.write("\n\n".join(chunks))

        logging.info(f"Processed {len(chunks)} chunks saved to {OUTPUT_FILE}")

    except Exception as e:
        logging.error(f"Error processing text: {e}")


if __name__ == "__main__":
    process_text()
