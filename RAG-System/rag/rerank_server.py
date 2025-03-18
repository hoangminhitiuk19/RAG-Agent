import os
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'
from fastapi import FastAPI, Body, HTTPException
from pydantic import BaseModel
import uvicorn
from typing import List, Dict, Any, Optional


app = FastAPI(title="Reranking Service")

# Add CORS middleware
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Input model for reranking
class RerankRequest(BaseModel):
    query: str
    chunks: List[Dict[str, Any]]
    top_k: int = 5

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}

@app.post("/rerank")
async def rerank_chunks(request: RerankRequest):
    """Rerank chunks based on query relevance."""
    try:
        # Import here to ensure environment variable is set before importing
        from sentence_transformers import CrossEncoder
        
        query = request.query
        chunks = request.chunks
        top_k = min(request.top_k, len(chunks))
        
        print(f"Reranking {len(chunks)} chunks...")
        
        # Initialize cross-encoder model
        model = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')
        
        # Prepare pairs of query and chunks
        pairs = []
        for chunk in chunks:
            if isinstance(chunk, dict) and "text" in chunk:
                chunk_text = chunk["text"]
            else:
                chunk_text = str(chunk)
            pairs.append((query, chunk_text))
        
        # Score pairs using the model
        scores = model.predict(pairs)
        
        # Create result with scores and original indices
        results = []
        for i, (chunk, score) in enumerate(zip(chunks, scores)):
            result_item = {
                "original_idx": i,
                "score": float(score)
            }
            
            # Copy original chunk data if it's a dict
            if isinstance(chunk, dict):
                for key, value in chunk.items():
                    if key not in result_item:
                        result_item[key] = value
            
            results.append(result_item)
        
        # Sort by score (descending)
        results.sort(key=lambda x: x["score"], reverse=True)
        
        # Trim to top_k
        top_results = results[:top_k]
        
        # Log results
        print("Reranking complete. Top chunks:")
        for i, result in enumerate(top_results):
            print(f"  Rank {i+1}: score: {result['score']:.4f}")
        
        return {"reranked_chunks": top_results}
        
    except Exception as e:
        import traceback
        print(f"Error in reranking: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.environ.get("RERANK_PORT", 8081))
    host = os.environ.get("RERANK_HOST", "0.0.0.0")
    
    print(f"Starting reranking server on {host}:{port}")
    uvicorn.run(app, host=host, port=port)