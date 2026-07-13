import csv
import io
from datetime import date, datetime
from uuid import UUID

from openpyxl import Workbook

CUSTOMERS_COLUMNS = ["id", "full_name", "phone", "stage", "responsible_user_id", "created_at", "updated_at"]
SALES_COLUMNS = [
    "id",
    "customer_id",
    "catalog_category_id",
    "responsible_user_id",
    "currency",
    "price_amount",
    "deadline",
    "status",
    "created_at",
]
FINANCE_COLUMNS = ["id", "sale_id", "customer_id", "entry_type", "amount", "currency", "description", "created_at"]
CALLS_COLUMNS = [
    "id",
    "provider",
    "direction",
    "from_number",
    "to_number",
    "responsible_user_id",
    "duration_seconds",
    "status",
    "started_at",
    "ended_at",
]


_FORMULA_LEAD_CHARS = ("=", "+", "-", "@", "\t", "\r")


def _cell_value(value: object) -> object:
    # UUID/datetime/date aren't natively writable by csv/openpyxl -- stringify
    # them, same reasoning as core/database's json.dumps(default=str) for JSONB.
    if isinstance(value, (UUID, datetime, date)):
        return str(value)
    # Neutralize CSV/XLSX formula injection: free-text fields (e.g. customer
    # full_name) can originate from inbound CRM webhooks, not just trusted
    # staff input, so a leading =/+/-/@ could detonate as a formula when the
    # exported file is opened in Excel/Sheets.
    if isinstance(value, str) and value.startswith(_FORMULA_LEAD_CHARS):
        return "'" + value
    return value


def rows_to_csv(rows: list[dict], columns: list[str]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(columns)
    for row in rows:
        writer.writerow([_cell_value(row.get(column)) for column in columns])
    return buffer.getvalue()


def rows_to_xlsx(rows: list[dict], columns: list[str]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(columns)
    for row in rows:
        sheet.append([_cell_value(row.get(column)) for column in columns])
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
