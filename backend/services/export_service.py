"""Export service: turn report data into downloadable CSV or PDF bytes.

``reportlab`` is imported lazily so the application boots (and CSV export works)
even when the PDF dependency is not installed.
"""
import csv
import io
from datetime import datetime, timedelta
from typing import List, Optional

from db import repository

#: The whole CSV is assembled in memory before it is returned, and the caller
#: can ask for a 30-day window, so the row count has to be bounded. 5 000 rows
#: is a few hundred KB and covers any realistic review session; a truncated
#: export says so in its last line rather than lying by omission.
CSV_MAX_ROWS = 5_000

#: Excel, LibreOffice and Sheets evaluate a cell that begins with one of these as
#: a live formula. Plate text arrives from OCR and camera names from config, so a
#: value like ``=HYPERLINK(...)`` or ``@SUM(...)`` would run the moment an
#: operator opens the export — a real risk even though the API itself is safe.
FORMULA_LEADS = ("=", "+", "-", "@")


def _cell(value):
    """Return ``value`` in a form a spreadsheet will read as text, not a formula.

    Prefixing an apostrophe is the standard neutralisation: the character is a
    text marker to the spreadsheet, so the value still displays exactly as it was
    recorded. Non-strings (counts, speeds, booleans) are passed through untouched
    so numeric columns stay numeric. Leading whitespace is skipped because
    ``" =1+1"`` is treated as a formula too; embedded newlines need no handling
    since :mod:`csv` quotes them and they cannot break out of the field.
    """
    if not isinstance(value, str):
        return value
    if value.lstrip(" \t\r\n")[:1] in FORMULA_LEADS:
        return "'" + value
    return value


def violations_csv(db, start: Optional[datetime] = None, end: Optional[datetime] = None,
                   hours: int = 24) -> bytes:
    end = end or datetime.utcnow()
    start = start or (end - timedelta(hours=hours))
    rows, total = repository.list_violations(db, limit=CSV_MAX_ROWS, start=start, end=end)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["violation_id", "type", "plate", "camera_id", "camera_name",
                     "timestamp", "severity", "confidence", "speed_kmh",
                     "posted_limit", "resolved"])
    for v in rows:
        d = v.to_dict()
        writer.writerow([_cell(d["violation_id"]), _cell(d["type"]), _cell(d["plate"]),
                         _cell(d["camera_id"]), _cell(d["camera_name"]),
                         _cell(d["timestamp"]), _cell(d["severity"]), d["confidence"],
                         d["speed_kmh"], d["posted_limit"], d["resolved"]])
    if total > len(rows):
        writer.writerow([f"# truncated: {len(rows)} of {total} rows "
                         f"(narrow the window with ?hours=)"])
    return buf.getvalue().encode("utf-8")


def daily_volume_csv(db, on_date=None) -> bytes:
    data = repository.daily_volume(db, on_date or datetime.utcnow().date())
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([f"Daily volume for {data['date']} - total {data['total']}"])
    writer.writerow([])
    writer.writerow(["hour", "count"])
    for row in data["by_hour"]:
        writer.writerow([row["hour"], row["count"]])
    writer.writerow([])
    writer.writerow(["camera_id", "camera_name", "count"])
    for row in data["by_camera"]:
        writer.writerow([_cell(row["camera_id"]), _cell(row["camera_name"]), row["count"]])
    return buf.getvalue().encode("utf-8")


def violations_pdf(db, start: Optional[datetime] = None, end: Optional[datetime] = None,
                   hours: int = 24) -> bytes:
    """Render a violations summary PDF. Requires reportlab."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )

    end = end or datetime.utcnow()
    start = start or (end - timedelta(hours=hours))
    summary = repository.violations_summary(db, start, end)
    rows, _ = repository.list_violations(db, limit=200, start=start, end=end)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, title="Violations Report")
    styles = getSampleStyleSheet()
    story = [
        Paragraph("ANPR Traffic Intelligence — Violations Report", styles["Title"]),
        Paragraph(f"Window: {summary['start']} to {summary['end']}", styles["Normal"]),
        Paragraph(f"Total violations: {summary['total']}", styles["Normal"]),
        Spacer(1, 0.4 * cm),
    ]

    by_type = [["Type", "Count"]] + [[k, v] for k, v in summary["by_type"].items()]
    t1 = Table(by_type, hAlign="LEFT")
    t1.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2a44")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    story += [Paragraph("By type", styles["Heading2"]), t1, Spacer(1, 0.4 * cm)]

    header = ["ID", "Type", "Plate", "Camera", "Time", "Severity"]
    data = [header] + [[
        v.to_dict()["violation_id"], v.violation_type, v.plate_text,
        v.camera_name, v.to_dict()["timestamp"], v.severity,
    ] for v in rows[:60]]
    t2 = Table(data, hAlign="LEFT", repeatRows=1)
    t2.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2a44")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.lightgrey),
    ]))
    story += [Paragraph("Recent violations", styles["Heading2"]), t2]

    doc.build(story)
    return buf.getvalue()
