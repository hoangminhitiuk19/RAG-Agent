import os
import fitz  # PyMuPDF for PDFs
import docx  # python-docx for Word documents
import logging
import json
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_FOLDER = os.path.join(BASE_DIR, "docs")
OUTPUT_FILE = os.path.join(BASE_DIR, "extracted_text.json")  # Save output as JSON

def extract_text_from_pdf(file_path):
    """Extracts text from a PDF file along with metadata."""
    text = ""
    metadata = {}
    try:
        with fitz.open(file_path) as doc:
            metadata = doc.metadata  # Extract metadata from PDF
            for page in doc:
                text += page.get_text() + "\n"
        logging.info(f"Extracted text from PDF: {file_path}")
    except Exception as e:
        logging.error(f"Error extracting text from PDF {file_path}: {e}")
    return text, metadata

def extract_text_from_txt(file_path):
    """Extracts text from a TXT file."""
    text = ""
    try:
        with open(file_path, "r", encoding="utf-8") as file:
            text = file.read()
        logging.info(f"Extracted text from TXT: {file_path}")
    except Exception as e:
        logging.error(f"Error extracting text from TXT {file_path}: {e}")
    return text, {}

def extract_text_from_docx(file_path):
    """Extracts text from a DOCX (Word) file."""
    text = ""
    try:
        doc = docx.Document(file_path)
        for para in doc.paragraphs:
            text += para.text + "\n"
        logging.info(f"Extracted text from DOCX: {file_path}")
    except Exception as e:
        logging.error(f"Error extracting text from DOCX {file_path}: {e}")
    return text, {}

def process_directory(directory, topic="General"):
    """Process all files in a directory, including subdirectories."""
    supported_formats = {
        ".pdf": extract_text_from_pdf,
        ".txt": extract_text_from_txt,
        ".docx": extract_text_from_docx,
    }
    
    extracted_data = []
    
    for root, dirs, files in os.walk(directory):
        for filename in files:
            file_path = os.path.join(root, filename)
            file_extension = os.path.splitext(filename)[1].lower()
            
            # Determine topic based on parent directory
            current_topic = os.path.basename(os.path.dirname(file_path))
            if current_topic == "docs":
                current_topic = topic
                
            if file_extension in supported_formats:
                logging.info(f"Processing file: {filename} (Topic: {current_topic})")
                text, metadata = supported_formats[file_extension](file_path)
                
                # Skip if extraction failed (empty text)
                if not text.strip():
                    logging.warning(f"Skipping {filename}: No text extracted")
                    continue
                    
                # Extract metadata manually if not available
                if not metadata:
                    metadata = {}
                
                # Add standard metadata
                metadata["filename"] = filename
                metadata["file_type"] = file_extension
                metadata["extracted_date"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                metadata["source"] = "document_extraction"
                metadata["topic"] = current_topic
                
                extracted_data.append({
                    "filename": file_path,
                    "file_type": file_extension,
                    "metadata": metadata,
                    "text": text
                })
            else:
                if file_extension:  # Only log warnings for actual files, not directories
                    logging.warning(f"Skipping unsupported file: {filename}")
    
    return extracted_data

def extract_text_from_files():
    """Extract text from all documents in the docs folder and its subfolders."""
    logging.info(f"Starting document extraction from {DOCS_FOLDER}...")
    
    # Process all documents in the docs folder and its subfolders
    extracted_data = process_directory(DOCS_FOLDER)
    
    # Save extracted text & metadata to JSON
    with open(OUTPUT_FILE, "w", encoding="utf-8") as out_file:
        json.dump(extracted_data, out_file, indent=4, ensure_ascii=False)
    
    logging.info(f"Extracted {len(extracted_data)} documents, saved to {OUTPUT_FILE}")
    return len(extracted_data)

def ensure_manageable_document_size(text, max_chars=100000):
    """Ensures documents don't exceed a reasonable size."""
    if len(text) > max_chars:
        logging.warning(f"Document exceeds {max_chars} characters. Splitting into sections...")
        
        # Try to split at logical boundaries like double newlines
        sections = text.split("\n\n")
        
        # If we have good section breaks
        if len(sections) > 1:
            processed_sections = []
            current_section = []
            current_length = 0
            
            for section in sections:
                if current_length + len(section) < max_chars:
                    current_section.append(section)
                    current_length += len(section) + 2  # +2 for the newlines we'll add back
                else:
                    # Store current section and start a new one
                    processed_sections.append("\n\n".join(current_section))
                    current_section = [section]
                    current_length = len(section)
            
            # Don't forget the last section
            if current_section:
                processed_sections.append("\n\n".join(current_section))
                
            return processed_sections
        else:
            # If no good section breaks, just truncate
            return [text[:max_chars]]
    
    return [text]  # Return as list for consistency
if __name__ == "__main__":
    extract_text_from_files()