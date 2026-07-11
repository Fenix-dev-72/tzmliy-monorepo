"""PDF report rendering via reportlab (pure-Python, no system libs needed).

One concrete report is implemented end-to-end -- a per-tenant sales summary
for a date range -- rather than a speculative multi-report framework nothing
else needs yet.
"""

from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def render_sales_summary_pdf(
    tenant_name: str, period_start: datetime, period_end: datetime, rows: list[dict]
) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()

    story = [
        Paragraph(f"Sales summary — {tenant_name}", styles["Title"]),
        Paragraph(f"Period: {period_start:%Y-%m-%d} — {period_end:%Y-%m-%d}", styles["Normal"]),
        Spacer(1, 12),
    ]

    table_data = [["Sale ID", "Customer", "Amount", "Currency", "Status", "Created"]]
    total_by_currency: dict[str, int] = {}
    for row in rows:
        table_data.append(
            [
                str(row["sale_id"])[:8],
                row["customer_name"],
                f"{row['price_amount']:,}",
                row["currency"],
                row["status"],
                f"{row['created_at']:%Y-%m-%d}",
            ]
        )
        total_by_currency[row["currency"]] = total_by_currency.get(row["currency"], 0) + row["price_amount"]

    if len(table_data) == 1:
        story.append(Paragraph("No sales in this period.", styles["Normal"]))
    else:
        table = Table(table_data, repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#333333")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f2f2f2")]),
                ]
            )
        )
        story.append(table)
        story.append(Spacer(1, 12))
        for currency, total in total_by_currency.items():
            story.append(Paragraph(f"Total ({currency}): {total:,}", styles["Normal"]))

    doc.build(story)
    return buffer.getvalue()
