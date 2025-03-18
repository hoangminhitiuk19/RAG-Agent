# rag_server.py
import os
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'
from fastapi import FastAPI, Body, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import faiss
import json
import numpy as np
import openai
import os
from dotenv import load_dotenv
import requests
import sys
from io import BytesIO
import datetime
import tiktoken
import numpy as np
import requests
import time
from fastapi.responses import StreamingResponse

# Determine the base directory for proper path resolution
if __name__ == "__main__":
    # When run directly, use the directory of this script
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
else:
    # When imported, use the current working directory (project root)
    BASE_DIR = os.getcwd()

# Setup proper paths
DATA_DIR = os.path.join(BASE_DIR, 'data')
if not os.path.exists(DATA_DIR):
    # Try alternative path for when run from project root
    DATA_DIR = os.path.join(BASE_DIR, 'rag', 'data')

# Load environment variables
load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")
WEATHER_API_KEY = os.getenv("WEATHER_API_KEY")
WEATHER_API_URL = "http://api.openweathermap.org/data/2.5/weather"

# Constants with proper path handling
FAISS_INDEX_PATH = os.path.join(DATA_DIR, 'faiss_index.bin')
CHUNKS_PATH = os.path.join(DATA_DIR, 'processed_chunks.json')
METADATA_PATH = os.path.join(DATA_DIR, 'faiss_metadata.json')

# Verify paths exist - print for debugging
print(f"Base directory: {BASE_DIR}")
print(f"Data directory: {DATA_DIR}")
print(f"FAISS index path: {FAISS_INDEX_PATH} (exists: {os.path.exists(FAISS_INDEX_PATH)})")
print(f"Chunks path: {CHUNKS_PATH} (exists: {os.path.exists(CHUNKS_PATH)})")
print(f"Metadata path: {METADATA_PATH} (exists: {os.path.exists(METADATA_PATH)})")

app = FastAPI(title="RegenX RAG API")
# Update CORS settings for Cloud Run
allowed_origins = os.environ.get('ALLOWED_ORIGINS', '*')
if allowed_origins != '*':
    allowed_origins = allowed_origins.split(',')
else:
    allowed_origins = ['*']  # Development default

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    try:
        # Check if FAISS index is loaded
        if not hasattr(app.state, 'index') or app.state.index is None:
            return {"status": "unhealthy", "reason": "FAISS index not loaded"}
        
        # Check OpenAI API
        openai_status = "available" 
        if not os.environ.get("OPENAI_API_KEY"):
            openai_status = "missing API key"
            
        return {
            "status": "healthy",
            "components": {
                "faiss_index": "loaded",
                "openai_api": openai_status,
            },
            "index_size": len(app.state.chunks) if hasattr(app.state, 'chunks') else 0
        }
    except Exception as e:
        print(f"Health check error: {e}")
        return {"status": "unhealthy", "error": str(e)}
# Load index and data at startup
try:
    print(f"Loading FAISS index from {FAISS_INDEX_PATH}")
    faiss_index = faiss.read_index(FAISS_INDEX_PATH)
    
    print(f"Loading chunks from {CHUNKS_PATH}")
    with open(CHUNKS_PATH, "r", encoding="utf-8") as f:
        chunks = json.load(f)
    
    print(f"Loading metadata from {METADATA_PATH}")
    with open(METADATA_PATH, "r", encoding="utf-8") as f:
        metadata_mapping = json.load(f)
    
    print("RAG system loaded successfully")
    
    # Store in app state for access in health check
    app.state.index = faiss_index
    app.state.chunks = chunks
    app.state.metadata = metadata_mapping
    
except Exception as e:
    print(f"Error loading RAG components: {e}")
    # Initialize empty placeholders
    faiss_index = None
    chunks = []
    metadata_mapping = {}

# Input models for API endpoints
class QueryRequest(BaseModel):
    query: str
    farm_data: Optional[Dict[str, Any]] = None
    crop_data: Optional[List[Dict[str, Any]]] = None
    weather_data: Optional[Dict[str, Any]] = None
    conversation_history: Optional[List[Dict[str, str]]] = None
    use_reranking: Optional[bool] = False
    top_k: Optional[int] = 5
    
    class Config:
        # Allow for extra fields to be received without validation errors
        extra = "ignore"

class ImageDiagnosisRequest(BaseModel):
    diagnosis: str
    farm_location: Optional[str] = None


def hybrid_retrieval(query, chunks, top_k=5, use_reranking=False):
    """Combine standard vector search with reranking for better results."""
    print(f"Using reranking: {use_reranking}, chunks: {len(chunks)}")
    
    if not use_reranking or len(chunks) <= 1:
        print("Skipping reranking - either disabled or not enough chunks")
        return chunks[:top_k]
        
    # If we have enough chunks, get more than needed for reranking
    retrieved_count = min(top_k * 3, len(chunks))
    candidates = chunks[:retrieved_count]
    
    # First try the external reranking service
    try:
        rerank_url = "http://localhost:8081/rerank"
        
        # Check if rerank service is available
        try:
            health_check = requests.get("http://localhost:8081/health", timeout=2)
            if health_check.status_code != 200:
                raise Exception("Reranking service health check failed")
        except Exception as e:
            print(f"Reranking service health check failed: {e}")
            # Fall back to local reranking
            return rerank_chunks(query, candidates, top_k)
        
        print(f"Calling reranking service with {len(candidates)} chunks")
        
        # Create a simplified version of the chunks for the reranking service
        # This avoids potential serialization issues
        serializable_chunks = []
        for i, chunk in enumerate(candidates):
            if isinstance(chunk, dict):
                # Copy only necessary fields to avoid serialization issues
                simplified_chunk = {
                    "text": chunk.get("text", ""),
                    "original_idx": chunk.get("original_idx", i)
                }
                # Add metadata if present, but ensure it's serializable
                if "metadata" in chunk and isinstance(chunk["metadata"], dict):
                    simplified_chunk["metadata"] = {
                        k: v for k, v in chunk["metadata"].items() 
                        if isinstance(v, (str, int, float, bool, list, dict)) or v is None
                    }
                serializable_chunks.append(simplified_chunk)
            else:
                # If it's just a string
                serializable_chunks.append({"text": str(chunk), "original_idx": i})
        
        payload = {
            "query": query,
            "chunks": serializable_chunks,
            "top_k": top_k
        }
        
        # Make the request to the reranking service
        try:
            response = requests.post(
                rerank_url,
                json=payload,
                timeout=30  # 30 second timeout
            )
        except requests.exceptions.Timeout:
            print("Reranking service timed out")
            return rerank_chunks(query, candidates, top_k)
        except requests.exceptions.RequestException as e:
            print(f"Request error: {e}")
            return rerank_chunks(query, candidates, top_k)
        
        print(f"Reranking response status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            if "reranked_chunks" in result and len(result["reranked_chunks"]) > 0:
                print(f"Got {len(result['reranked_chunks'])} reranked chunks")
                
                # Map the reranked chunks back to the original chunks
                reranked_results = []
                for item in result["reranked_chunks"]:
                    if "original_idx" in item:
                        idx = item["original_idx"]
                        if 0 <= idx < len(candidates):
                            reranked_results.append(candidates[idx])
                
                if len(reranked_results) > 0:
                    return reranked_results
                
            print("No valid reranked chunks in response, falling back")
        else:
            print(f"Reranking service error: {response.status_code} - {response.text}")
            
        # If external reranking failed, try local reranking
        print("Falling back to local reranking")
        return rerank_chunks(query, candidates, top_k)
        
    except Exception as e:
        print(f"Error calling reranking service: {e}")
        import traceback
        print(traceback.format_exc())
        
        # Fall back to local reranking function
        print("Falling back to local reranking after error")
        return rerank_chunks(query, candidates, top_k)



@app.post("/stream")
async def stream_rag(request: QueryRequest):
    """Streaming version of the RAG query endpoint."""
    async def generate_stream():
        try:
            # Most of the logic from query_rag
            if faiss_index is None:
                yield json.dumps({"error": "FAISS index not loaded"}) + "\n"
                return
                
            # Get retrieved chunks using the same logic as query_rag
            indices, distances = hybrid_vector_bm25_search(request.query, top_k=5)
            use_reranking = request.use_reranking if hasattr(request, 'use_reranking') else True
            retrieved_chunks = []
            retrieved_metadata = []
            
            for idx in indices:
                if idx >= 0 and idx < len(chunks):
                    retrieved_chunks.append(chunks[idx]['text'])
                    retrieved_metadata.append(metadata_mapping.get(str(idx), {}))
            
            if use_reranking and len(retrieved_chunks) > 1:
                print("Applying reranking to search results...")
                
                # Create chunk objects with metadata for reranking
                rerank_input = []
                for i, (text, meta) in enumerate(zip(retrieved_chunks, retrieved_metadata)):
                    rerank_input.append({
                        "text": text,
                        "original_idx": i,
                        "metadata": meta
                    })
                
                # Get reranked results
                reranked = hybrid_retrieval(request.query, rerank_input, top_k)
                
                # Extract reranked chunks and metadata
                if len(reranked) > 0:
                    new_chunks = []
                    new_metadata = []
                    
                    for item in reranked:
                        if isinstance(item, dict):
                            if "text" in item and "original_idx" in item:
                                # This is from the external reranking service
                                idx = item["original_idx"]
                                if idx < len(retrieved_chunks):
                                    new_chunks.append(retrieved_chunks[idx])
                                    new_metadata.append(retrieved_metadata[idx])
                            elif "original_idx" in item:
                                # This is from the hybrid_retrieval function directly
                                idx = item["original_idx"]
                                if idx < len(retrieved_chunks):
                                    new_chunks.append(retrieved_chunks[idx])
                                    new_metadata.append(retrieved_metadata[idx])
                        else:
                            # If reranked is just returning the text directly
                            new_chunks.append(item)
                            
                            # Try to match it to original chunks to get metadata
                            for i, original in enumerate(retrieved_chunks):
                                if original == item:
                                    new_metadata.append(retrieved_metadata[i])
                                    break
                            else:
                                # If no match found, use empty metadata
                                new_metadata.append({})
                    
                    # Replace with reranked results if we got any
                    if len(new_chunks) > 0:
                        retrieved_chunks = new_chunks
                        retrieved_metadata = new_metadata
                        print(f"Using {len(retrieved_chunks)} reranked chunks")
                    else:
                        print("No valid reranked chunks, using original")
                else:
                    print("Reranking returned no results, using original chunks")
                    
            # Limit to top_k
            retrieved_chunks = retrieved_chunks[:top_k]
            retrieved_metadata = retrieved_metadata[:top_k]
                
            # Token counting for GPT-4
            encoding = tiktoken.get_encoding("cl100k_base")
            token_count = 0
            
            # Prepare farm context
            farm_context = ""
            if request.farm_data:
                location = request.farm_data.get("province") or request.farm_data.get("city") or request.farm_data.get("municipality") or "Unknown"
                farm_context += f"Farm location: {location}\n"
                
                if request.farm_data.get("farm_size"):
                    units = request.farm_data.get("farm_size_unit") or "units"
                    farm_context += f"Farm size: {request.farm_data.get('farm_size')} {units}\n"
            
            # Add crop details if available
            if request.crop_data:
                crop_details = []
                for crop in request.crop_data:
                    crop_name = "Unknown crop"
                    if "crop" in crop and crop["crop"] and "name" in crop["crop"]:
                        crop_name = f"{crop['crop']['name']} {crop['crop'].get('varietal', '')}"
                    
                    count = crop.get("crop_count", "Unknown")
                    year = crop.get("planted_year", "Unknown")
                    crop_details.append(f"{count} {crop_name} trees planted in {year}")
                
                farm_context += f"Crops: {'; '.join(crop_details)}\n"
            
            # Weather data from request or fetch if location provided
            weather_section = ""
            if request.weather_data:
                weather_info = request.weather_data
            elif request.farm_data and (request.farm_data.get("city") or request.farm_data.get("municipality")):
                location = request.farm_data.get("city") or request.farm_data.get("municipality")
                weather_info = get_weather(location)
            else:
                weather_info = None
                
            if weather_info:
                weather_section = (
                    f"Weather Conditions:\n"
                    f"- Temperature: {weather_info.get('temperature', 'N/A')}°C\n"
                    f"- Humidity: {weather_info.get('humidity', 'N/A')}%\n"
                    f"- Condition: {weather_info.get('condition', 'N/A')}"
                )
            # Get conversation history if provided
            conversation_history = request.conversation_history if hasattr(request, 'conversation_history') else []
            
            # Create the system message
            system_message = "You are an agricultural assistant specializing in coffee farming and regenerative agriculture."
            token_count += len(encoding.encode(system_message))

            # Format conversation history for the prompt
            history_text = ""
            if conversation_history and len(conversation_history) > 0:
                history_text = "\nPrevious conversation:\n"
                for i, msg in enumerate(conversation_history):
                    role = "User" if msg.get("role") == "user" else "Assistant"
                    history_text += f"{role}: {msg.get('content')}\n"

            context = ""
            for i, (chunk, metadata) in enumerate(zip(retrieved_chunks[:top_k], retrieved_metadata[:top_k])):
                # Add chunk with source info
                chunk_text = f"\n\nSource {i+1}: {metadata.get('filename', 'Unknown')}\n{chunk}"
                chunk_tokens = len(encoding.encode(chunk_text))
                
                # Check if adding this chunk would exceed token limit
                if token_count + chunk_tokens > 6000:  # Safe limit for GPT-4
                    context += "\n\n[Note: Additional relevant content was found but truncated to stay within limits]"
                    break
                    
                context += chunk_text
                token_count += chunk_tokens
            
            # Stream the completion
            yield json.dumps({"type": "start", "message": "Starting generation..."}) + "\n"
            
            # Create messages for OpenAI
            messages = [
                {"role": "system", "content": "You are an agricultural assistant specializing in coffee farming."}
            ]
            
            # Add conversation history if provided
            if hasattr(request, 'conversation_history') and request.conversation_history:
                for msg in request.conversation_history:
                    if msg.get("role") in ["user", "assistant"]:
                        messages.append({"role": msg.get("role"), "content": msg.get("content")})
            
            # Add the current query with context
            prompt = f"""Please answer the following question about coffee farming based on the provided context.

Question: {request.query}

{farm_context if farm_context else ""}

{weather_section if weather_section else ""}

Context from knowledge base:
{context}

Provide a detailed, specific answer that addresses the question directly."""

            messages.append({"role": "user", "content": prompt})
            
            # Stream the response
            completion = openai.chat.completions.create(
                model="gpt-4",
                messages=messages,
                temperature=0.5,
                stream=True  # Enable streaming
            )
            
            # Stream each chunk as it's generated
            collected_content = ""
            for chunk in completion:
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    collected_content += content
                    yield json.dumps({"type": "chunk", "content": content}) + "\n"
            
            # Send sources at the end
            sources = []
            for i, (chunk, metadata) in enumerate(zip(retrieved_chunks, retrieved_metadata)):
                sources.append({
                    "content": chunk,
                    "metadata": metadata,
                    "rank": i + 1
                })
                
            yield json.dumps({"type": "sources", "sources": sources}) + "\n"
            yield json.dumps({"type": "done", "full_content": collected_content}) + "\n"
                
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            print(f"Streaming error: {e}")
            print(f"Full traceback: {error_trace}")
            yield json.dumps({"type": "error", "error": str(e)}) + "\n"
    
    # Return as a streaming response
    return StreamingResponse(generate_stream(), media_type="application/json")

def rerank_chunks(query, chunks, top_k=5):
    """Rerank chunks using query relevance to improve retrieval quality."""
    try:
        # Ensure required packages are installed
        try:
            from sentence_transformers import CrossEncoder
        except ImportError:
            import subprocess
            import sys
            print("Installing sentence-transformers...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", "sentence-transformers"])
            from sentence_transformers import CrossEncoder
        
        print(f"Reranking {len(chunks)} chunks...")
        
        # Initialize cross-encoder model
        model = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')
        
        # Prepare pairs of query and chunks
        pairs = []
        for chunk in chunks:
            if isinstance(chunk, dict) and "text" in chunk:
                chunk_text = chunk["text"]
            else:
                chunk_text = chunk
            pairs.append((query, chunk_text))
        
        # Score pairs using the model
        scores = model.predict(pairs)
        
        # Sort chunks by score
        scored_chunks = list(zip(chunks, scores))
        scored_chunks.sort(key=lambda x: x[1], reverse=True)
        
        # Log reranking statistics
        print(f"Reranking complete. Scores of top chunks:")
        for i, (chunk, score) in enumerate(scored_chunks[:top_k]):
            print(f"  Rank {i+1}: score: {score:.4f}")
        
        # Return top_k chunks
        reranked_chunks = [chunk for chunk, _ in scored_chunks[:top_k]]
        return reranked_chunks
        
    except Exception as e:
        print(f"Error during reranking: {e}")
        # Fall back to original ranking if reranking fails
        print("Falling back to original ranking due to reranking error")
        return chunks[:top_k]
    
def get_embedding(text):
    """Generates an embedding for a given query using OpenAI."""
    response = openai.embeddings.create(
        model="text-embedding-3-large",
        input=text,
        dimensions=3072,  # Match Qdrant's vector dimensions
        encoding_format="float"  # Ensure consistent format
    )
    return np.array(response.data[0].embedding, dtype=np.float32)

def hybrid_vector_bm25_search(query, top_k=5):
    """Combines vector search with keyword matching for better results."""
    # Vector search first
    indices, distances = search_faiss(query, top_k=top_k*2)
    
    # Extract chunks for keyword matching
    retrieved_chunks = [chunks[idx]["text"] for idx in indices]
    
    # Simple BM25-style scoring (keyword matching)
    # Split query into keywords
    keywords = set(query.lower().split())
    
    # Score each chunk by keyword matches
    scored_chunks = []
    for i, chunk in enumerate(retrieved_chunks):
        chunk_text = chunk.lower()
        keyword_score = sum(1 for keyword in keywords if keyword in chunk_text)
        # Combine with vector similarity
        combined_score = keyword_score * 0.3 + (1 - distances[i]) * 0.7
        scored_chunks.append((indices[i], chunk, combined_score))
    
    # Sort by combined score
    scored_chunks.sort(key=lambda x: x[2], reverse=True)
    
    # Return top_k results
    return [item[0] for item in scored_chunks[:top_k]], [1 - item[2] for item in scored_chunks[:top_k]]

def search_faiss(query, top_k=3):
    """Searches FAISS index for the most relevant chunks."""
    if faiss_index is None:
        raise HTTPException(status_code=500, detail="FAISS index not loaded")
    
    query_embedding = get_embedding(query)
    query_embedding = np.expand_dims(query_embedding, axis=0)  # Reshape for FAISS
    distances, indices = faiss_index.search(query_embedding, top_k)
    
    # Convert numpy int64 to Python int for JSON serialization
    indices = [int(idx) for idx in indices[0]]
    distances = [float(dist) for dist in distances[0]]
    
    return indices, distances

def get_weather(city):
    """Fetches weather data for a given city using OpenWeatherMap API."""
    if not city:
        return None

    params = {
        "q": city,
        "appid": WEATHER_API_KEY,
        "units": "metric"
    }
    response = requests.get(WEATHER_API_URL, params=params)

    if response.status_code == 200:
        data = response.json()
        return {
            "city": data["name"],
            "country": data["sys"]["country"],
            "temperature": data["main"]["temp"],
            "humidity": data["main"]["humidity"],
            "condition": data["weather"][0]["description"]
        }
    else:
        return None

@app.get("/test")
async def test_endpoint():
    return {
        "message": "Test endpoint is working!",
        "timestamp": str(datetime.datetime.now())
    }

@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "healthy", 
        "faiss_index_loaded": faiss_index is not None,
        "chunks_loaded": len(chunks) > 0
    }


@app.get("/test-search")
async def test_search():
    try:
        query = "coffee leaves yellow"
        indices, distances = search_faiss(query, top_k=2)
        return {
            "query": query,
            "indices": indices,
            "distances": distances,
            "chunks": [chunks[idx]["text"][:100] + "..." for idx in indices]  # Return first 100 chars of each chunk
        }
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error in test-search: {e}")
        print(f"Full traceback: {error_trace}")
        return {"error": str(e)}
    
@app.post("/query")
async def query_rag(request: QueryRequest):
    """Main RAG query endpoint for text-based queries."""
    try:
        print(f"Received query: {request.query[:50]}...")
        if faiss_index is None:
            return {"error": "FAISS index not loaded", "fallback_response": "I'm sorry, but my knowledge base is not available at the moment."}
        
        # Use hybrid search instead of direct FAISS search
        use_reranking = request.use_reranking if hasattr(request, 'use_reranking') else True
        top_k = request.top_k if hasattr(request, 'top_k') else 5
        search_k = top_k * 3 if use_reranking else top_k

        print(f"Performing hybrid search with top_k={search_k}")
        
        # Use the hybrid search function instead of direct FAISS search
        indices, distances = hybrid_vector_bm25_search(request.query, top_k=search_k)
        
        retrieved_chunks = []
        retrieved_metadata = []
        
        # Extract chunks and metadata
        for idx in indices:
            if idx >= 0 and idx < len(chunks):
                retrieved_chunks.append(chunks[idx]['text'])
                retrieved_metadata.append(metadata_mapping.get(str(idx), {}))
        
        print(f"Retrieved {len(retrieved_chunks)} chunks using hybrid search")
        
        
        if use_reranking and len(retrieved_chunks) > 1:
            print("Applying reranking to search results...")
            
            # Create chunk objects with metadata for reranking
            rerank_input = []
            for i, (text, meta) in enumerate(zip(retrieved_chunks, retrieved_metadata)):
                rerank_input.append({
                    "text": text,
                    "original_idx": i,
                    "metadata": meta
                })
            
            # Get reranked results
            reranked = hybrid_retrieval(request.query, rerank_input, top_k)
            
            # Extract reranked chunks and metadata
            if len(reranked) > 0:
                new_chunks = []
                new_metadata = []
                
                for item in reranked:
                    if isinstance(item, dict):
                        if "text" in item and "original_idx" in item:
                            # This is from the external reranking service
                            idx = item["original_idx"]
                            if idx < len(retrieved_chunks):
                                new_chunks.append(retrieved_chunks[idx])
                                new_metadata.append(retrieved_metadata[idx])
                        elif "original_idx" in item:
                            # This is from the hybrid_retrieval function directly
                            idx = item["original_idx"]
                            if idx < len(retrieved_chunks):
                                new_chunks.append(retrieved_chunks[idx])
                                new_metadata.append(retrieved_metadata[idx])
                    else:
                        # If reranked is just returning the text directly
                        new_chunks.append(item)
                        
                        # Try to match it to original chunks to get metadata
                        for i, original in enumerate(retrieved_chunks):
                            if original == item:
                                new_metadata.append(retrieved_metadata[i])
                                break
                        else:
                            # If no match found, use empty metadata
                            new_metadata.append({})
                
                # Replace with reranked results if we got any
                if len(new_chunks) > 0:
                    retrieved_chunks = new_chunks
                    retrieved_metadata = new_metadata
                    print(f"Using {len(retrieved_chunks)} reranked chunks")
                else:
                    print("No valid reranked chunks, using original")
            else:
                print("Reranking returned no results, using original chunks")
                
        # Limit to top_k
        retrieved_chunks = retrieved_chunks[:top_k]
        retrieved_metadata = retrieved_metadata[:top_k]
            
        # Token counting for GPT-4
        encoding = tiktoken.get_encoding("cl100k_base")
        token_count = 0
        
        # Prepare farm context
        farm_context = ""
        if request.farm_data:
            location = request.farm_data.get("province") or request.farm_data.get("city") or request.farm_data.get("municipality") or "Unknown"
            farm_context += f"Farm location: {location}\n"
            
            if request.farm_data.get("farm_size"):
                units = request.farm_data.get("farm_size_unit") or "units"
                farm_context += f"Farm size: {request.farm_data.get('farm_size')} {units}\n"
        
        # Add crop details if available
        if request.crop_data:
            crop_details = []
            for crop in request.crop_data:
                crop_name = "Unknown crop"
                if "crop" in crop and crop["crop"] and "name" in crop["crop"]:
                    crop_name = f"{crop['crop']['name']} {crop['crop'].get('varietal', '')}"
                
                count = crop.get("crop_count", "Unknown")
                year = crop.get("planted_year", "Unknown")
                crop_details.append(f"{count} {crop_name} trees planted in {year}")
            
            farm_context += f"Crops: {'; '.join(crop_details)}\n"
        
        # Weather data from request or fetch if location provided
        weather_section = ""
        if request.weather_data:
            weather_info = request.weather_data
        elif request.farm_data and (request.farm_data.get("city") or request.farm_data.get("municipality")):
            location = request.farm_data.get("city") or request.farm_data.get("municipality")
            weather_info = get_weather(location)
        else:
            weather_info = None
            
        if weather_info:
            weather_section = (
                f"Weather Conditions:\n"
                f"- Temperature: {weather_info.get('temperature', 'N/A')}°C\n"
                f"- Humidity: {weather_info.get('humidity', 'N/A')}%\n"
                f"- Condition: {weather_info.get('condition', 'N/A')}"
            )
        # Get conversation history if provided
        conversation_history = request.conversation_history if hasattr(request, 'conversation_history') else []
        
        # Create the system message
        system_message = "You are an agricultural assistant specializing in coffee farming and regenerative agriculture."
        token_count += len(encoding.encode(system_message))

        # Format conversation history for the prompt
        history_text = ""
        if conversation_history and len(conversation_history) > 0:
            history_text = "\nPrevious conversation:\n"
            for i, msg in enumerate(conversation_history):
                role = "User" if msg.get("role") == "user" else "Assistant"
                history_text += f"{role}: {msg.get('content')}\n"

        context = ""
        for i, (chunk, metadata) in enumerate(zip(retrieved_chunks[:top_k], retrieved_metadata[:top_k])):
            # Add chunk with source info
            chunk_text = f"\n\nSource {i+1}: {metadata.get('filename', 'Unknown')}\n{chunk}"
            chunk_tokens = len(encoding.encode(chunk_text))
            
            # Check if adding this chunk would exceed token limit
            if token_count + chunk_tokens > 6000:  # Safe limit for GPT-4
                context += "\n\n[Note: Additional relevant content was found but truncated to stay within limits]"
                break
                
            context += chunk_text
            token_count += chunk_tokens
        
        # Create the final prompt
        prompt = f"""Please answer the following question about coffee farming based on the provided context.

Question: {request.query}

{farm_context if farm_context else ""}

{weather_section if weather_section else ""}

{history_text if history_text else ""}

Context from knowledge base:
{context}

Provide a detailed, specific answer that addresses the question directly. If the context contains information about the topic:
1. Explain the likely causes of the issue
2. Describe the symptoms to look for
3. Recommend solutions or treatments
4. If multiple possibilities exist, list them in order of likelihood

If the context doesn't contain enough relevant information, acknowledge this and provide general guidance based on common agricultural knowledge."""

        # Log the final token count
        final_token_count = len(encoding.encode(prompt))
        print(f"Final prompt token count: {final_token_count}")
        
        # Generate completion with OpenAI
        # Generate completion with OpenAI
        completion = openai.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt}
            ],
            temperature=0.5,
        )

        # Extract the response content from the completion
        response_text = completion.choices[0].message.content

        # Return the response with sources
        sources = []
        for i, (chunk, metadata) in enumerate(zip(retrieved_chunks, retrieved_metadata)):
            sources.append({
                "content": chunk,
                "metadata": metadata,
                "rank": i + 1
                # "similarity" value removed as discussed earlier
            })
            
        return {
            "answer": response_text,  # Now using the correct variable
            "sources": sources
        }
            
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error in query_rag: {e}")
        print(f"Full traceback: {error_trace}")
        return {"error": str(e), "fallback_response": "I'm sorry, I encountered an error processing your question."}

@app.post("/diagnosis-context")
async def get_diagnosis_context(request: ImageDiagnosisRequest):
    """Endpoint for enhancing image diagnosis with context from RAG system."""
    try:
        if faiss_index is None:
            return {"error": "FAISS index not loaded", "fallback_response": "I'm sorry, but my knowledge base is not available at the moment."}
        
        # Get relevant chunks from FAISS using the diagnosis as query
        indices, distances = search_faiss(request.diagnosis, top_k=3)
        
        # Extract relevant chunks and metadata
        retrieved_chunks = [chunks[idx]["text"] for idx in indices]
        retrieved_metadata = [metadata_mapping[str(idx)] for idx in indices]
        
        # Get weather if location is provided
        weather_info = get_weather(request.farm_location) if request.farm_location else None
        
        # Format weather section
        if weather_info:
            weather_section = (
                f"🌍 **Weather Conditions for {weather_info['city']}, {weather_info['country']}**:\n"
                f"- Temperature: {weather_info['temperature']}°C\n"
                f"- Humidity: {weather_info['humidity']}%\n"
                f"- Condition: {weather_info['condition']}"
            )
        else:
            weather_section = "⚠ Weather data unavailable."
        
        # Prepare Knowledge Section with Sources
        knowledge_section = "\n".join(
            [f"📌 **Source {i+1}:** {metadata.get('filename', 'Unknown source')} ({metadata.get('file_type', 'document')})\n{chunk}"
            for i, (chunk, metadata) in enumerate(zip(retrieved_chunks, retrieved_metadata))]
        )
        
        # Create prompt template similar to your Streamlit app
        rag_prompt = f"""
        You are an expert in coffee farming and regenerative agriculture.
        A farmer has uploaded an image of a coffee plant, and the AI diagnosed it as **{request.diagnosis}**.

        ## 🌍 Farm Location & Weather Conditions
        The farm location is **{request.farm_location if request.farm_location else "unknown"}**.
        {weather_section}

        **⚠️ Consider how the above weather conditions impact the disease, crop health, and recommended treatments.**

        ## 📖 Retrieved Knowledge from Research Documents
        {knowledge_section}

        ## ✅ Your Task:
        Summarize and provide a structured response, integrating both retrieved knowledge and weather data.

        ### 1️⃣ **Diagnosis Explanation**
        - Explain what the disease is and why it occurs.
        - Discuss how the current weather conditions may **increase or decrease** its spread.

        ### 2️⃣ **Impact on the Farm**
        - How will this affect the farmer's crops in both **short-term and long-term**?
        - Consider the **weather conditions** and their influence.

        ### 3️⃣ **Treatment & Prevention**
        - Suggest regenerative farming methods to handle this issue.
        - How should the farmer adapt **given the current weather conditions**?

        ### 4️⃣ **Advice for the Farmer**
        - Provide **clear, actionable** steps.
        - Consider **future weather trends** in the region.

        **📝 Your response should be professional, structured, and practical for a small-scale farmer.**
        """
        
        # Generate response
        response = openai.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an expert in coffee farming and regenerative agriculture."},
                {"role": "user", "content": rag_prompt}
            ]
        )

        structured_ai_response = response.choices[0].message.content
        
        # Return structured response with sources
        sources = [
            {
                "content": chunk, 
                "metadata": meta,
                "similarity": 1 - float(dist)
            } 
            for chunk, meta, dist in zip(retrieved_chunks, retrieved_metadata, distances)
        ]
        
        return {
            "answer": structured_ai_response,
            "sources": sources,
            "weather_data": weather_info
        }
        
    except Exception as e:
        print(f"Error in get_diagnosis_context: {e}")
        return {"error": str(e), "fallback_response": "I'm sorry, I encountered an error enhancing the diagnosis."}

if __name__ == "__main__":
    import uvicorn
    import datetime
    
    # Use environment variable or default port
    port = int(os.environ.get("PYTHON_PORT", "8080"))
    
    print(f"Starting server on port {port}")
    print(f"Current working directory: {os.getcwd()}")
    print(f"Python executable: {sys.executable}")
    print(f"Python version: {sys.version}")
    
    # Add these lines to run uvicorn with detailed logging
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=port,
        log_level="debug",  # Change to "info" in production
        reload=False,  # Set to True during development
    )