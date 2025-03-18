import os
import json
import faiss
import numpy as np
import openai
import requests
import streamlit as st
import logging
import sys
from embedding_cache import get_cached_embedding, cache_embedding
from reranking import hybrid_retrieval
import tiktoken
# OpenAI API Key
openai.api_key = ""

# OpenWeatherMap API Key
WEATHER_API_KEY = ""
WEATHER_API_URL = "http://api.openweathermap.org/data/2.5/weather"

# FAISS index file and metadata
FAISS_INDEX_FILE = "faiss_index.bin"
PROCESSED_FILE = "processed_chunks.json"
METADATA_FILE = "faiss_metadata.json"
use_reranking = "--use-reranking" in sys.argv

def get_weather(city):
    """Fetches weather data for a given city using OpenWeatherMap API."""
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
        print(f"⚠ Error fetching weather data: {response.json()}")
        return None

def load_faiss_index():
    """Loads the FAISS index from the saved file."""
    return faiss.read_index(FAISS_INDEX_FILE)

def get_embedding(text):
    """Generates an embedding for a given query using OpenAI with caching."""
    # Check cache first
    cached_embedding = get_cached_embedding(text)
    if cached_embedding is not None:
        return cached_embedding
    
    # Generate new embedding if not in cache
    response = openai.embeddings.create(
        model="text-embedding-3-large",
        input=text
    )
    embedding = np.array(response.data[0].embedding, dtype=np.float32)
    
    # Cache the embedding for future use
    cache_embedding(text, embedding)
    
    return embedding

def search_faiss(query, index, top_k=3, use_reranking=use_reranking):
    """Searches FAISS index for the most relevant chunk with optional reranking."""
    query_embedding = get_embedding(query)
    query_embedding = np.expand_dims(query_embedding, axis=0)  # Reshape for FAISS
    distances, indices = index.search(query_embedding, top_k * (3 if use_reranking else 1))
    
    return indices[0], distances[0]

def load_chunks():
    """Loads text chunks and metadata from JSON file."""
    try:
        with open(PROCESSED_FILE, "r", encoding="utf-8") as file:
            chunks = json.load(file)

        with open(METADATA_FILE, "r", encoding="utf-8") as meta_file:
            metadata_mapping = json.load(meta_file)

        logging.info(f"✅ Loaded {len(chunks)} chunks and metadata.")

        return chunks, metadata_mapping  # Returns both text chunks and metadata
    except Exception as e:
        logging.error(f"❌ Error loading chunks or metadata: {e}")
        return [], {}

def generate_response(user_query, retrieved_chunks, metadata_list, weather_info):
    """Generates a final AI response using GPT-4 with retrieved knowledge & weather data."""
    encoding = tiktoken.get_encoding("cl100k_base")  # GPT-4 encoding
    
    # Start with system message tokens (estimated)
    token_count = len(encoding.encode("You are an expert in coffee farming."))
    
    # Add query tokens
    token_count += len(encoding.encode(user_query))
    
    # Add weather info tokens
    weather_prompt = f"""
    The current weather in {weather_info['city']}, {weather_info['country']}:
    - Temperature: {weather_info['temperature']}°C
    - Humidity: {weather_info['humidity']}%
    - Condition: {weather_info['condition']}
    
    Consider the weather while answering.
    """
    token_count += len(encoding.encode(weather_prompt))
    
    # Prepare context and sources
    context = ""
    source_citations = ""
    max_tokens = 6000  # Set a limit well below the 10,000 TPM limit
    
    # Calculate tokens and add chunks until we approach the limit
    for i, chunk in enumerate(retrieved_chunks):
        metadata = metadata_list[i]
        chunk_text = f"\n\n🔹 **Source: {metadata['filename']} ({metadata['file_type']})**\n{chunk}"
        citation = f"- **Source {i+1}:** {metadata['filename']} ({metadata['file_type']}), Extracted on {metadata['extracted_date']}\n"
        
        # Calculate tokens for this chunk
        chunk_tokens = len(encoding.encode(chunk_text))
        citation_tokens = len(encoding.encode(citation))
        
        # Check if adding this chunk would exceed our limit
        if token_count + chunk_tokens + citation_tokens > max_tokens:
            # Add a note that we're truncating content
            context += "\n\n[Note: Additional relevant content was found but truncated to stay within limits]"
            break
            
        # Add this chunk and citation
        context += chunk_text
        source_citations += citation
        token_count += chunk_tokens + citation_tokens
    
    # Construct the final prompt
    prompt = f"""
    You are an expert in coffee farming. Answer the user's question using only the provided context.

    **User Question:** {user_query}

    **Weather Condition:** 
    {weather_prompt}
    
    **Context from Knowledge Base:**
    {context}

    **Sources of Information:**
    {source_citations}

    **Answer:**
    """
    
    # Final token check
    final_token_count = len(encoding.encode(prompt))
    logging.info(f"Final prompt token count: {final_token_count}")
    
    # Generate response
    response = openai.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "system", "content": "You are an expert in coffee farming."},
                  {"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content

def query_rag_system(user_query, city):
    """Queries FAISS, retrieves relevant text, and generates a response with GPT-4."""
    index = load_faiss_index()
    chunks, metadata_mapping = load_chunks()

    # Get weather data
    weather_info = get_weather(city)
    if not weather_info:
        return None, None, "⚠ Could not retrieve weather data. Please check the city name."

    # Get initial search results - retrieve more candidates than needed
    indices, distances = search_faiss(user_query, index, top_k=5, use_reranking=use_reranking)
    
    # Prepare results
    all_chunks = []
    all_metadata = []
    all_distances = []
    
    for idx, dist in zip(indices, distances):
        if idx >= 0:  # Valid index
            chunk_data = chunks[idx]
            metadata = metadata_mapping[str(idx)]
            all_chunks.append(chunk_data["text"])
            all_metadata.append(metadata)
            all_distances.append(dist)
    
    # Apply reranking if enabled
    if use_reranking and len(all_chunks) > 1:
        logging.info("Applying reranking to search results...")
        rerank_chunks = [{"text": text, "original_idx": i} for i, text in enumerate(all_chunks)]
        reranked_chunks = hybrid_retrieval(user_query, rerank_chunks, len(all_chunks))
        
        reranked_text = []
        reranked_metadata = []
        for chunk in reranked_chunks:
            original_idx = chunk["original_idx"]
            reranked_text.append(all_chunks[original_idx])
            reranked_metadata.append(all_metadata[original_idx])
        
        all_chunks = reranked_text
        all_metadata = reranked_metadata
    
    # Limit to top 3 chunks to avoid token issues
    all_chunks = all_chunks[:3]
    all_metadata = all_metadata[:3]
    
    # Generate the response
    ai_response = generate_response(user_query, all_chunks, all_metadata, weather_info)
    
    return all_chunks, all_metadata, ai_response


# 🔹 Streamlit UI Setup
st.title("☕ AI-Powered Coffee Farming Assistant (With Weather Awareness)")
st.write("Ask me anything about coffee farming, diseases, and best practices!")

# Add a toggle for reranking
use_reranking_toggle = st.sidebar.checkbox("Enable reranking for better results", value=use_reranking)
if use_reranking_toggle != use_reranking:
    use_reranking = use_reranking_toggle
    st.sidebar.info("Reranking setting updated!" + (" Reranking is now enabled." if use_reranking else " Reranking is now disabled."))

# User Input Fields
user_query = st.text_input("🔍 Enter your question:", "")
city = st.text_input("📍 Enter your city name (e.g., Hanoi, Ho Chi Minh City):", "")

if st.button("Ask AI"):
    if user_query and city:
        with st.spinner("🔍 Searching knowledge base & fetching weather..."):
            try:
                retrieved_chunks, retrieved_metadata, ai_response = query_rag_system(user_query, city)
                
                if retrieved_chunks:
                    # Display Retrieved Chunks with Metadata
                    st.subheader("📌 Top Relevant Knowledge Chunks")
                    for i, (chunk, metadata) in enumerate(zip(retrieved_chunks, retrieved_metadata)):
                        st.write(f"🔹 **Chunk {i+1}:** (From {metadata['filename']} - {metadata['file_type']}, Extracted on {metadata['extracted_date']})")
                        st.info(chunk)

                    # Display AI Response
                    st.subheader("🧠 AI-Generated Answer")
                    st.success(ai_response)

                    # Display Source Citations
                    st.subheader("📚 Sources")
                    for i, metadata in enumerate(retrieved_metadata):
                        st.write(f"- **Source {i+1}:** {metadata['filename']} ({metadata['file_type']}), Extracted on {metadata['extracted_date']}")
                else:
                    st.warning(ai_response)
            except openai.RateLimitError as e:
                st.error(f"OpenAI Rate Limit Exceeded: {str(e)}\n\nTry asking a simpler question or waiting a minute before trying again.")
            except Exception as e:
                st.error(f"An error occurred: {str(e)}")
    else:
        st.warning("⚠ Please enter both a question and a city before clicking 'Ask AI'.")

# Add cache statistics in sidebar
st.sidebar.title("System Info")
if st.sidebar.button("Show Cache Statistics"):
    from embedding_cache import get_cache_stats
    stats = get_cache_stats()
    st.sidebar.write(f"Total embeddings cached: {stats['total_files']}")
    st.sidebar.write(f"Total cache size: {stats['total_size_mb']:.2f} MB")
    for model, model_stats in stats['models'].items():
        st.sidebar.write(f"Model {model}: {model_stats['file_count']} files, {model_stats['size_mb']:.2f} MB")

# Add cache clear button
if st.sidebar.button("Clear Embedding Cache"):
    from embedding_cache import clear_cache
    cleared = clear_cache()
    st.sidebar.success(f"Cleared {cleared} cached embeddings!")