#!/usr/bin/env python3
"""
Compute semantic similarity between all books in the database.
Uses sentence-transformers to create embeddings based on title, author, themes, and dominant emotions.
Outputs a static JSON mapping of book IDs to their top 10 most similar books.
"""

import json
import os
import time
from pathlib import Path
from dotenv import load_dotenv

try:
    from sentence_transformers import SentenceTransformer
    import torch
except ImportError:
    print("ERROR: sentence-transformers not installed. Run: pip install sentence-transformers torch")
    exit(1)

try:
    from supabase import create_client
except ImportError:
    print("ERROR: supabase not installed. Run: pip install supabase")
    exit(1)

# Load environment variables
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("ERROR: Missing Supabase credentials in .env")
    exit(1)

client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
OUTPUT_FILE = Path(__file__).parent.parent.parent / "frontend" / "public" / "data" / "similar_books.json"

def get_grouped_books():
    """Fetch and group all entries by book Title + Author to match how the frontend details panel works."""
    print("Fetching entries from Supabase...")
    data = []
    page_size = 1000
    offset = 0
    while True:
        response = (
            client.table("literary_places")
            .select("*")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = response.data or []
        if not batch:
            break
        data.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    print(f"Fetched {len(data)} rows from Supabase")
    
    # We want similarity by BOOK, not just by individual place passage.
    # Group by a unique book key
    books = {}
    for entry in data:
        key = f"{entry['book_title']}||{entry['author']}"
        if key not in books:
            books[key] = {
                "id": entry["id"], # Store one ID as anchor
                "title": entry["book_title"],
                "author": entry["author"],
                "genres": entry.get("genres", []),
                "cities": set(),
                "themes": set(),
                "emotions": set(),
                "passages": []
            }
            
        books[key]["cities"].add(entry["place_name"])
        
        # Add NLP data
        if entry.get("themes"):
            books[key]["themes"].update(entry["themes"])
        if entry.get("dominant_emotions"):
            books[key]["emotions"].update(entry["dominant_emotions"])
        if entry.get("passage"):
            books[key]["passages"].append(entry["passage"])
            
    # Convert sets to lists for processing
    for bk in books.values():
        bk["cities"] = list(bk["cities"])
        bk["themes"] = list(bk["themes"])
        bk["emotions"] = list(bk["emotions"])
        
    print(f"Grouped {len(data)} explicit places into {len(books)} unique books.")
    return list(books.values())

def compute_similarity():
    books = get_grouped_books()
    if not books:
        print("No books found.")
        return

    print("Loading MiniLM model...")
    # paraphrase-multilingual-MiniLM-L12-v2 is fast, small, and supports 50+ languages
    model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
    
    print("Preparing composite text strings...")
    texts = []
    book_ids = []
    
    for book in books:
        # Create a rich text representation of the book
        # Weight themes and emotions highly, include cities and a snippet of the passage
        themes_str = " ".join(book["themes"][:5])
        emotions_str = " ".join(book["emotions"][:5])
        cities_str = " ".join(book["cities"])
        genres_str = " ".join(book["genres"])
        
        # Use first 200 chars of the first passage as flavor text
        passage_snippet = book["passages"][0][:200] if book.get("passages") else ""
        
        composite = f"Title: {book['title']}. Author: {book['author']}. Genres: {genres_str}. Set in: {cities_str}. Themes: {themes_str}. Emotions: {emotions_str}. Context: {passage_snippet}"
        texts.append(composite)
        # Using the unique title||author key as the identifier to match the frontend
        book_ids.append(f"{book['title']}||{book['author']}")

    print(f"Computing embeddings for {len(texts)} books...")
    start_time = time.time()
    
    # Compute embeddings
    embeddings = model.encode(texts, convert_to_tensor=True)
    print(f"Embeddings generated in {time.time() - start_time:.2f} seconds.")
    
    # Compute cosine similarity matrix
    from sentence_transformers import util
    cosine_scores = util.cos_sim(embeddings, embeddings)
    
    # Extract top 6 similar books for each book
    print("Extracting top similar matches...")
    similarity_map = {}
    
    for i in range(len(books)):
        # Get scores for this book against all others
        scores = cosine_scores[i].tolist()
        
        # Create list of (score, index)
        score_idx_pairs = [(scores[j], j) for j in range(len(scores))]
        
        # Sort descending by score
        score_idx_pairs.sort(key=lambda x: x[0], reverse=True)
        
        # Get top 6 (skip index 0, which is the book itself with score 1.0)
        # Match the data structure needed by the frontend
        similar_books = []
        for score, j in score_idx_pairs[1:7]:
            if score > 0.4: # Only include if there's actual similarity
                matched_book = books[j]
                similar_books.append({
                    "title": matched_book["title"],
                    "author": matched_book["author"],
                    "score": round(score, 3),
                    "shared_themes": list(set(books[i]["themes"]).intersection(set(matched_book["themes"])))[:2]
                })
                
        similarity_map[book_ids[i]] = similar_books

    # Ensure output directory exists
    os.makedirs(OUTPUT_FILE.parent, exist_ok=True)
    
    with open(OUTPUT_FILE, "w") as f:
        json.dump(similarity_map, f, indent=2)
        
    print(f"Success! Saved static similarity matrix to {OUTPUT_FILE}")
    print(f"Total entries: {len(similarity_map)}")

if __name__ == "__main__":
    compute_similarity()
