import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Missing credentials")
    exit(1)

client = create_client(SUPABASE_URL, SUPABASE_KEY)

# We use the REST API to execute raw SQL, but sometimes it doesn't support raw DDL directly via rpc.
# Let's see if we can just create the table via a POST to Postgres or just output the SQL for the user.
sql = """
CREATE TABLE IF NOT EXISTS public.contributions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    book_title TEXT NOT NULL,
    author TEXT NOT NULL,
    publish_year INTEGER,
    place_name TEXT NOT NULL,
    coordinates FLOAT[] NOT NULL,
    passage TEXT NOT NULL,
    themes TEXT[] NOT NULL,
    language TEXT DEFAULT 'English',
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note: In a real production environment, we would also add PostGIS geometry columns if needed,
-- but a float array coordinates field is sufficient for the pending admin review queue.
"""

print("Please run this SQL in your Supabase SQL Editor to create the contributions table:")
print("--------------------------------------------------")
print(sql)
print("--------------------------------------------------")
