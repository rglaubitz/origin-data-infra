"""
Sync computed fields from Supabase back to Google Sheets.

Usage:
    uv run python scripts/sync_to_sheets.py

Can be scheduled with cron:
    */2 * * * * cd /path/to/project && uv run python scripts/sync_to_sheets.py
"""

import json
import os

import gspread
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials
from rich.console import Console

from supabase import create_client

load_dotenv()
console = Console()


def get_sheets_client() -> gspread.Client:
    """Initialize Google Sheets client."""
    sa_json = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
    creds = Credentials.from_service_account_info(
        sa_json,
        scopes=[
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
        ],
    )
    return gspread.authorize(creds)


def get_supabase_client():
    """Initialize Supabase client."""
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def sync_to_sheets():
    """Sync dirty rows from Supabase to Sheets."""
    console.print("[blue]Syncing Supabase → Sheets...[/blue]")

    sb = get_supabase_client()
    gc = get_sheets_client()
    sheet_id = os.environ["GOOGLE_SHEET_ID"]

    # Get dirty transactions (computed fields changed, not synced back)
    result = (
        sb.table("transactions")
        .select("id, sheets_row_id, status, qb_account")
        .is_("sheets_synced_at", "null")
        .not_.is_("sheets_row_id", "null")
        .limit(100)
        .execute()
    )

    if not result.data:
        console.print("[dim]No dirty rows to sync[/dim]")
        return 0

    console.print(f"[yellow]Found {len(result.data)} rows to sync[/yellow]")

    # Open sheet
    sh = gc.open_by_key(sheet_id)
    ws = sh.worksheet("All Transactions")

    # Build batch updates
    synced_ids = []
    batch_updates = []

    for row in result.data:
        sheets_row = row["sheets_row_id"]
        status = row["status"] or ""
        qb_account = row["qb_account"] or ""

        # Queue updates for Status (column A) and QB Account (column F)
        batch_updates.append({"range": f"A{sheets_row}", "values": [[status]]})
        batch_updates.append({"range": f"F{sheets_row}", "values": [[qb_account]]})

        synced_ids.append(row["id"])
        console.print(f"  Row {sheets_row}: status={status}, qb_account={qb_account}")

    # Execute batch update
    if batch_updates:
        ws.batch_update(batch_updates)

    # Mark as synced
    if synced_ids:
        from datetime import datetime

        sb.table("transactions").update({"sheets_synced_at": datetime.now().isoformat()}).in_(
            "id", synced_ids
        ).execute()

    console.print(f"[green]Synced {len(synced_ids)} rows[/green]")
    return len(synced_ids)


if __name__ == "__main__":
    sync_to_sheets()
