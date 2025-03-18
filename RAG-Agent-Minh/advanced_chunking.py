import re
import nltk
from typing import List, Dict, Any
import logging

# Download required NLTK resources if not already present
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt', quiet=True)

def extract_sections_by_headings(text: str) -> List[tuple]:
    """Extract sections from document based on headings."""
    # Common heading patterns in documents
    heading_patterns = [
        r'\n#+\s+(.+?)\n',  # Markdown heading
        r'\n(\d+\..*?)\n',  # Numbered section
        r'\n([A-Z][A-Z\s]+)\n',  # ALL CAPS heading
        r'\n(.+?)\n[=\-]{3,}\n'  # Underlined heading
    ]

    # Find all potential section headings
    all_headings = []
    for pattern in heading_patterns:
        for match in re.finditer(pattern, '\n' + text + '\n'):
            all_headings.append((match.start(), match.group(1)))
    
    # Sort headings by position
    all_headings.sort()
    
    # If no headings found, treat the whole document as one section
    if not all_headings:
        return [("Document", text)]
    
    # Extract sections based on headings
    sections = []
    for i, (pos, title) in enumerate(all_headings):
        start_pos = pos
        # Determine end of current section (start of next section or end of text)
        end_pos = all_headings[i+1][0] if i < len(all_headings) - 1 else len(text)
        # Extract content between headings
        content = text[start_pos:end_pos].strip()
        if content:
            sections.append((title.strip(), content))
    
    return sections

def topic_based_chunking(text: str, metadata: Dict[str, Any], max_chunk_size: int = 500) -> List[Dict]:
    """Split long text into coherent topic-based chunks."""
    # Split into paragraphs
    paragraphs = [p for p in text.split('\n\n') if p.strip()]
    if not paragraphs:
        return []
    
    # Simple topic segmentation based on paragraph similarity
    chunks = []
    current_chunk = []
    current_length = 0
    
    for para in paragraphs:
        para_length = len(para.split())
        
        # If adding this paragraph would exceed max size, start a new chunk
        if current_length + para_length > max_chunk_size and current_chunk:
            chunk_text = '\n\n'.join(current_chunk)
            chunks.append({
                "text": chunk_text,
                "metadata": metadata.copy()
            })
            current_chunk = [para]
            current_length = para_length
        else:
            current_chunk.append(para)
            current_length += para_length
    
    # Add the last chunk if not empty
    if current_chunk:
        chunk_text = '\n\n'.join(current_chunk)
        chunks.append({
            "text": chunk_text, 
            "metadata": metadata.copy()
        })
    
    return chunks

def sliding_window_chunking(text: str, metadata: Dict[str, Any], chunk_size: int = 300, overlap: int = 80) -> List[Dict]:
    """Create overlapping chunks to ensure context continuity."""
    sentences = nltk.sent_tokenize(text)
    chunks = []
    
    i = 0
    while i < len(sentences):
        # Determine end of current chunk
        j = i
        chunk_text = []
        word_count = 0
        
        # Build chunk up to chunk_size words
        while j < len(sentences) and word_count < chunk_size:
            chunk_text.append(sentences[j])
            word_count += len(sentences[j].split())
            j += 1
            
        # Create chunk with current text
        if chunk_text:
            chunk = {
                "text": " ".join(chunk_text),
                "metadata": {**metadata, "start_idx": i, "end_idx": j-1}
            }
            chunks.append(chunk)
        
        # Move start position based on overlap
        words_per_sentence = word_count / (j - i) if j > i else 0
        sentences_to_move = max(1, int((chunk_size - overlap) / words_per_sentence)) if words_per_sentence > 0 else 1
        i += sentences_to_move
    
    return chunks

def entity_centric_chunking(text: str, metadata: Dict[str, Any], target_entities: List[str] = None) -> List[Dict]:
    """Create chunks centered around key entities."""
    if target_entities is None:
        # Default target entities based on your project's focus
        target_entities = ["coffee", "pepper", "fertilizer", "soil", "climate", "carbon", "emission", "sustainability"]
    
    # Split into sentences
    sentences = nltk.sent_tokenize(text)
    
    # Group sentences by entity mentions
    entity_chunks = {entity: [] for entity in target_entities}
    other_sentences = []
    
    for sentence in sentences:
        sentence_lower = sentence.lower()
        mentioned_entities = set()
        
        # Check for entity mentions
        for entity in target_entities:
            if entity in sentence_lower:
                mentioned_entities.add(entity)
        
        # Add to appropriate chunks
        if mentioned_entities:
            for entity in mentioned_entities:
                entity_chunks[entity].append(sentence)
        else:
            other_sentences.append(sentence)
    
    # Create final chunks
    result_chunks = []
    
    # Entity-specific chunks
    for entity, entity_sentences in entity_chunks.items():
        if entity_sentences:
            chunk_text = " ".join(entity_sentences)
            if len(chunk_text.split()) > 30:  # Only create chunk if it has enough content
                result_chunks.append({
                    "text": chunk_text,
                    "metadata": {**metadata, "entity_focus": entity}
                })
    
    # Remaining content (if any substantial content is left)
    if other_sentences and len(" ".join(other_sentences).split()) > 50:
        chunk_text = " ".join(other_sentences)
        result_chunks.append({
            "text": chunk_text,
            "metadata": {**metadata, "entity_focus": "general"}
        })
    
    return result_chunks

def remove_redundancy(chunks: List[Dict]) -> List[Dict]:
    """Remove duplicate or highly similar chunks."""
    if not chunks:
        return []
    
    unique_chunks = []
    unique_texts = set()
    
    for chunk in chunks:
        # Create a simplified representation for comparison
        simplified = ' '.join(chunk["text"].lower().split())
        
        # Check if we already have a very similar chunk
        is_duplicate = False
        for existing in unique_texts:
            # Simple similarity check - can be improved with more sophisticated methods
            if simplified in existing or existing in simplified:
                is_duplicate = True
                break
        
        if not is_duplicate:
            unique_texts.add(simplified)
            unique_chunks.append(chunk)
    
    return unique_chunks

def optimized_chunking_pipeline(document: str, metadata: Dict[str, Any]) -> List[Dict]:
    """Multi-stage chunking pipeline optimized for agricultural domain."""
    logging.info(f"Starting multi-stage chunking pipeline for document: {metadata.get('filename', 'Unknown')}")
    
    # Stage 1: Split document into major structural sections
    structural_chunks = extract_sections_by_headings(document)
    logging.info(f"Identified {len(structural_chunks)} structural sections")
    
    all_chunks = []
    for section_title, section_content in structural_chunks:
        section_metadata = {**metadata, "section": section_title}
        
        # Stage 2: For long sections, apply topic-based chunking
        if len(section_content.split()) > 1000:
            topic_chunks = topic_based_chunking(section_content, section_metadata)
            all_chunks.extend(topic_chunks)
            logging.info(f"Applied topic-based chunking to section '{section_title}', created {len(topic_chunks)} chunks")
        else:
            # Stage 3: For shorter sections, use sliding window with overlap
            sliding_chunks = sliding_window_chunking(section_content, section_metadata)
            all_chunks.extend(sliding_chunks)
            logging.info(f"Applied sliding window chunking to section '{section_title}', created {len(sliding_chunks)} chunks")
    
    # Stage 4: Add specialized entity-centric chunks for high-value content
    entity_chunks = entity_centric_chunking(document, metadata)
    logging.info(f"Created {len(entity_chunks)} entity-focused chunks")
    
    # Combine while eliminating redundant content
    combined_chunks = all_chunks + entity_chunks
    final_chunks = remove_redundancy(combined_chunks)
    
    logging.info(f"Final output: {len(final_chunks)} unique chunks after removing redundancy")
    
    return final_chunks