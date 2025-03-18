import os
import json
import logging
import tiktoken
from advanced_chunking import optimized_chunking_pipeline

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# File paths
CHUNKS_FILE = "processed_chunks.json"
FIXED_CHUNKS_FILE = "processed_chunks_fixed.json"
MAX_TOKENS = 6000  # Keep this well below the 8192 limit to be safe

def fix_oversized_chunks():
    """Identifies and fixes chunks that exceed the token limit."""
    try:
        # Load existing chunks
        with open(CHUNKS_FILE, "r", encoding="utf-8") as f:
            chunks = json.load(f)
        
        logging.info(f"Loaded {len(chunks)} chunks for analysis")
        
        # Initialize the tokenizer
        encoding = tiktoken.get_encoding("cl100k_base")
        
        # Identify oversized chunks
        oversized_chunks = []
        normal_chunks = []
        
        for i, chunk in enumerate(chunks):
            text = chunk["text"]
            tokens = encoding.encode(text)
            token_count = len(tokens)
            
            if token_count > MAX_TOKENS:
                logging.warning(f"Chunk {i} has {token_count} tokens (exceeds {MAX_TOKENS})")
                oversized_chunks.append((i, chunk))
            else:
                normal_chunks.append(chunk)
        
        logging.info(f"Found {len(oversized_chunks)} oversized chunks out of {len(chunks)} total chunks")
        
        # Process oversized chunks
        fixed_chunks = []
        for i, chunk in oversized_chunks:
            logging.info(f"Re-chunking oversized chunk {i}")
            metadata = chunk["metadata"]
            text = chunk["text"]
            
            # Apply optimized chunking to large text
            rechunked = optimized_chunking_pipeline(text, metadata)
            fixed_chunks.extend(rechunked)
            logging.info(f"Split into {len(rechunked)} smaller chunks")
        
        # Combine normal and fixed chunks
        final_chunks = normal_chunks + fixed_chunks
        logging.info(f"Final chunk count: {len(final_chunks)}")
        
        # Create backup of original file
        backup_file = CHUNKS_FILE + ".bak"
        import shutil
        shutil.copy2(CHUNKS_FILE, backup_file)
        logging.info(f"Original chunks backed up to {backup_file}")
        
        # Write the fixed chunks
        with open(CHUNKS_FILE, "w", encoding="utf-8") as f:
            json.dump(final_chunks, f, indent=2, ensure_ascii=False)
        
        logging.info(f"Fixed chunks saved to {CHUNKS_FILE}")
        return len(fixed_chunks), len(normal_chunks)
        
    except Exception as e:
        logging.error(f"Error fixing chunks: {e}")
        return 0, 0

if __name__ == "__main__":
    fixed, normal = fix_oversized_chunks()
    print(f"Successfully processed {normal} normal chunks and {fixed} fixed chunks")