"""
Import 241 Waterside Master Unit List → units + unit_sales.

Reads the CRM Notes Excel as source of truth and overwrites units.sale_status,
units.blocked, and unit_sales rows for that project. Existing CRM-side fields
on the unit row (unit_type, area_sqft, listed_price, floor) are preserved.

Usage:
  python scripts/import_241_units.py            # dry run (prints diff)
  python scripts/import_241_units.py --apply    # writes via service key
"""
import os
import sys
import json
import urllib.request
import urllib.error
from datetime import date, datetime
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
XLSX = Path(
    r"C:/Users/USER/Cloud-Drive/Regent Developments/Legacy Developments/"
    r"241 Waterside/Sales/CRM/241 Waterside - Master Unit List - CRM Notes.xlsx"
)
PROJECT_ID = "00000000-0000-0000-0000-000000000002"
SUPABASE_URL = "https://kdxvhrwnnehicgdryowu.supabase.co"

# Excel labels unit 804 (4BR top-floor, 4 type, ~11M); DB stores it as 'PH'.
UNIT_NO_ALIAS = {"804": "PH"}


def load_service_key() -> str:
    env_path = ROOT / ".env.test"
    for line in env_path.read_text().splitlines():
        if line.startswith("SUPABASE_SERVICE_KEY="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("SUPABASE_SERVICE_KEY missing in .env.test")


def sb_request(method: str, path: str, *, body=None, prefer: str | None = None, key: str):
    url = f"{SUPABASE_URL}{path}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read().decode()
            return r.status, json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def iso(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date().isoformat()
    if isinstance(val, date):
        return val.isoformat()
    return None


def map_spa(val) -> str:
    if val == "SPA Complete":
        return "fully_signed"
    return "not_signed"


def map_oqood(val) -> str:
    if val and "registered" in str(val).lower() and "not" not in str(val).lower():
        return "registered"
    return "not_registered"


def build_rows():
    wb = openpyxl.load_workbook(str(XLSX), data_only=True)
    ws = wb["Sheet1"]
    rows = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[1] is None:
            continue
        unit_no = str(r[1]).strip()
        unit_no = UNIT_NO_ALIAS.get(unit_no, unit_no)
        status = (r[2] or "").strip().upper()
        rows.append({
            "unit_no":       unit_no,
            "raw_status":    status,
            "otp_date":      iso(r[3]),
            "client_name":   (r[4] or "").strip() or None,
            "agent":         (r[5] or "").strip() or None,
            "agency":        (r[6] or "").strip() or None,
            "sold_price":    r[8] or None,
            "spa_status":    map_spa(r[30]),
            "spa_date":      iso(r[34]),
            "oqood_status":  map_oqood(r[36]),
            "oqood_date":    iso(r[34]) if map_oqood(r[36]) == "registered" else None,
        })
    return rows


def classify(raw: str):
    """Return (sale_status, blocked, has_sale, sale_status_val)."""
    if raw == "AVAILABLE":
        return "available", False, False, None
    if raw == "UNRELEASED":
        return "available", True, False, None
    if raw == "BLOCKED BY DEVELOPER":
        return "blocked_by_developer", True, False, None
    if raw == "BOOKED":
        return "available", False, True, "reserved"
    if raw == "REGISTERED":
        return "sold", False, True, "sold"
    raise ValueError(f"unknown status: {raw}")


def main():
    apply = "--apply" in sys.argv
    key = load_service_key()

    rows = build_rows()
    _, units = sb_request(
        "GET",
        f"/rest/v1/units?project_id=eq.{PROJECT_ID}&select=id,unit_no,sale_status,blocked",
        key=key,
    )
    unit_by_no = {str(u["unit_no"]).strip(): u for u in units}

    plan = {"units_update": 0, "sales_upsert": 0, "sales_delete": 0, "missing": [], "diff_sample": []}

    # Existing sale rows for these units
    unit_ids = ",".join(u["id"] for u in unit_by_no.values())
    _, existing_sales = sb_request(
        "GET",
        f"/rest/v1/unit_sales?unit_id=in.({unit_ids})&select=id,unit_id,status",
        key=key,
    )
    sales_by_unit = {s["unit_id"]: s for s in existing_sales}

    for row in rows:
        u = unit_by_no.get(row["unit_no"])
        if not u:
            plan["missing"].append(row["unit_no"])
            continue
        sale_status, blocked, has_sale, sale_status_val = classify(row["raw_status"])

        if u["sale_status"] != sale_status or bool(u["blocked"]) != blocked:
            plan["units_update"] += 1
            if len(plan["diff_sample"]) < 5:
                plan["diff_sample"].append({
                    "unit_no": row["unit_no"],
                    "from": {"sale_status": u["sale_status"], "blocked": u["blocked"]},
                    "to": {"sale_status": sale_status, "blocked": blocked},
                })
            if apply:
                sb_request(
                    "PATCH",
                    f"/rest/v1/units?id=eq.{u['id']}",
                    body={"sale_status": sale_status, "blocked": blocked},
                    key=key,
                )

        if has_sale:
            sale_body = {
                "unit_id":        u["id"],
                "status":         sale_status_val,
                "buyer_name":     row["client_name"],
                "sale_date":      row["otp_date"],
                "sold_price":     row["sold_price"],
                "broker_name":    row["agent"],
                "brokerage_name": row["agency"],
                "spa_status":     row["spa_status"],
                "spa_date":       row["spa_date"],
                "oqood_status":   row["oqood_status"],
                "oqood_date":     row["oqood_date"],
            }
            plan["sales_upsert"] += 1
            if apply:
                existing = sales_by_unit.get(u["id"])
                if existing:
                    sb_request(
                        "PATCH",
                        f"/rest/v1/unit_sales?id=eq.{existing['id']}",
                        body=sale_body,
                        key=key,
                    )
                else:
                    sb_request(
                        "POST",
                        "/rest/v1/unit_sales",
                        body=sale_body,
                        key=key,
                    )
        else:
            existing = sales_by_unit.get(u["id"])
            if existing:
                plan["sales_delete"] += 1
                if apply:
                    sb_request(
                        "DELETE",
                        f"/rest/v1/unit_sales?id=eq.{existing['id']}",
                        key=key,
                    )

    mode = "APPLIED" if apply else "DRY RUN"
    print(f"=== {mode} ===")
    print(json.dumps(plan, indent=2))


if __name__ == "__main__":
    main()
