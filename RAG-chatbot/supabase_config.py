import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Retrieve Supabase credentials
SUPABASE_URL = os.getenv("REGENX_SUPABASE_URL")
SUPABASE_KEY = os.getenv("REGENX_SERVICE_ROLE_KEY")

# Ensure credentials are available
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("⚠️ Missing Supabase credentials. Check your .env file.")

# Initialize Supabase Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
