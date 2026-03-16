"""
Remove non-fiction entries from literary_places.json.

Identifies entries that are clearly not fiction (government reports, census data,
academic studies, biographies of real people, reference works) while preserving
literary works that happen to have nonfiction-adjacent genres (literary memoir,
creative nonfiction, poetry collections, plays).

Usage:
  python -m backend.data.clean_nonfiction --dry-run   # preview
  python -m backend.data.clean_nonfiction              # apply
"""

import json
import argparse
import re
from pathlib import Path

DATA_PATH = Path(__file__).parent / "generated" / "literary_places.json"

FICTION_GENRES = {
    'literary fiction', 'historical fiction', 'mystery', 'crime',
    'romance', 'thriller', 'horror', 'fantasy', 'satire',
    'short stories', 'magical realism', 'science fiction',
    'young adult', 'postcolonial', 'political fiction', "children's",
}

NONFICTION_TITLE_PATTERNS = [
    r'\breport\b', r'\bsurvey\b', r'\bcensus\b', r'\bgazetteer\b',
    r'\bmanual\b', r'\bhandbook\b', r'\bencyclopedia\b', r'\batlas\b',
    r'\badministration\b', r'\bhistory of\b', r'\ba history\b',
    r'\bcastes and tribes\b', r'\bpopulation\b', r'\bsocio-ecological\b',
    r'\bskill survey\b', r'\barea skill\b', r'\bhealth officer\b',
    r'\bmedical officer\b', r'\btax administration\b',
    r'\bdistrict gazetteer\b', r'\bdistrict manual\b',
    r'\bforestry\b', r'\bprison manual\b', r'\brevenue\b',
    r'\bcommission of enquiry\b', r'\bcommission of inquiry\b',
    r'\bmaradumaśumārī\b', r'\bfertility and mortality\b',
]

NONFICTION_DESC_PATTERNS = [
    r'traditions, characteristics\s+and\s+behavi',
    r'this (?:book|volume|study|report) (?:examines|explores|documents|provides)',
    r'a (?:comprehensive|scholarly|detailed) (?:study|analysis|account|survey)',
    r'government\s+(?:report|publication|document)',
]

KEEP_TITLES = {
    'a lady cyclist\'s guide to kashgar',
    'digital fortress',
    'pygmalion',
    'an atlas of impossible longing',
    'the nature lover\'s guide to survival',
    'the patna manual of style',
    'the wind-up bird chronicle',
}

KEEP_AUTHORS = {
    'dan brown', 'george bernard shaw', 'anuradha roy',
    'suzanne joinson',
}


def is_nonfiction(place: dict) -> tuple[bool, str]:
    title = place.get('bookTitle', '').lower()
    author = place.get('author', '').lower()
    genres = set(place.get('genres', []))
    passage = (place.get('passage', '') or '').lower()

    if title in KEEP_TITLES or author in KEEP_AUTHORS:
        return False, ''

    has_fiction_genre = bool(genres & FICTION_GENRES - {'literary fiction'})
    if has_fiction_genre:
        return False, ''

    for pattern in NONFICTION_TITLE_PATTERNS:
        if re.search(pattern, title, re.IGNORECASE):
            return True, f'title matches: {pattern}'

    for pattern in NONFICTION_DESC_PATTERNS:
        if re.search(pattern, passage, re.IGNORECASE):
            return True, f'description matches: {pattern}'

    only_nf_genres = all(g in ('biography', 'memoir', 'social realism', 'essay') for g in genres)
    if only_nf_genres and genres:
        if 'biography' in genres:
            return True, 'pure biography'
        if genres == {'social realism'}:
            return True, 'pure social realism (likely nonfiction)'
        if genres == {'memoir'}:
            return True, 'pure memoir'
        if genres == {'essay'}:
            return True, 'pure essay/nonfiction'

    if 'autobiography' in title:
        return True, 'autobiography in title'

    return False, ''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    with open(DATA_PATH) as f:
        data = json.load(f)

    places = data['places']
    removed = []
    kept = []

    for p in places:
        is_nf, reason = is_nonfiction(p)
        if is_nf:
            removed.append((p, reason))
        else:
            kept.append(p)

    print(f'Total entries: {len(places)}')
    print(f'Removed (non-fiction): {len(removed)}')
    print(f'Kept: {len(kept)}')
    print()

    if removed:
        print('Removed entries:')
        for p, reason in removed:
            print(f'  [{p.get("source", "?")}] "{p["bookTitle"]}" by {p["author"]}')
            print(f'    Reason: {reason} | Genres: {p["genres"]}')
        print()

    if not args.dry_run:
        data['places'] = kept
        data['version'] = '0.7.0'
        data['nonfiction_cleaned'] = True
        with open(DATA_PATH, 'w') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f'Wrote {len(kept)} places to {DATA_PATH}')
    else:
        print('Dry run, no changes written.')


if __name__ == '__main__':
    main()
