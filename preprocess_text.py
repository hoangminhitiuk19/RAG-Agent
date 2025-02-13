import re
import nltk
from nltk.tokenize import sent_tokenize
import logging

# Download required NLTK model
nltk.download("punkt")

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# Define input and output file paths
INPUT_FILE = "extracted_text.txt"  # Extracted raw text
OUTPUT_FILE = "processed_chunks_of_normal_chunking.txt"  # Cleaned and chunked text

def clean_text(text):
    """Cleans extracted text by removing special characters, excessive spaces, and metadata."""
    text = re.sub(r"\s+", " ", text)  # Remove extra whitespaces
    text = re.sub(r"[^a-zA-Z0-9.,!?;:()'\-\s]", "", text)  # Remove special characters
    text = text.strip().lower()  # Convert to lowercase
    return text

def chunk_text(text, chunk_size=100):  # Lowered from 256 to 100 for better distribution
    """Splits text into chunks based on sentence boundaries and fixed size."""
    sentences = sent_tokenize(text)  # Split text into sentences
    chunks, current_chunk = [], []
    current_length = 0

    for sentence in sentences:
        sentence_length = len(sentence.split())

        # If adding sentence exceeds chunk size, save current chunk
        if current_length + sentence_length > chunk_size:
            chunks.append(" ".join(current_chunk))
            logging.info(f"Created chunk with {current_length} words.")  # Log chunk size
            current_chunk = []
            current_length = 0

        current_chunk.append(sentence)
        current_length += sentence_length

    # Add any remaining text
    if current_chunk:
        chunks.append(" ".join(current_chunk))
        logging.info(f"Created chunk with {current_length} words.")  # Log chunk size

    return chunks

def process_text(input_file, output_file):
    """Reads extracted text, cleans it, chunks it, and saves the processed output."""
    try:
        with open(input_file, "r", encoding="utf-8") as file:
            text = file.read()

        logging.info("Cleaning text...")
        cleaned_text = clean_text(text)

        logging.info("Chunking text into smaller sections...")
        chunks = chunk_text(cleaned_text, chunk_size=100)  # Adjusted chunk size for better distribution

        # Save cleaned and chunked text
        with open(output_file, "w", encoding="utf-8") as out_file:
            for chunk in chunks:
                out_file.write(chunk + "\n\n")

        logging.info(f"Processed text saved to {output_file}")
        logging.info(f"Total Chunks Created: {len(chunks)}")

    except Exception as e:
        logging.error(f"Error processing text: {e}")

# Run the processing
if __name__ == "__main__":
    process_text(INPUT_FILE, OUTPUT_FILE)
