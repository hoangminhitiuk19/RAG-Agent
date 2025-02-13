import os
import fitz  # PyMuPDF for PDFs
import docx  # python-docx for Word documents
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# Define the path to your "docs" folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # Get current script directory
DOCS_FOLDER = os.path.join(BASE_DIR, "docs")  # Define the docs folder
OUTPUT_FILE = os.path.join(BASE_DIR, "extracted_text.txt")  # Save output in the main project folder

def extract_text_from_pdf(file_path):
    """Extracts text from a PDF file."""
    text = ""
    try:
        with fitz.open(file_path) as doc:
            for page in doc:
                text += page.get_text() + "\n"
        logging.info(f"Extracted text from PDF: {file_path}")
    except Exception as e:
        logging.error(f"Error extracting text from PDF {file_path}: {e}")
    return text

def extract_text_from_txt(file_path):
    """Extracts text from a TXT file."""
    text = ""
    try:
        with open(file_path, "r", encoding="utf-8") as file:
            text = file.read()
        logging.info(f"Extracted text from TXT: {file_path}")
    except Exception as e:
        logging.error(f"Error extracting text from TXT {file_path}: {e}")
    return text

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
    return text

def extract_text_from_files(folder_path, output_file):
    """Extracts text from all supported files in a folder and saves to a single text file."""
    supported_formats = {".pdf": extract_text_from_pdf, ".txt": extract_text_from_txt, ".docx": extract_text_from_docx}
    extracted_text = ""

    if not os.path.exists(folder_path):
        logging.error(f"Folder not found: {folder_path}")
        return
    
    for filename in os.listdir(folder_path):
        file_path = os.path.join(folder_path, filename)
        file_extension = os.path.splitext(filename)[1].lower()

        if file_extension in supported_formats:
            logging.info(f"Processing file: {filename}")
            extracted_text += supported_formats[file_extension](file_path) + "\n\n"
        else:
            logging.warning(f"Skipping unsupported file: {filename}")

    # Save extracted text to an output file
    with open(output_file, "w", encoding="utf-8") as out_file:
        out_file.write(extracted_text)
    
    logging.info(f"Extracted text saved to {output_file}")

# Example Usage
if __name__ == "__main__":
    extract_text_from_files(DOCS_FOLDER, OUTPUT_FILE)
