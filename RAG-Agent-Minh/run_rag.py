# run_rag.py
import os
import argparse
import logging
import time
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

def run_process(command, description):
    """Run a process with logging."""
    logging.info(f"Starting: {description}")
    start_time = time.time()
    result = os.system(command)
    elapsed = time.time() - start_time
    
    if result == 0:
        logging.info(f"Completed: {description} in {elapsed:.2f} seconds")
    else:
        logging.error(f"Failed: {description} (error code: {result})")

def main():
    parser = argparse.ArgumentParser(description="RAG System Management")
    parser.add_argument("--rebuild", action="store_true", help="Rebuild the entire index")
    parser.add_argument("--update", action="store_true", help="Update index with new data")
    parser.add_argument("--add-client", help="Add client-specific data with given client ID")
    parser.add_argument("--client-dir", help="Directory containing client files")
    parser.add_argument("--remove-client", help="Remove client data with given client ID")
    parser.add_argument("--maintenance", action="store_true", help="Run system maintenance")
    parser.add_argument("--serve", action="store_true", help="Start the RAG UI")
    parser.add_argument("--weather-api", action="store_true", help="Use weather API in UI")
    parser.add_argument("--clear-cache", action="store_true", help="Clear embedding cache")
    parser.add_argument("--model", help="Specific model cache to clear")
    parser.add_argument("--no-rerank", action="store_true", help="Disable reranking in retrieval")
    # Add to run_rag.py argument parser
    parser.add_argument("--fix-chunks", action="store_true", help="Fix any oversized chunks in the processed chunks")
    args = parser.parse_args()
    
    if args.rebuild:
        run_process("python extract_text.py", "Extract text")
        run_process("python preprocess_text.py", "Preprocess text")
        run_process("python semantic_chunking.py --chunking-method advanced", "Create semantic chunks")
        run_process("python vectorize_store_faiss.py --rebuild", "Rebuild vector database")
        
    elif args.update:
        run_process("python vectorize_store_faiss.py --discover", "Discover and update with new documents")
        
    elif args.add_client:
        client_dir = args.client_dir or f"docs/clients/{args.add_client}"
        run_process(f"python vectorize_store_faiss.py --add-client {args.add_client} --client-dir {client_dir}",
                   f"Add client data for {args.add_client}")
        
    elif args.remove_client:
        run_process(f"python vectorize_store_faiss.py --remove-client {args.remove_client}",
                   f"Remove client data for {args.remove_client}")
        
    elif args.maintenance:
        run_process("python maintenance.py", "Run system maintenance")
        
    elif args.serve:
        rerank_flag = "" if args.no_rerank else "--use-reranking"
        if args.weather_api:
            run_process(f"streamlit run rag_ui.py {rerank_flag}", "Start RAG UI with weather API")
        else:
            run_process(f"streamlit run rag_ui_without_weather_api.py {rerank_flag}", "Start RAG UI without weather API")
    elif args.clear_cache:
        model = args.model
        if model:
            run_process(f"python -c \"from embedding_cache import clear_cache; clear_cache('{model}')\"", 
                    f"Clear cache for model {model}")
        else:
            run_process("python -c \"from embedding_cache import clear_cache; clear_cache()\"", 
                    "Clear all embedding caches")
    elif args.fix_chunks:
        run_process("python fix_chunks.py", "Fix oversized chunks")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()