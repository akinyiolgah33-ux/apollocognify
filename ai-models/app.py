from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import re
import collections

app = FastAPI(title="Cognify NLP Service")

# Attempt to load spacy
try:
    import spacy
    try:
        nlp = spacy.load("en_core_web_sm")
    except OSError:
        print("Warning: spacy model 'en_core_web_sm' not found. Please run: python -m spacy download en_core_web_sm")
        nlp = None
except ImportError:
    print("Warning: spaCy library is not installed. Using fallback rule-based entity extraction.")
    nlp = None

# Attempt to load transformers
try:
    from transformers import pipeline
    try:
        summarizer = pipeline("summarization", model="sshleifer/distilbart-cnn-12-6")
    except Exception as e:
        print(f"Warning: Failed to load summarizer pipeline: {e}")
        summarizer = None
except ImportError:
    print("Warning: transformers library is not installed. Using fallback rule-based summarizer.")
    summarizer = None

class TextRequest(BaseModel):
    text: str

@app.get("/")
def read_root():
    status = "NLP Service is running"
    details = []
    if nlp is None:
        details.append("spaCy fallback active")
    if summarizer is None:
        details.append("Summarizer fallback active")
    if details:
        status += " (" + ", ".join(details) + ")"
    return {"status": status}

@app.post("/api/extract-entities")
def extract_entities(req: TextRequest):
    if nlp:
        doc = nlp(req.text)
        entities = [{"text": ent.text, "label": ent.label_} for ent in doc.ents]
        return {"entities": entities}
    else:
        # Heuristic entity extraction: Capitalized words (names/places/orgs)
        words = re.findall(r'\b[A-Z][a-z]+\b', req.text)
        entities = [{"text": w, "label": "ENTITY (Fallback)"} for w in set(words)]
        return {"entities": entities}

@app.post("/api/summarize")
def summarize_text(req: TextRequest):
    if summarizer:
        if len(req.text.split()) < 20:
            return {"summary": req.text}
        try:
            result = summarizer(req.text, max_length=130, min_length=30, do_sample=False)
            return {"summary": result[0]['summary_text']}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    else:
        # Heuristic summarizer: Select top 3 scoring sentences based on word frequency
        sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', req.text) if s.strip()]
        if len(sentences) <= 3:
            return {"summary": req.text}
        
        words = [w.lower() for w in re.findall(r'\b\w{5,}\b', req.text)]
        word_counts = collections.Counter(words)
        
        def score_sentence(s):
            words_in_s = re.findall(r'\b\w{5,}\b', s.lower())
            if not words_in_s:
                return 0
            return sum(word_counts[w] for w in words_in_s) / len(words_in_s)
        
        scored = sorted(sentences, key=score_sentence, reverse=True)
        top_sentences = scored[:3]
        # Keep original order
        ordered_summary = [s for s in sentences if s in top_sentences]
        return {"summary": " ".join(ordered_summary)}

