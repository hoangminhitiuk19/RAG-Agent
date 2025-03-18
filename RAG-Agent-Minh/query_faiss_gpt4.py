import faiss
import numpy as np
import openai
import logging
from reranking import hybrid_retrieval
# OpenAI API Key (Hardcoded for now)
openai.api_key = ""  # Replace with your actual API key

# FAISS index file
FAISS_INDEX_FILE = "faiss_index.bin"
PROCESSED_FILE = "processed_chunks.txt"  # Load text chunks for reference

def load_faiss_index():
    """Loads the FAISS index from the saved file."""
    index = faiss.read_index(FAISS_INDEX_FILE)
    return index

def get_embedding(text):
    """Generates an embedding for a given query using OpenAI."""
    response = openai.embeddings.create(
        model="text-embedding-ada-002",
        input=text
    )
    return np.array(response.data[0].embedding, dtype=np.float32)

def search_faiss(query, index, top_k=3):
    """Searches FAISS index for the most relevant chunk."""
    query_embedding = get_embedding(query)
    query_embedding = np.expand_dims(query_embedding, axis=0)  # Reshape for FAISS
    distances, indices = index.search(query_embedding, top_k)  # FAISS search

    return indices[0], distances[0]

def load_chunks():
    """Loads text chunks for returning relevant content."""
    with open(PROCESSED_FILE, "r", encoding="utf-8") as file:
        chunks = file.read().split("\n\n")  # Splitting chunks
    return chunks

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


def rerank_chunks(query, chunks, top_k=5):
    """Rerank chunks using query relevance to improve retrieval quality."""
    from sentence_transformers import CrossEncoder
    
    try:
        # Initialize cross-encoder model
        model = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')
        
        # Score pairs of query and chunks
        pairs = [(query, chunk["text"]) for chunk in chunks]
        scores = model.predict(pairs)
        
        # Sort chunks by score
        scored_chunks = list(zip(chunks, scores))
        scored_chunks.sort(key=lambda x: x[1], reverse=True)
        
        # Return top_k chunks
        return [chunk for chunk, _ in scored_chunks[:top_k]]
    except Exception as e:
        logging.error(f"Error during reranking: {e}")
        return chunks[:top_k]  # Fall back to original ranking


def query_rag_system(user_query):
    """Queries FAISS, retrieves relevant text, and generates a response with GPT-4."""
    index = load_faiss_index()
    chunks = load_chunks()
    
    indices, distances = search_faiss(user_query, index, top_k=3)
    
    retrieved_chunks = [chunks[idx] for idx in indices]
    
    print("\n🔹 **Top Relevant Chunks:**")
    for i, (idx, score) in enumerate(zip(indices, distances)):
        print(f"📌 Rank {i+1}: (Score: {score:.4f})")
        print(retrieved_chunks[i])
        print("\n" + "-"*50)

    print("\n🧠 **GPT-4 Response:**")
    ai_response = generate_response(user_query, retrieved_chunks)
    print(ai_response)

def search_with_priority(query_embedding, index, metadata, k=5, topic_filter=None, prioritize_client=False):
    """Searches FAISS index with optional filtering by topic and prioritization."""
    # Get more results than needed for filtering
    expanded_k = k * 3
    
    # Search FAISS
    distances, indices = index.search(np.array([query_embedding], dtype=np.float32), expanded_k)
    
    # Filter and prioritize results
    results = []
    for i, idx in enumerate(indices[0]):
        if idx < 0:  # Invalid index
            continue
        
        meta = metadata.get(str(idx), {})
        
        # Apply topic filter if specified
        if topic_filter and meta.get("topic") != topic_filter:
            continue
        
        # Calculate priority score (lower is better)
        priority_score = distances[0][i]  # Start with distance
        
        # Boost priority for client data or high priority items
        if prioritize_client and meta.get("client_id"):
            priority_score *= 0.5  # Boost client data by reducing score
        
        if meta.get("priority") == "high":
            priority_score *= 0.7  # Boost high priority items
        
        results.append({
            "id": idx,
            "distance": distances[0][i],
            "priority_score": priority_score,
            "metadata": meta
        })
    
    # Sort by priority score
    results.sort(key=lambda x: x["priority_score"])
    
    # Return top k results after filtering
    return results[:k]
# Example Usage
if __name__ == "__main__":
    user_input = input("🔍 Enter your query: ")
    query_rag_system(user_input)
