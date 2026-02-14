#!/usr/bin/env python3
"""
NER Training Data Collector
============================
Collects and validates training data for NER model.

Sources:
1. LLM extractions (automatically labeled)
2. Manual annotations from admin dashboard
3. Conversation logs with corrections

Output Format:
    JSONL file with each line:
    {
        "text": "tushar misal hai",
        "entities": [
            {"start": 0, "end": 6, "label": "STORE"},
            {"start": 7, "end": 12, "label": "FOOD"}
        ]
    }
"""

import os
import sys
import json
import re
import logging
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from pathlib import Path
import hashlib

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============================================================================
# CONFIGURATION
# ============================================================================
DATA_DIR = os.environ.get('NER_DATA_DIR', '/data/ner_training')
RAW_DATA_FILE = f"{DATA_DIR}/raw_examples.jsonl"
VALIDATED_DATA_FILE = f"{DATA_DIR}/validated_training.jsonl"
STATS_FILE = f"{DATA_DIR}/collection_stats.json"


# ============================================================================
# DATA VALIDATION
# ============================================================================
def find_entity_spans(text: str, entity_value: str) -> List[Tuple[int, int]]:
    """Find all occurrences of entity value in text"""
    spans = []
    text_lower = text.lower()
    value_lower = entity_value.lower()
    
    start = 0
    while True:
        pos = text_lower.find(value_lower, start)
        if pos == -1:
            break
        spans.append((pos, pos + len(entity_value)))
        start = pos + 1
    
    return spans


def entities_from_llm_output(text: str, llm_output: Dict) -> List[Dict]:
    """
    Convert LLM extraction output to NER span format
    
    LLM output format:
        {
            "store_reference": "tushar",
            "food_reference": ["misal"],
            "quantity": "1",
            "location_reference": "xyz",
            "preference": ["spicy"]
        }
    
    Returns:
        [{"start": 0, "end": 6, "label": "STORE"}, ...]
    """
    entities = []
    
    # Map LLM fields to NER labels
    field_mapping = {
        'store_reference': 'STORE',
        'food_reference': 'FOOD',
        'quantity': 'QTY',
        'location_reference': 'LOC',
        'preference': 'PREF'
    }
    
    for field, label in field_mapping.items():
        value = llm_output.get(field)
        if not value:
            continue
            
        # Handle lists (food_reference, preference)
        if isinstance(value, list):
            values = value
        else:
            values = [value]
        
        for v in values:
            if not v or not isinstance(v, str):
                continue
                
            # Find spans in text
            spans = find_entity_spans(text, v)
            
            if not spans:
                logger.debug(f"Could not find '{v}' in '{text}'")
                continue
            
            # Use first occurrence
            start, end = spans[0]
            entities.append({
                'start': start,
                'end': end,
                'label': label,
                'text': text[start:end]
            })
    
    # Sort by start position
    entities.sort(key=lambda x: x['start'])
    
    # Remove overlapping entities (keep longer ones)
    filtered = []
    for entity in entities:
        overlaps = False
        for existing in filtered:
            if (entity['start'] < existing['end'] and entity['end'] > existing['start']):
                # Overlap detected
                if entity['end'] - entity['start'] > existing['end'] - existing['start']:
                    # New entity is longer, replace
                    filtered.remove(existing)
                else:
                    overlaps = True
                break
        
        if not overlaps:
            filtered.append(entity)
    
    return filtered


def validate_example(example: Dict) -> Tuple[bool, str]:
    """Validate a training example"""
    
    text = example.get('text', '')
    entities = example.get('entities', [])
    
    if not text or len(text) < 3:
        return False, "Text too short"
    
    if len(text) > 256:
        return False, "Text too long"
    
    # Check entity spans are valid
    for entity in entities:
        start = entity.get('start', -1)
        end = entity.get('end', -1)
        label = entity.get('label', '')
        
        if start < 0 or end < 0 or start >= end:
            return False, f"Invalid span: {start}-{end}"
        
        if end > len(text):
            return False, f"Span exceeds text length: {end} > {len(text)}"
        
        if label not in ['FOOD', 'STORE', 'QTY', 'LOC', 'PREF']:
            return False, f"Invalid label: {label}"
    
    # Check for overlapping entities
    sorted_entities = sorted(entities, key=lambda x: x['start'])
    for i in range(len(sorted_entities) - 1):
        if sorted_entities[i]['end'] > sorted_entities[i+1]['start']:
            return False, "Overlapping entities"
    
    return True, "Valid"


def deduplicate_hash(text: str, entities: List[Dict]) -> str:
    """Create hash for deduplication"""
    entity_str = json.dumps(sorted(
        [{'start': e['start'], 'end': e['end'], 'label': e['label']} for e in entities],
        key=lambda x: x['start']
    ))
    content = f"{text.lower().strip()}|{entity_str}"
    return hashlib.md5(content.encode()).hexdigest()


# ============================================================================
# DATA COLLECTION
# ============================================================================
class NERDataCollector:
    """Collects and manages NER training data"""
    
    def __init__(self, data_dir: str = DATA_DIR):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        self.raw_file = self.data_dir / "raw_examples.jsonl"
        self.validated_file = self.data_dir / "validated_training.jsonl"
        self.stats_file = self.data_dir / "collection_stats.json"
        
        self.seen_hashes = set()
        self._load_seen_hashes()
        
    def _load_seen_hashes(self):
        """Load hashes of existing examples for deduplication"""
        if self.validated_file.exists():
            with open(self.validated_file, 'r') as f:
                for line in f:
                    try:
                        example = json.loads(line.strip())
                        h = deduplicate_hash(example['text'], example['entities'])
                        self.seen_hashes.add(h)
                    except:
                        pass
        logger.info(f"Loaded {len(self.seen_hashes)} existing examples for deduplication")
    
    def add_from_llm(self, text: str, llm_output: Dict, source: str = "llm") -> bool:
        """
        Add training example from LLM extraction output
        
        Args:
            text: Original user message
            llm_output: LLM extraction result with store_reference, food_reference, etc.
            source: Source identifier (e.g., "llm_groq", "manual")
        
        Returns:
            True if example was added (not duplicate), False otherwise
        """
        # Convert LLM output to entity spans
        entities = entities_from_llm_output(text, llm_output)
        
        if not entities:
            logger.debug(f"No valid entities found in: {text}")
            return False
        
        example = {
            'text': text,
            'entities': entities,
            'source': source,
            'timestamp': datetime.now().isoformat()
        }
        
        # Validate
        is_valid, reason = validate_example(example)
        if not is_valid:
            logger.debug(f"Invalid example ({reason}): {text}")
            return False
        
        # Deduplication
        h = deduplicate_hash(text, entities)
        if h in self.seen_hashes:
            logger.debug(f"Duplicate example: {text}")
            return False
        
        # Save raw example
        with open(self.raw_file, 'a') as f:
            f.write(json.dumps(example, ensure_ascii=False) + '\n')
        
        self.seen_hashes.add(h)
        return True
    
    def add_validated(self, text: str, entities: List[Dict], source: str = "manual") -> bool:
        """Add a manually validated example"""
        
        example = {
            'text': text,
            'entities': entities,
            'source': source,
            'timestamp': datetime.now().isoformat()
        }
        
        is_valid, reason = validate_example(example)
        if not is_valid:
            raise ValueError(f"Invalid example: {reason}")
        
        h = deduplicate_hash(text, entities)
        if h in self.seen_hashes:
            return False
        
        with open(self.validated_file, 'a') as f:
            f.write(json.dumps(example, ensure_ascii=False) + '\n')
        
        self.seen_hashes.add(h)
        return True
    
    def validate_and_migrate_raw(self, min_confidence: float = 0.8) -> Dict:
        """
        Move high-confidence raw examples to validated set
        
        Args:
            min_confidence: Minimum required entity detection confidence
        
        Returns:
            Stats about migration
        """
        stats = {'migrated': 0, 'skipped': 0, 'total': 0}
        
        if not self.raw_file.exists():
            return stats
        
        # Read all raw examples
        raw_examples = []
        with open(self.raw_file, 'r') as f:
            for line in f:
                try:
                    raw_examples.append(json.loads(line.strip()))
                except:
                    pass
        
        stats['total'] = len(raw_examples)
        
        # Migrate high-confidence ones
        for example in raw_examples:
            # Check confidence if available
            confidence = example.get('confidence', 1.0)
            if confidence < min_confidence:
                stats['skipped'] += 1
                continue
            
            # Re-validate
            is_valid, _ = validate_example(example)
            if not is_valid:
                stats['skipped'] += 1
                continue
            
            h = deduplicate_hash(example['text'], example['entities'])
            if h in self.seen_hashes:
                stats['skipped'] += 1
                continue
            
            with open(self.validated_file, 'a') as f:
                f.write(json.dumps(example, ensure_ascii=False) + '\n')
            
            self.seen_hashes.add(h)
            stats['migrated'] += 1
        
        logger.info(f"Migrated {stats['migrated']} examples, skipped {stats['skipped']}")
        return stats
    
    def get_stats(self) -> Dict:
        """Get collection statistics"""
        raw_count = 0
        validated_count = 0
        label_counts = {}
        sources = {}
        
        if self.raw_file.exists():
            with open(self.raw_file, 'r') as f:
                raw_count = sum(1 for _ in f)
        
        if self.validated_file.exists():
            with open(self.validated_file, 'r') as f:
                for line in f:
                    try:
                        example = json.loads(line.strip())
                        validated_count += 1
                        
                        # Count labels
                        for entity in example.get('entities', []):
                            label = entity.get('label', 'UNKNOWN')
                            label_counts[label] = label_counts.get(label, 0) + 1
                        
                        # Count sources
                        source = example.get('source', 'unknown')
                        sources[source] = sources.get(source, 0) + 1
                    except:
                        pass
        
        return {
            'raw_examples': raw_count,
            'validated_examples': validated_count,
            'unique_examples': len(self.seen_hashes),
            'label_counts': label_counts,
            'sources': sources
        }
    
    def export_for_training(self, output_file: str = None) -> str:
        """Export validated data in training format"""
        
        if output_file is None:
            output_file = str(self.data_dir / "training_data.json")
        
        examples = []
        
        if self.validated_file.exists():
            with open(self.validated_file, 'r') as f:
                for line in f:
                    try:
                        example = json.loads(line.strip())
                        examples.append({
                            'text': example['text'],
                            'entities': [
                                {'start': e['start'], 'end': e['end'], 'label': e['label']}
                                for e in example['entities']
                            ]
                        })
                    except:
                        pass
        
        with open(output_file, 'w') as f:
            json.dump(examples, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Exported {len(examples)} examples to {output_file}")
        return output_file


# ============================================================================
# SAMPLE DATA GENERATOR
# ============================================================================
def generate_bootstrap_data() -> List[Dict]:
    """Generate initial training examples"""
    
    examples = [
        # Hindi + Store + Food
        {
            "text": "tushar misal hai",
            "entities": [
                {"start": 0, "end": 6, "label": "STORE"},
                {"start": 7, "end": 12, "label": "FOOD"}
            ]
        },
        {
            "text": "mujhe biryani chahiye inayat cafe se",
            "entities": [
                {"start": 6, "end": 13, "label": "FOOD"},
                {"start": 22, "end": 33, "label": "STORE"}
            ]
        },
        {
            "text": "hotel shree se dahi vada do",
            "entities": [
                {"start": 0, "end": 11, "label": "STORE"},
                {"start": 15, "end": 24, "label": "FOOD"}
            ]
        },
        
        # English patterns
        {
            "text": "do you have pizza",
            "entities": [
                {"start": 12, "end": 17, "label": "FOOD"}
            ]
        },
        {
            "text": "i want to order chicken biryani from kfc",
            "entities": [
                {"start": 16, "end": 31, "label": "FOOD"},
                {"start": 37, "end": 40, "label": "STORE"}
            ]
        },
        
        # Quantities
        {
            "text": "2 plate misal and 1 chai",
            "entities": [
                {"start": 0, "end": 1, "label": "QTY"},
                {"start": 8, "end": 13, "label": "FOOD"},
                {"start": 18, "end": 19, "label": "QTY"},
                {"start": 20, "end": 24, "label": "FOOD"}
            ]
        },
        {
            "text": "do plate misal lao",
            "entities": [
                {"start": 0, "end": 2, "label": "QTY"},
                {"start": 9, "end": 14, "label": "FOOD"}
            ]
        },
        
        # Preferences
        {
            "text": "mujhe spicy chicken chahiye",
            "entities": [
                {"start": 6, "end": 11, "label": "PREF"},
                {"start": 12, "end": 19, "label": "FOOD"}
            ]
        },
        {
            "text": "extra cheese pizza without onion",
            "entities": [
                {"start": 0, "end": 12, "label": "PREF"},
                {"start": 13, "end": 18, "label": "FOOD"},
                {"start": 19, "end": 32, "label": "PREF"}
            ]
        },
        
        # Location
        {
            "text": "send to sector 17 chandigarh",
            "entities": [
                {"start": 8, "end": 28, "label": "LOC"}
            ]
        },
        
        # Complex combinations
        {
            "text": "tushar ke yahan se 3 plate vada pav mangwao spicy wala",
            "entities": [
                {"start": 0, "end": 6, "label": "STORE"},
                {"start": 19, "end": 20, "label": "QTY"},
                {"start": 27, "end": 35, "label": "FOOD"},
                {"start": 44, "end": 54, "label": "PREF"}
            ]
        },
        
        # Menu items
        {
            "text": "margherita pizza large",
            "entities": [
                {"start": 0, "end": 16, "label": "FOOD"},
                {"start": 17, "end": 22, "label": "PREF"}
            ]
        },
        {
            "text": "paneer butter masala with garlic naan",
            "entities": [
                {"start": 0, "end": 20, "label": "FOOD"},
                {"start": 26, "end": 37, "label": "FOOD"}
            ]
        },
        
        # Hinglish
        {
            "text": "bhai ek cold coffee dena",
            "entities": [
                {"start": 5, "end": 7, "label": "QTY"},
                {"start": 8, "end": 19, "label": "FOOD"}
            ]
        },
        {
            "text": "samosa hai kya",
            "entities": [
                {"start": 0, "end": 6, "label": "FOOD"}
            ]
        },
        
        # More stores
        {
            "text": "dominos se order karo",
            "entities": [
                {"start": 0, "end": 7, "label": "STORE"}
            ]
        },
        {
            "text": "mcdonalds ka burger",
            "entities": [
                {"start": 0, "end": 9, "label": "STORE"},
                {"start": 13, "end": 19, "label": "FOOD"}
            ]
        },
        
        # 50+ More examples for better training
        {"text": "pizza hai kya", "entities": [{"start": 0, "end": 5, "label": "FOOD"}]},
        {"text": "biryani do", "entities": [{"start": 0, "end": 7, "label": "FOOD"}]},
        {"text": "chai lao", "entities": [{"start": 0, "end": 4, "label": "FOOD"}]},
        {"text": "coffee chahiye", "entities": [{"start": 0, "end": 6, "label": "FOOD"}]},
        {"text": "burger milega", "entities": [{"start": 0, "end": 6, "label": "FOOD"}]},
        {"text": "pasta order karo", "entities": [{"start": 0, "end": 5, "label": "FOOD"}]},
        {"text": "noodles lao", "entities": [{"start": 0, "end": 7, "label": "FOOD"}]},
        {"text": "momos chahiye", "entities": [{"start": 0, "end": 5, "label": "FOOD"}]},
        {"text": "dosa hai", "entities": [{"start": 0, "end": 4, "label": "FOOD"}]},
        {"text": "idli do", "entities": [{"start": 0, "end": 4, "label": "FOOD"}]},
        {"text": "vada pav", "entities": [{"start": 0, "end": 8, "label": "FOOD"}]},
        {"text": "pav bhaji", "entities": [{"start": 0, "end": 9, "label": "FOOD"}]},
        {"text": "chole bhature", "entities": [{"start": 0, "end": 13, "label": "FOOD"}]},
        {"text": "rajma chawal", "entities": [{"start": 0, "end": 12, "label": "FOOD"}]},
        {"text": "dal makhani", "entities": [{"start": 0, "end": 11, "label": "FOOD"}]},
        {"text": "butter chicken", "entities": [{"start": 0, "end": 14, "label": "FOOD"}]},
        {"text": "paneer tikka", "entities": [{"start": 0, "end": 12, "label": "FOOD"}]},
        {"text": "chicken tikka", "entities": [{"start": 0, "end": 13, "label": "FOOD"}]},
        {"text": "tandoori roti", "entities": [{"start": 0, "end": 13, "label": "FOOD"}]},
        {"text": "naan chahiye", "entities": [{"start": 0, "end": 4, "label": "FOOD"}]},
        {"text": "paratha do", "entities": [{"start": 0, "end": 7, "label": "FOOD"}]},
        {"text": "samosa lao", "entities": [{"start": 0, "end": 6, "label": "FOOD"}]},
        {"text": "kachori hai", "entities": [{"start": 0, "end": 7, "label": "FOOD"}]},
        {"text": "jalebi do", "entities": [{"start": 0, "end": 6, "label": "FOOD"}]},
        {"text": "gulab jamun", "entities": [{"start": 0, "end": 11, "label": "FOOD"}]},
        {"text": "rasmalai hai kya", "entities": [{"start": 0, "end": 8, "label": "FOOD"}]},
        
        # Store-focused examples
        {"text": "swiggy se order karo", "entities": [{"start": 0, "end": 6, "label": "STORE"}]},
        {"text": "zomato pe dekho", "entities": [{"start": 0, "end": 6, "label": "STORE"}]},
        {"text": "pizza hut se", "entities": [{"start": 0, "end": 9, "label": "STORE"}]},
        {"text": "subway ka sandwich", "entities": [{"start": 0, "end": 6, "label": "STORE"}, {"start": 10, "end": 18, "label": "FOOD"}]},
        {"text": "burger king se", "entities": [{"start": 0, "end": 11, "label": "STORE"}]},
        {"text": "starbucks coffee", "entities": [{"start": 0, "end": 9, "label": "STORE"}, {"start": 10, "end": 16, "label": "FOOD"}]},
        {"text": "cafe coffee day", "entities": [{"start": 0, "end": 15, "label": "STORE"}]},
        {"text": "haldiram se", "entities": [{"start": 0, "end": 8, "label": "STORE"}]},
        {"text": "bikanervala ka", "entities": [{"start": 0, "end": 11, "label": "STORE"}]},
        {"text": "sardarji dhaba", "entities": [{"start": 0, "end": 14, "label": "STORE"}]},
        {"text": "hotel taj se biryani", "entities": [{"start": 0, "end": 9, "label": "STORE"}, {"start": 13, "end": 20, "label": "FOOD"}]},
        {"text": "sharma dhaba se paratha", "entities": [{"start": 0, "end": 12, "label": "STORE"}, {"start": 16, "end": 23, "label": "FOOD"}]},
        
        # Quantity examples  
        {"text": "ek pizza", "entities": [{"start": 0, "end": 2, "label": "QTY"}, {"start": 3, "end": 8, "label": "FOOD"}]},
        {"text": "teen samosa", "entities": [{"start": 0, "end": 4, "label": "QTY"}, {"start": 5, "end": 11, "label": "FOOD"}]},
        {"text": "char chai", "entities": [{"start": 0, "end": 4, "label": "QTY"}, {"start": 5, "end": 9, "label": "FOOD"}]},
        {"text": "paanch plate", "entities": [{"start": 0, "end": 6, "label": "QTY"}]},
        {"text": "5 burger", "entities": [{"start": 0, "end": 1, "label": "QTY"}, {"start": 2, "end": 8, "label": "FOOD"}]},
        {"text": "10 momos", "entities": [{"start": 0, "end": 2, "label": "QTY"}, {"start": 3, "end": 8, "label": "FOOD"}]},
        {"text": "half plate biryani", "entities": [{"start": 0, "end": 10, "label": "QTY"}, {"start": 11, "end": 18, "label": "FOOD"}]},
        {"text": "full plate dal", "entities": [{"start": 0, "end": 10, "label": "QTY"}, {"start": 11, "end": 14, "label": "FOOD"}]},
        
        # Location examples
        {"text": "sector 22 mein bhejo", "entities": [{"start": 0, "end": 9, "label": "LOC"}]},
        {"text": "phase 7 mohali", "entities": [{"start": 0, "end": 14, "label": "LOC"}]},
        {"text": "chandigarh sector 17", "entities": [{"start": 0, "end": 20, "label": "LOC"}]},
        {"text": "gurgaon delivery", "entities": [{"start": 0, "end": 7, "label": "LOC"}]},
        {"text": "noida sector 62", "entities": [{"start": 0, "end": 15, "label": "LOC"}]},
        {"text": "dwarka mein", "entities": [{"start": 0, "end": 6, "label": "LOC"}]},
        
        # Preference examples
        {"text": "veg pizza", "entities": [{"start": 0, "end": 3, "label": "PREF"}, {"start": 4, "end": 9, "label": "FOOD"}]},
        {"text": "non veg biryani", "entities": [{"start": 0, "end": 7, "label": "PREF"}, {"start": 8, "end": 15, "label": "FOOD"}]},
        {"text": "extra spicy", "entities": [{"start": 0, "end": 11, "label": "PREF"}]},
        {"text": "less oil", "entities": [{"start": 0, "end": 8, "label": "PREF"}]},
        {"text": "no onion", "entities": [{"start": 0, "end": 8, "label": "PREF"}]},
        {"text": "with extra cheese", "entities": [{"start": 0, "end": 17, "label": "PREF"}]},
        {"text": "jain food", "entities": [{"start": 0, "end": 4, "label": "PREF"}, {"start": 5, "end": 9, "label": "FOOD"}]},
        {"text": "medium spicy", "entities": [{"start": 0, "end": 12, "label": "PREF"}]},
        
        # Complex combined examples
        {"text": "2 veg pizza from dominos", "entities": [{"start": 0, "end": 1, "label": "QTY"}, {"start": 2, "end": 5, "label": "PREF"}, {"start": 6, "end": 11, "label": "FOOD"}, {"start": 17, "end": 24, "label": "STORE"}]},
        {"text": "ek spicy chicken biryani hotel taj se", "entities": [{"start": 0, "end": 2, "label": "QTY"}, {"start": 3, "end": 8, "label": "PREF"}, {"start": 9, "end": 25, "label": "FOOD"}, {"start": 26, "end": 35, "label": "STORE"}]},
        {"text": "mujhe tushar se 3 plate misal spicy wala chahiye", "entities": [{"start": 6, "end": 12, "label": "STORE"}, {"start": 16, "end": 17, "label": "QTY"}, {"start": 24, "end": 29, "label": "FOOD"}, {"start": 30, "end": 40, "label": "PREF"}]},
        {"text": "sharma dhaba se butter chicken with naan deliver to sector 17", "entities": [{"start": 0, "end": 12, "label": "STORE"}, {"start": 16, "end": 30, "label": "FOOD"}, {"start": 36, "end": 40, "label": "FOOD"}, {"start": 52, "end": 61, "label": "LOC"}]},
        {"text": "3 plate veg momos extra spicy from wow momos gurgaon", "entities": [{"start": 0, "end": 1, "label": "QTY"}, {"start": 8, "end": 11, "label": "PREF"}, {"start": 12, "end": 17, "label": "FOOD"}, {"start": 18, "end": 29, "label": "PREF"}, {"start": 35, "end": 44, "label": "STORE"}, {"start": 45, "end": 52, "label": "LOC"}]},
        
        # Common Hindi patterns
        {"text": "yahan pizza milega", "entities": [{"start": 6, "end": 11, "label": "FOOD"}]},
        {"text": "kuch khane ko de do", "entities": []},
        {"text": "menu dikhao", "entities": []},
        {"text": "kya hai aapke paas", "entities": []},
        {"text": "biryani kitne ki hai", "entities": [{"start": 0, "end": 7, "label": "FOOD"}]},
        {"text": "pizza ka rate kya hai", "entities": [{"start": 0, "end": 5, "label": "FOOD"}]},
        {"text": "tushar wala misal", "entities": [{"start": 0, "end": 6, "label": "STORE"}, {"start": 12, "end": 17, "label": "FOOD"}]},
        {"text": "woh pizza jo kal khaya tha", "entities": [{"start": 4, "end": 9, "label": "FOOD"}]},
    ]
    
    return examples


# ============================================================================
# FASTAPI ENDPOINTS (for admin dashboard) - Only loaded when serving
# ============================================================================
def create_api():
    """Create FastAPI app - import FastAPI only when needed"""
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel as PydanticModel
    
    api = FastAPI(
        title="NER Data Collector API",
        description="Collect and manage NER training data",
        version="1.0.0"
    )

    api_collector = NERDataCollector()

    class LLMExtractionInput(PydanticModel):
        text: str
        llm_output: Dict
        source: str = "llm_groq"

    class ManualAnnotationInput(PydanticModel):
        text: str
        entities: List[Dict]

    @api.post("/collect/llm")
    async def collect_from_llm(data: LLMExtractionInput):
        """Collect training example from LLM extraction"""
        added = api_collector.add_from_llm(data.text, data.llm_output, data.source)
        return {"added": added, "text": data.text}

    @api.post("/collect/manual")
    async def collect_manual(data: ManualAnnotationInput):
        """Add manually annotated example"""
        try:
            added = api_collector.add_validated(data.text, data.entities)
            return {"added": added, "text": data.text}
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    @api.get("/stats")
    async def get_stats():
        """Get collection statistics"""
        return api_collector.get_stats()

    @api.post("/migrate")
    async def migrate_raw(min_confidence: float = 0.8):
        """Migrate high-confidence raw examples to validated set"""
        stats = api_collector.validate_and_migrate_raw(min_confidence)
        return stats

    @api.post("/export")
    async def export_training_data():
        """Export validated data for training"""
        output_file = api_collector.export_for_training()
        stats = api_collector.get_stats()
        return {
            "output_file": output_file,
            "examples": stats['validated_examples']
        }

    @api.post("/bootstrap")
    async def bootstrap_data():
        """Add bootstrap training examples"""
        examples = generate_bootstrap_data()
        added = 0
        for ex in examples:
            if api_collector.add_validated(ex['text'], ex['entities'], source='bootstrap'):
                added += 1
        return {"added": added, "total": len(examples)}
    
    return api


# ============================================================================
# CLI
# ============================================================================
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="NER Training Data Collector")
    parser.add_argument('command', choices=['stats', 'bootstrap', 'export', 'migrate', 'serve'])
    parser.add_argument('--port', type=int, default=7012, help='API server port')
    parser.add_argument('--data-dir', type=str, default=DATA_DIR, help='Data directory')
    
    args = parser.parse_args()
    
    collector = NERDataCollector(args.data_dir)
    
    if args.command == 'stats':
        stats = collector.get_stats()
        print(json.dumps(stats, indent=2))
        
    elif args.command == 'bootstrap':
        examples = generate_bootstrap_data()
        added = 0
        for ex in examples:
            if collector.add_validated(ex['text'], ex['entities'], source='bootstrap'):
                added += 1
        print(f"Added {added}/{len(examples)} bootstrap examples")
        
    elif args.command == 'export':
        output_file = collector.export_for_training()
        print(f"Exported to: {output_file}")
        
    elif args.command == 'migrate':
        stats = collector.validate_and_migrate_raw()
        print(json.dumps(stats, indent=2))
        
    elif args.command == 'serve':
        import uvicorn
        api = create_api()
        print(f"Starting data collector API on port {args.port}")
        uvicorn.run(api, host="0.0.0.0", port=args.port)
