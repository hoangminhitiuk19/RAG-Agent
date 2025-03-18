import os
import json
import nltk
from collections import Counter
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords

# File paths
CHUNKED_FILE = "processed_chunks.json"  # Updated to JSON format
SIMILARITY_LOG_FILE = "similarity_log.txt"

# Download NLTK resources if not available
nltk.download("punkt")
nltk.download("stopwords")

def extract_keywords(text, num_keywords=5):
    """Extracts top keywords from a chunk."""
    words = word_tokenize(text.lower())
    words = [word for word in words if word.isalnum()]  # Remove punctuation
    words = [word for
              word in words if word not in stopwords.words("english")]  # Remove stopwords
    return [word for word, count in Counter(words).most_common(num_keywords)]

def analyze_chunked_file():
    """Reads processed_chunks.json and analyzes chunk count, division, and content."""
    
    if not os.path.exists(CHUNKED_FILE):
        print(f"❌ Error: {CHUNKED_FILE} not found! Run `semantic_chunking.py` first.")
        return

    with open(CHUNKED_FILE, "r", encoding="utf-8") as file:
        chunks = json.load(file)  # Load JSON instead of reading as text

    print("\n===== 📊 Chunk Analysis =====")
    print(f"✅ Total Chunks Created: {len(chunks)}\n")

    # Track statistics
    chunk_sizes = [len(chunk["text"].split()) for chunk in chunks]
    avg_chunk_size = sum(chunk_sizes) / len(chunk_sizes) if chunk_sizes else 0
    max_chunk_size = max(chunk_sizes) if chunk_sizes else 0
    min_chunk_size = min(chunk_sizes) if chunk_sizes else 0

    print(f"📏 Average Chunk Size: {avg_chunk_size:.2f} words")
    print(f"🔍 Largest Chunk: {max_chunk_size} words")
    print(f"✂️ Smallest Chunk: {min_chunk_size} words\n")

    # Display only the first 5 and last 5 chunks
    num_chunks = len(chunks)
    preview_count = 5  # Show first and last 5 chunks

    def display_chunk(i, chunk):
        keywords = extract_keywords(chunk["text"])
        print(f"📝 Chunk {i+1} (From {chunk['metadata']['filename']}):")
        print(f"🔑 Keywords: {', '.join(keywords)}")
        print(f"📜 Content Preview: {chunk['text'][:200]}...")  # Show first 200 characters
        print("=" * 50)

    print("🟢 Showing first 5 chunks:")
    for i in range(min(preview_count, num_chunks)):
        display_chunk(i, chunks[i])

    if num_chunks > 2 * preview_count:
        print("\n...\n🟢 Skipping middle chunks...\n...\n")

    print("🟢 Showing last 5 chunks:")
    for i in range(max(num_chunks - preview_count, preview_count), num_chunks):
        display_chunk(i, chunks[i])

def analyze_similarity_logs():
    """Reads similarity_log.txt to explain why chunks were divided."""
    
    if not os.path.exists(SIMILARITY_LOG_FILE):
        print(f"❌ Error: {SIMILARITY_LOG_FILE} not found! Run `semantic_chunking.py` first.")
        return

    with open(SIMILARITY_LOG_FILE, "r", encoding="utf-8") as file:
        logs = file.readlines()

    print("\n===== 🔍 Why Were Chunks Split? (Similarity Log) =====")

    # Display only the first 10 log entries
    max_logs = 10
    for i, log in enumerate(logs[:max_logs]):
        print(log.strip())

    if len(logs) > max_logs:
        print("... (Skipping remaining logs, view full file for details) ...")

def main():
    """Runs the full chunk analysis."""
    analyze_chunked_file()
    analyze_similarity_logs()

if __name__ == "__main__":
    main()
