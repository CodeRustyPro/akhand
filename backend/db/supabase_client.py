"""
Supabase client for Akhand.

Usage:
    from backend.db.supabase_client import get_supabase
    supabase = get_supabase()
"""

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


def get_supabase(use_service_role: bool = False):
    """Get a Supabase client instance."""
    try:
        from supabase import create_client, Client
    except ImportError:
        raise ImportError("Install supabase: pip install supabase")

    if not SUPABASE_URL:
        raise ValueError("Set SUPABASE_URL in .env")

    key = SUPABASE_SERVICE_KEY if use_service_role else SUPABASE_ANON_KEY
    if not key:
        raise ValueError(
            "Set SUPABASE_ANON_KEY or SUPABASE_SERVICE_KEY in .env"
        )

    return create_client(SUPABASE_URL, key)


def get_supabase_anon():
    """Get a Supabase client with anon key (for read-only public access)."""
    return get_supabase(use_service_role=False)


def get_supabase_admin():
    """Get a Supabase client with service role key (for writes)."""
    return get_supabase(use_service_role=True)
