import faiss
import numpy as np
import openai
import logging

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

# Example Usage
if __name__ == "__main__":
    user_input = input("🔍 Enter your query: ")
    query_rag_system(user_input)
