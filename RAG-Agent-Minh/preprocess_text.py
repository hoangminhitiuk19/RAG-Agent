import re
import nltk
from nltk.tokenize import sent_tokenize
import logging
import json

# Download required NLTK model
nltk.download("punkt")

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# Define input and output file paths
INPUT_FILE = "extracted_text.json"  # Extracted text in JSON format
OUTPUT_FILE = "processed_text.json"  # Processed text output

def clean_text(text):
    """Cleans extracted text by removing excessive spaces while preserving meaningful content."""
    text = re.sub(r"\s+", " ", text)  # Remove extra whitespaces
    text = text.strip()
    return text

def preprocess_text():
    """Reads extracted text JSON, cleans it, and saves the processed output."""
    try:
        with open(INPUT_FILE, "r", encoding="utf-8") as file:
            documents = json.load(file)

        if not documents:
            logging.error("No documents found in the input file.")
            return []

        logging.info(f"Preprocessing {len(documents)} documents...")
        processed_docs = []
        
        for doc in documents:
            text = doc["text"]
            doc_metadata = doc["metadata"]
            
            logging.info(f"Cleaning text from: {doc['filename']}")
            cleaned_text = clean_text(text)
            
            processed_docs.append({
                "filename": doc["filename"],
                "file_type": doc["file_type"],
                "metadata": doc_metadata,
                "text": cleaned_text
            })
        
        # Save the processed documents
        with open(OUTPUT_FILE, "w", encoding="utf-8") as out_file:
            json.dump(processed_docs, out_file, indent=4, ensure_ascii=False)
        
        logging.info(f"Processed {len(processed_docs)} documents saved to {OUTPUT_FILE}")
        return processed_docs
        
    except Exception as e:
        logging.error(f"Error processing text: {e}")
        return []

if __name__ == "__main__":
    preprocess_text()