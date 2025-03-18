import os
import faiss
import numpy as np
import openai
import streamlit as st
import json
import logging
import sys
from embedding_cache import get_cached_embedding, cache_embedding
from reranking import hybrid_retrieval

# OpenAI API Key
openai.api_key = ""

# FAISS index file
FAISS_INDEX_FILE = "faiss_index.bin"
PROCESSED_FILE = "processed_chunks.json"
METADATA_FILE = "faiss_metadata.json"
use_reranking = "--use-reranking" in sys.argv

def load_faiss_index():
    """Loads the FAISS index from the saved file."""
    index = faiss.read_index(FAISS_INDEX_FILE)
    return index

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

        return chunks, metadata_mapping
    except Exception as e:
        logging.error(f"❌ Error loading chunks or metadata: {e}")
        return [], {}

def generate_response(user_query, retrieved_chunks):
    """Generates a final AI response using GPT-4 with retrieved knowledge."""
    context = "\n\n".join(retrieved_chunks)
    prompt = f"""
    You are an expert in coffee farming. Answer the user's question using only the provided context.
    
    **User Question:** {user_query}
    
    **Context from Knowledge Base:**
    {context}
    
    **Answer:**
    """
    response = openai.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "system", "content": "You are an expert in coffee farming."},
                  {"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content

def query_rag_system(user_query):
    """Queries FAISS, retrieves relevant text, and generates a response with GPT-4."""
    index = load_faiss_index()
    chunks, metadata_mapping = load_chunks()
    
    indices, distances = search_faiss(user_query, index, top_k=3, use_reranking=use_reranking)
    
    # Prepare results
    all_chunks = []
    
    for idx in indices:
        if idx >= 0:  # Valid index
            chunk_data = chunks[idx]
            all_chunks.append(chunk_data["text"])
    
    # Apply reranking if enabled
    if use_reranking and len(all_chunks) > 1:
        logging.info("Applying reranking to search results...")
        # Create chunk objects for reranking that include text and original index
        rerank_chunks = [{"text": text, "original_idx": i} for i, text in enumerate(all_chunks)]
        # Get reranked results
        reranked_chunks = hybrid_retrieval(user_query, rerank_chunks, len(all_chunks))
        
        # Reorganize chunks based on reranking
        reranked_text = []
        for chunk in reranked_chunks:
            original_idx = chunk["original_idx"]
            reranked_text.append(all_chunks[original_idx])
        
        all_chunks = reranked_text
    
    ai_response = generate_response(user_query, all_chunks)

    return all_chunks, ai_response

# 🔹 Streamlit UI Setup
st.title("☕ AI-Powered Coffee Farming Assistant")
st.write("Ask me anything about coffee farming, diseases, and best practices!")

# Add a toggle for reranking
use_reranking_toggle = st.sidebar.checkbox("Enable reranking for better results", value=use_reranking)
if use_reranking_toggle != use_reranking:
    use_reranking = use_reranking_toggle
    st.sidebar.info("Reranking setting updated!" + (" Reranking is now enabled." if use_reranking else " Reranking is now disabled."))

user_query = st.text_input("🔍 Enter your question:", "")

if st.button("Ask AI"):
    if user_query:
        with st.spinner("🔍 Searching knowledge base..."):
            retrieved_chunks, ai_response = query_rag_system(user_query)
        
        # Display Retrieved Chunks
        st.subheader("📌 Top Relevant Knowledge Chunks")
        for i, chunk in enumerate(retrieved_chunks):
            st.write(f"🔹 **Chunk {i+1}:**")
            st.info(chunk)

        # Display AI Response
        st.subheader("🧠 AI-Generated Answer")
        st.success(ai_response)
    else:
        st.warning("⚠ Please enter a question before clicking 'Ask AI'.")

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