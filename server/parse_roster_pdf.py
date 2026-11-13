import json
import re
import sys
import pymupdf

MONTH_MAP = {
    "JANUARY": "01", "JAN": "01",
    "FEBRUARY": "02", "FEB": "02",
    "MARCH": "03", "MAR": "03",
    "APRIL": "04", "APR": "04",
    "MAY": "05",
    "JUNE": "06", "JUN": "06",
    "JULY": "07", "JUL": "07",
    "AUGUST": "08", "AUG": "08",
    "SEPTEMBER": "09", "SEP": "09", "SEPT": "09",
    "OCTOBER": "10", "OCT": "10",
    "NOVEMBER": "11", "NOV": "11",
    "DECEMBER": "12", "DEC": "12",
}

def norm_shift(val):
    s = (val or "").replace("\n", " ").strip().upper()
    if s in ("", "-"):
        return ""
    if s in ("D", "DAY", "DAY SHIFT"):
        return "D"
    if s in ("N", "NIGHT", "NIGHT SHIFT"):
        return "N"
    if s in ("M", "GENERAL", "GEN"):
        return "M"
    if s in ("T", "TRAINING", "TRAINING (T)"):
        return "T"
    if s in ("V", "VAC", "VACATION", "VACCATION"):
        return "V"
    if s in ("L", "LEAVE", "ON LEAVE"):
        return "L"
    if s in ("SL", "SICK", "SICK LEAVE"):
        return "SL"
    if s in ("EM", "EMERGENCY"):
        return "EM"
    if s in ("OFF", "DAY OFF", "DUTY OFF", "OFF DAY"):
        return "OFF"
    return s

def detect_team_and_month(text_blob):
    up = text_blob.upper()
    team_id = ""
    if "LEATHER" in up:
        team_id = "leather-team"
    elif "PAINT BOOTH" in up:
        team_id = "paint-booth"
    elif "WORKSHOP" in up:
        team_id = "workshop-team"
    elif "PAINT" in up:
        team_id = "paint-booth"
    elif "TEAM A" in up or "TEAM-A" in up:
        team_id = "team-a"
    elif "TEAM B" in up or "TEAM-B" in up:
        team_id = "team-b"
    elif "TEAM C" in up or "TEAM-C" in up:
        team_id = "team-c"

    year_m = re.search(r"\b(20\d{2})\b", up)
    year = year_m.group(1) if year_m else "2026"
    month_num = ""
    for k, v in MONTH_MAP.items():
        if re.search(rf"\b{k}\b", up):
            month_num = v
            break
    month_str = f"{year}-{month_num}" if month_num else ""

    rev_m = re.search(r"\b(R\d{2})\b", up)
    revision = rev_m.group(1) if rev_m else "R00"
    return team_id, month_str, revision

def parse_pdf(pdf_path):
    doc = pymupdf.open(pdf_path)
    p0 = doc[0]
    full_text = "\n".join(page.get_text() for page in doc)
    team_id, month_str, revision = detect_team_and_month(full_text)

    tabs = p0.find_tables()
    if not tabs.tables:
        raise RuntimeError("No roster table found on page 1 of PDF")

    rows = tabs.tables[0].extract()
    clean_rows = [[(c or "").replace("\n", " ").strip() for c in r] for r in rows]

    # Locate the row containing day numbers (1, 2, 3...) and the row containing NAME
    day_row_idx = -1
    day_cols = {}
    name_col = -1
    skill_col = -1
    uuds_col = -1
    cont_col = -1
    seq_col = -1

    for ri, r in enumerate(clean_rows[:8]):
        # Check for day numbers 1..31
        found_days = {}
        for ci, cell in enumerate(r):
            if cell.isdigit():
                num = int(cell)
                if 1 <= num <= 31 and num not in found_days.values():
                    found_days[ci] = num
        if len(found_days) >= 15 and day_row_idx == -1:
            day_row_idx = ri
            day_cols = found_days

        for ci, cell in enumerate(r):
            cu = cell.upper()
            if cu == "NAME" and name_col == -1:
                name_col = ci
            elif "SKILL" in cu and skill_col == -1:
                skill_col = ci
            elif "UUDS" in cu and uuds_col == -1:
                uuds_col = ci
            elif ("CONT" in cu or "CON." in cu) and cont_col == -1:
                cont_col = ci
            elif cu in ("NO", "NO:", "N0", "SL.NO") and seq_col == -1:
                seq_col = ci

    if name_col == -1 or not day_cols:
        raise RuntimeError("Could not detect NAME or Day 1..31 columns in PDF")

    header_end = max(day_row_idx, 2)
    # Find last header row (where NAME sits if below day row)
    for ri, r in enumerate(clean_rows[:8]):
        if r[name_col].upper() == "NAME":
            header_end = max(header_end, ri)

    sorted_day_cols = sorted(day_cols.items(), key=lambda x: x[1])
    max_day = sorted_day_cols[-1][1]

    # Check Page 2 for spilled Day 30 / 31 column (e.g., Workshop Team PDF)
    extra_days = {}
    if len(doc) > 1:
        p2_lines = [l.strip() for l in doc[1].get_text().splitlines() if l.strip()]
        # Look for day number near top of page 2 lines
        for idx, line in enumerate(p2_lines[:5]):
            if line.isdigit() and int(line) in (29, 30, 31) and int(line) > max_day:
                extra_day_num = int(line)
                extra_vals = [norm_shift(x) for x in p2_lines[idx + 1:]]
                extra_days[extra_day_num] = extra_vals
                max_day = max(max_day, extra_day_num)
                break

    staff_rows = []
    for ri in range(header_end + 1, len(clean_rows)):
        r = clean_rows[ri]
        name = r[name_col].strip() if name_col < len(r) else ""
        if not name:
            continue
        up_name = name.upper()
        if up_name in ("DUTY TIME", "TOTAL ON DUTY", "NO:OF STAFF", "TIMING DETAILS", "D", "N", "M", "OFF", "V", "VACATION"):
            break
        if "CHECKED" in up_name:
            break

        seq_val = r[seq_col].strip() if 0 <= seq_col < len(r) else str(len(staff_rows) + 1)
        skill_val = r[skill_col].strip() if 0 <= skill_col < len(r) else ""
        uuds_val = r[uuds_col].replace(" ", "").strip() if 0 <= uuds_col < len(r) else ""
        cont_val = r[cont_col].strip() if 0 <= cont_col < len(r) else ""

        if not skill_val and "(TEAM LEADER)" in up_name:
            skill_val = "TEAM LEADER"

        shifts = []
        last_v = ""
        for ci, d_num in sorted_day_cols:
            raw_code = r[ci] if ci < len(r) else ""
            code = norm_shift(raw_code)
            if code == "" and last_v in ("V", "L", "T"):
                code = last_v
            elif code != "":
                last_v = code
            shifts.append(code or "OFF")

        for extra_d in sorted(extra_days.keys()):
            vals = extra_days[extra_d]
            idx = len(staff_rows)
            shifts.append(vals[idx] if idx < len(vals) and vals[idx] else "OFF")

        staff_rows.append({
            "seqNo": seq_val or str(len(staff_rows) + 1),
            "name": name,
            "skill": skill_val or "TECHNICIAN",
            "uudsNo": uuds_val,
            "contingentNo": cont_val,
            "shifts": shifts,
        })

    print("__JSON_START__" + json.dumps({
        "teamId": team_id,
        "month": month_str,
        "revision": revision,
        "daysDetected": max_day,
        "staffRows": staff_rows,
    }) + "__JSON_END__")

if __name__ == "__main__":
    parse_pdf(sys.argv[1])
