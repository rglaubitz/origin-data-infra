# Supabase Python Client (supabase-py)

> Source: https://supabase.com/docs/reference/python/introduction

## Overview

Python library for interacting with Supabase:

- Postgres database operations
- Listen to database changes (realtime)
- Invoke Deno Edge Functions
- User authentication
- File storage

## Installation

```bash
pip install supabase
```

## API Keys (2025)

Supabase now uses new key formats:

| Type        | Format               | Use                             |
| ----------- | -------------------- | ------------------------------- |
| Publishable | `sb_publishable_...` | Client-side (safe to expose)    |
| Secret      | `sb_secret_...`      | Server-side only (bypasses RLS) |

The old JWT-based `anon` and `service_role` keys are deprecated.

## Basic Usage

```python
import os
from supabase import create_client, Client

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_PUBLISHABLE_KEY"]  # or SUPABASE_SECRET_KEY for admin
supabase: Client = create_client(url, key)

# Query data
response = supabase.table("users").select("*").execute()

# Insert data
response = supabase.table("users").insert({"name": "John"}).execute()

# Update data
response = supabase.table("users").update({"name": "Jane"}).eq("id", 1).execute()

# Delete data
response = supabase.table("users").delete().eq("id", 1).execute()
```

## Edge Functions

Invoke Deno Edge Functions from Python:

```python
response = supabase.functions.invoke("function-name", invoke_options={
    "body": {"key": "value"}
})
```

## Authentication

```python
# Sign up
response = supabase.auth.sign_up({"email": "user@example.com", "password": "password"})

# Sign in
response = supabase.auth.sign_in_with_password({"email": "user@example.com", "password": "password"})

# Sign out
supabase.auth.sign_out()
```

## Storage

```python
# Upload file
with open("file.txt", "rb") as f:
    supabase.storage.from_("bucket").upload("path/file.txt", f)

# Download file
response = supabase.storage.from_("bucket").download("path/file.txt")

# Get public URL
url = supabase.storage.from_("bucket").get_public_url("path/file.txt")
```

## Resources

- [GitHub: supabase/supabase-py](https://github.com/supabase/supabase-py)
- [Official Docs](https://supabase.com/docs/reference/python/introduction)
