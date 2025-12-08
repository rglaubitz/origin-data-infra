"""
Migrate data from Google Sheets to Supabase.

Usage:
    uv run python scripts/migrate_sheets_to_supabase.py

Prerequisites:
    1. Run supabase/migrations/001_initial_schema.sql in Supabase Dashboard
    2. Ensure .env has all credentials configured
"""

import json
import os
import re
from datetime import datetime

import gspread
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

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
    """Initialize Supabase client with service role key."""
    url = os.environ["SUPABASE_URL"]
    # Use service role key for full access (bypasses RLS)
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def parse_amount(amount_str: str) -> float:
    """Parse amount string like '-$924.99' to float."""
    if not amount_str:
        return 0.0
    # Remove $, commas, and handle negative
    cleaned = re.sub(r"[$,]", "", str(amount_str))
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def parse_txn_count(count_str: str | int) -> int:
    """Parse txn count like '100+' to int."""
    if not count_str:
        return 0
    if isinstance(count_str, int):
        return count_str
    # Remove non-numeric chars like '+'
    cleaned = re.sub(r"[^\d]", "", str(count_str))
    try:
        return int(cleaned) if cleaned else 0
    except ValueError:
        return 0


def now_utc() -> str:
    """Get current UTC time as ISO string."""
    return datetime.now(tz=None).astimezone().isoformat()


def parse_date(date_str: str) -> str | None:
    """Parse date string to ISO format."""
    if not date_str:
        return None
    try:
        # Try common formats
        for fmt in ["%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"]:
            try:
                return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        return None
    except Exception:
        return None


def migrate_merchant_rules(gc: gspread.Client, supabase, sheet_id: str) -> int:
    """Migrate Merchant Rules sheet to Supabase."""
    console.print("\n[bold blue]Migrating Merchant Rules...[/bold blue]")

    sh = gc.open_by_key(sheet_id)
    ws = sh.worksheet("Merchant Rules")
    records = ws.get_all_records()

    migrated = 0
    errors = 0

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Processing...", total=len(records))

        for i, row in enumerate(records, start=2):  # Start at 2 (row 1 is header)
            merchant = row.get("Merchant", "").strip()
            if not merchant:
                progress.advance(task)
                continue

            data = {
                "merchant": merchant,
                "entity_default": row.get("Current Entity", "NEEDS REVIEW") or "NEEDS REVIEW",
                "origin_qb_account": row.get("Origin QBO Account") or None,
                "openhaul_qb_account": row.get("OpenHaul QBO Account") or None,
                "notes": row.get("Notes") or None,
                "txn_count": parse_txn_count(row.get("Txn Count", 0)),
                "sheets_row_id": i,
                "sheets_synced_at": now_utc(),
            }

            try:
                supabase.table("merchant_rules").upsert(data, on_conflict="merchant").execute()
                migrated += 1
            except Exception as e:
                errors += 1
                if errors <= 5:  # Only show first 5 errors
                    console.print(f"[red]Error on row {i}: {e}[/red]")

            progress.advance(task)

    console.print(f"[green]Migrated {migrated} merchant rules[/green]")
    if errors:
        console.print(f"[yellow]Errors: {errors}[/yellow]")
    return migrated


def migrate_merchant_aliases(gc: gspread.Client, supabase, sheet_id: str) -> int:
    """Migrate Merchant Alias sheet to Supabase."""
    console.print("\n[bold blue]Migrating Merchant Aliases...[/bold blue]")

    sh = gc.open_by_key(sheet_id)
    ws = sh.worksheet("Merchant Alias")
    records = ws.get_all_records()

    migrated = 0
    errors = 0

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Processing...", total=len(records))

        for row in records:
            raw_merchant = row.get("Raw Merchant", "").strip()
            std_merchant = row.get("Std Merchant", "").strip()

            if not raw_merchant or not std_merchant:
                progress.advance(task)
                continue

            data = {
                "raw_merchant": raw_merchant,
                "std_merchant": std_merchant,
                "source": row.get("Source") or None,
                "notes": row.get("Notes") or None,
            }

            try:
                # Use raw SQL for upsert on expression index
                supabase.table("merchant_aliases").insert(data).execute()
                migrated += 1
            except Exception as e:
                # Likely duplicate, skip
                if "duplicate" not in str(e).lower():
                    errors += 1
                    if errors <= 5:
                        console.print(f"[red]Error: {e}[/red]")

            progress.advance(task)

    console.print(f"[green]Migrated {migrated} merchant aliases[/green]")
    if errors:
        console.print(f"[yellow]Errors: {errors}[/yellow]")
    return migrated


def migrate_transactions(gc: gspread.Client, supabase, sheet_id: str) -> int:
    """Migrate All Transactions sheet to Supabase."""
    console.print("\n[bold blue]Migrating Transactions...[/bold blue]")

    sh = gc.open_by_key(sheet_id)
    ws = sh.worksheet("All Transactions")
    records = ws.get_all_records()

    migrated = 0
    errors = 0
    batch = []
    batch_size = 100

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Processing...", total=len(records))

        for i, row in enumerate(records, start=2):
            date_str = row.get("Date", "")
            date = parse_date(date_str)

            if not date:
                progress.advance(task)
                continue

            amount = parse_amount(row.get("Amount", "0"))

            data = {
                "date": date,
                "raw_merchant": row.get("Raw Merchant") or None,
                "merchant": row.get("Std Merchant") or row.get("Raw Merchant") or None,
                "amount": amount,
                "entity": row.get("Entity", "NEEDS REVIEW") or "NEEDS REVIEW",
                "qb_account": row.get("QB Account") or None,
                "status": row.get("Status", "⚠️") or "⚠️",
                "source_account": row.get("Account Used") or None,
                "card_number": str(row.get("Card #", "")) or None,
                "notes": row.get("Notes") or None,
                "sheets_row_id": i,
                "sheets_synced_at": now_utc(),
            }

            batch.append(data)

            # Insert in batches
            if len(batch) >= batch_size:
                try:
                    supabase.table("transactions").insert(batch).execute()
                    migrated += len(batch)
                except Exception as e:
                    errors += len(batch)
                    console.print(f"[red]Batch error: {e}[/red]")
                batch = []

            progress.advance(task)

        # Insert remaining
        if batch:
            try:
                supabase.table("transactions").insert(batch).execute()
                migrated += len(batch)
            except Exception as e:
                errors += len(batch)
                console.print(f"[red]Final batch error: {e}[/red]")

    console.print(f"[green]Migrated {migrated} transactions[/green]")
    if errors:
        console.print(f"[yellow]Errors: {errors}[/yellow]")
    return migrated


def verify_migration(supabase) -> None:
    """Verify migration counts."""
    console.print("\n[bold blue]Verification:[/bold blue]")

    rules = supabase.table("merchant_rules").select("id", count="exact").execute()
    console.print(f"  Merchant Rules: {rules.count}")

    aliases = supabase.table("merchant_aliases").select("id", count="exact").execute()
    console.print(f"  Merchant Aliases: {aliases.count}")

    txns = supabase.table("transactions").select("id", count="exact").execute()
    console.print(f"  Transactions: {txns.count}")

    # Sample query
    console.print("\n[bold blue]Sample Query - Transactions by Entity:[/bold blue]")
    sample = supabase.table("transactions").select("entity").execute()
    entity_counts: dict[str, int] = {}
    for row in sample.data:
        entity = row.get("entity", "Unknown")
        entity_counts[entity] = entity_counts.get(entity, 0) + 1

    for entity, count in sorted(entity_counts.items(), key=lambda x: -x[1]):
        console.print(f"  {entity}: {count}")


def main() -> None:
    """Run migration."""
    console.print("[bold green]Origin Transport Data Migration[/bold green]")
    console.print("=" * 50)

    # Verify env vars
    required = [
        "GOOGLE_SERVICE_ACCOUNT_JSON",
        "GOOGLE_SHEET_ID",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
    ]
    missing = [v for v in required if not os.environ.get(v)]
    if missing:
        console.print(f"[red]Missing env vars: {missing}[/red]")
        return

    sheet_id = os.environ["GOOGLE_SHEET_ID"]
    console.print(f"Sheet ID: {sheet_id}")

    # Initialize clients
    gc = get_sheets_client()
    supabase = get_supabase_client()

    # Run migrations
    migrate_merchant_rules(gc, supabase, sheet_id)
    migrate_merchant_aliases(gc, supabase, sheet_id)
    migrate_transactions(gc, supabase, sheet_id)

    # Verify
    verify_migration(supabase)

    console.print("\n[bold green]Migration complete![/bold green]")


if __name__ == "__main__":
    main()
