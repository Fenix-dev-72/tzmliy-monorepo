"""PDF report rendering via reportlab (pure-Python, no system libs needed).

Two concrete reports are implemented end-to-end -- a per-tenant sales
summary and a per-seller KPI dashboard snapshot -- rather than a speculative
multi-report framework nothing else needs yet.
"""

from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _fmt_seconds(seconds: int | None) -> str:
    if seconds is None:
        return "-"
    hours, rem = divmod(seconds, 3600)
    minutes = rem // 60
    return f"{hours} soat {minutes} daq" if hours else f"{minutes} daq"


def _fmt_pct(pct: float | None) -> str:
    return f"{pct}%" if pct is not None else "-"


def _fmt_amount(amount: int, currency: str) -> str:
    value = amount / 100 if currency == "USD" else amount
    formatted = f"{value:,.2f}" if currency == "USD" else f"{value:,.0f}"
    return f"{formatted} {currency}"


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


_MODE_LABELS = {"online": "Onlayn", "offline": "Oflayn", "intensive": "Intensiv", None: "Aniqlanmagan"}


def render_seller_kpi_pdf(tenant_name: str, seller_name: str, period_start: datetime, period_end: datetime, kpis: dict) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()

    def section_table(title: str, rows: list[tuple[str, str]]) -> list:
        block = [Paragraph(title, styles["Heading2"])]
        table = Table([[label, value] for label, value in rows], colWidths=[260, 200])
        table.setStyle(
            TableStyle(
                [
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#f2f2f2")]),
                ]
            )
        )
        block.append(table)
        block.append(Spacer(1, 10))
        return block

    story = [
        Paragraph(f"Sotuvchi hisobot — {seller_name}", styles["Title"]),
        Paragraph(f"{tenant_name} | Davr: {period_start:%Y-%m-%d} — {period_end:%Y-%m-%d}", styles["Normal"]),
        Spacer(1, 12),
    ]

    story += section_table(
        "Asosiy ko'rsatkichlar",
        [
            ("Konversiya", _fmt_pct(kpis["conversion_pct"])),
            (
                "O'rtacha sotuv",
                _fmt_amount(round(kpis["sales_total_uzs"] / kpis["sales_count"]), "UZS") if kpis["sales_count"] else "-",
            ),
            ("Follow-up bajarish", _fmt_pct(kpis["followup_pct"]) if kpis["followup_linked"] else "CRM ulanmagan"),
            ("Kunlik suhbat vaqti", _fmt_seconds(kpis["calls_daily_talk_seconds"])),
            ("Lid javob vaqti (median)", _fmt_seconds(kpis["lead_response_median_seconds"])),
        ],
    )

    mode_rows = [
        (
            f"Sotuv - {_MODE_LABELS.get(m['mode'], m['mode'])} ({m['currency']})",
            f"{m['sales_count']} ta | Kelishuv {_fmt_amount(m['agreed_amount'], m['currency'])} | Tushum {_fmt_amount(m['collected_amount'], m['currency'])}",
        )
        for m in kpis["sales_by_mode"]
    ] or [("Sotuvlar", "Bu davrda savdo yo'q")]
    story += section_table("Sotuv ko'rsatkichlari", [("Sotuv shartnomasi", str(kpis["sales_count"])), *mode_rows])

    story += section_table(
        "Qo'ng'iroqlar va faollik",
        [
            ("Jami qo'ng'iroqlar", str(kpis["calls_total"])),
            ("Chiquvchi qo'ng'iroqlar", str(kpis["calls_outbound"])),
            ("Kiruvchi qo'ng'iroqlar", str(kpis["calls_inbound"])),
            ("O'tkazib yuborilgan", _fmt_pct(kpis["calls_missed_pct"])),
            ("O'rtacha davomiylik", _fmt_seconds(kpis["calls_avg_duration_seconds"])),
        ],
    )

    story += section_table(
        "CRM faoliyat",
        [
            ("Yozuvlar", str(kpis["crm_notes_count"])),
            ("Bosqich o'zgarishi", str(kpis["crm_stage_changes_count"])),
        ],
    )

    story += section_table(
        "Lid ko'rsatkichlari",
        [
            ("Faol lidlar", str(kpis["leads_active_count"])),
            ("Yangi lidlar", str(kpis["leads_count"])),
            ("Yutilgan lidlar", str(kpis["leads_won_count"])),
            ("Yo'qotilgan lidlar", str(kpis["leads_lost_count"])),
        ],
    )

    story += section_table(
        "Moliyaviy ko'rsatkichlar",
        [
            ("Qarz yig'ish darajasi", _fmt_pct(kpis["debt_collection_pct"])),
            ("Qaytarish darajasi", _fmt_pct(kpis["refund_pct"])),
        ],
    )

    doc.build(story)
    return buffer.getvalue()
