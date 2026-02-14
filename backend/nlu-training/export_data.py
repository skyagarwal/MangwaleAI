#!/usr/bin/env python3
"""
Export Training Data from Database
===================================
Exports approved training samples from PostgreSQL to JSONL format.
"""

import os
import json
import argparse
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/mangwale')

def export_training_data(output_file: str, status: str = 'approved', min_confidence: float = 0.7):
    """Export training data from database to JSONL file"""
    
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    query = """
        SELECT text, intent, entities, confidence, status
        FROM nlu_training_data
        WHERE status IN ('approved', 'auto_approved')
        AND confidence >= %s
        ORDER BY created_at DESC
    """
    
    cursor.execute(query, (min_confidence,))
    rows = cursor.fetchall()
    
    print(f"Found {len(rows)} training samples")
    
    with open(output_file, 'w', encoding='utf-8') as f:
        for row in rows:
            sample = {
                'text': row['text'],
                'intent': row['intent'],
                'entities': row.get('entities', [])
            }
            f.write(json.dumps(sample, ensure_ascii=False) + '\n')
    
    cursor.close()
    conn.close()
    
    print(f"Exported to {output_file}")
    return len(rows)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Export NLU training data')
    parser.add_argument('--output', '-o', default='/training-data/nlu_training_data.jsonl',
                       help='Output JSONL file path')
    parser.add_argument('--min-confidence', type=float, default=0.7,
                       help='Minimum confidence threshold')
    
    args = parser.parse_args()
    export_training_data(args.output, min_confidence=args.min_confidence)
