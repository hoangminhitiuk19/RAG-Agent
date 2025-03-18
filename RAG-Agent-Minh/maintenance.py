# maintenance.py
import os
import json
import logging
import time
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

def perform_maintenance():
    """Perform routine maintenance on the RAG system."""
    
    # 1. Check for expired client data
    client_expiry_file = "client_expiry.json"
    if os.path.exists(client_expiry_file):
        try:
            with open(client_expiry_file, "r") as f:
                expiry_data = json.load(f)
                
            today = datetime.now().strftime("%Y-%m-%d")
            expired_clients = []
            
            for client_id, data in expiry_data.items():
                if data["expiry_date"] <= today:
                    # Run client removal
                    os.system(f"python vectorize_store_faiss.py --remove-client {client_id}")
                    expired_clients.append(client_id)
            
            if expired_clients:
                logging.info(f"Removed expired client data for: {', '.join(expired_clients)}")
        except Exception as e:
            logging.error(f"Error processing client expiry data: {e}")
    
    # 2. Check for new documents
    try:
        os.system("python vectorize_store_faiss.py --discover")
        logging.info("Checked for new documents")
    except Exception as e:
        logging.error(f"Error checking for new documents: {e}")
    
    # 3. Backup current vector database
    backup_dir = "backups"
    os.makedirs(backup_dir, exist_ok=True)
    
    today = datetime.now().strftime("%Y-%m-%d")
    try:
        os.system(f"cp faiss_index.bin {backup_dir}/faiss_index_{today}.bin")
        os.system(f"cp faiss_metadata.json {backup_dir}/faiss_metadata_{today}.json")
        logging.info(f"Created backup in {backup_dir}")
    except Exception as e:
        logging.error(f"Error creating backup: {e}")
    
    # 4. Optimize index (only for large indices)
    try:
        import faiss
        if os.path.exists("faiss_index.bin"):
            index = faiss.read_index("faiss_index.bin")
            if index.ntotal > 10000:  # Only optimize larger indices
                if hasattr(index, 'hnsw'):
                    logging.info("Running HNSW optimization...")
                    index.hnsw.optimize()
                    faiss.write_index(index, "faiss_index.bin")
    except Exception as e:
        logging.error(f"Error optimizing index: {e}")
        
    logging.info("Maintenance completed")

if __name__ == "__main__":
    perform_maintenance()