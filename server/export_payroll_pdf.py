import json
import sys
import fitz

NAVY = (15 / 255, 23 / 255, 42 / 255)
MUTED = (203 / 255, 213 / 255, 225 / 255)
LIGHT_BG = (248 / 255, 250 / 255, 252 / 255)
BORDER = (203 / 255, 213 / 255, 225 / 255)
WHITE = (1, 1, 1)
EMERALD = (22 / 255, 163 / 255, 74 / 255)
AMBER = (217 / 255, 119 / 255, 6 / 255)


def render_payroll_pdf(payload: dict, out_path: str):
    doc = fitz.open()
    page_w, page_h = 842.0, 595.0  # A4 Landscape
    margin_x = 24.0
    margin_y = 24.0
    table_w = page_w - margin_x * 2

    cols = [
        ("SN", 26),
        ("EMPLOYEE NAME", 150),
        ("UUDS ID", 66),
        ("ROLE / SKILL", 120),
        ("WORK DAYS", 50),
        ("TOTAL HRS", 52),
        ("OT HRS", 44),
        ("D", 28),
        ("N", 28),
        ("M", 28),
        ("OFF", 32),
        ("V", 28),
        ("SL", 28),
        ("L/EM", 32),
        ("OT FLAGS", 46),
        ("EMG", 36),
    ]
    total_w = sum(w for _, w in cols)
    scale = table_w / total_w
    cols = [(label, w * scale) for label, w in cols]

    for team in payload.get("teams", []):
        rows = team.get("rows", [])
        rows_per_page = 24
        chunks = [rows[i : i + rows_per_page] for i in range(0, max(1, len(rows)), rows_per_page)]

        for page_idx, chunk in enumerate(chunks):
            page = doc.new_page(width=page_w, height=page_h)
            shape = page.new_shape()
            tw_white = fitz.TextWriter(page.rect)
            tw_muted = fitz.TextWriter(page.rect)
            tw_navy = fitz.TextWriter(page.rect)
            tw_emerald = fitz.TextWriter(page.rect)
            tw_amber = fitz.TextWriter(page.rect)

            # Header bar
            shape.draw_rect(fitz.Rect(margin_x, margin_y, page_w - margin_x, margin_y + 42))
            shape.finish(color=NAVY, fill=NAVY)
            tw_white.append(
                (margin_x + 12, margin_y + 18),
                "UUDS DXB WORKSHOP — MONTHLY PAYROLL & OVERTIME SUMMARY",
                fontsize=12,
            )
            tw_muted.append(
                (margin_x + 12, margin_y + 33),
                f"Team: {team['fullName']}  |  Month: {payload['monthLabel']}  |  Rev: {team['revision']}  |  Generated: {payload['generatedAt']}",
                fontsize=8.5,
            )
            if len(chunks) > 1:
                tw_white.append(
                    (page_w - margin_x - 65, margin_y + 24),
                    f"Page {page_idx + 1}/{len(chunks)}",
                    fontsize=8.5,
                )

            y = margin_y + 52
            header_h = 20.0
            x = margin_x
            for label, w in cols:
                rect = fitz.Rect(x, y, x + w, y + header_h)
                shape.draw_rect(rect)
                shape.finish(color=BORDER, fill=(226 / 255, 232 / 255, 240 / 255), width=0.5)
                tw_navy.append((x + 3, y + 13), label, fontsize=6.8)
                x += w
            y += header_h

            row_h = 18.0
            for r_idx, row in enumerate(chunk):
                bg = WHITE if r_idx % 2 == 0 else LIGHT_BG
                vals = [
                    str(row.get("seqNo", "")),
                    str(row.get("name", ""))[:26],
                    str(row.get("uudsNo", "") or "-"),
                    str(row.get("skill", ""))[:22],
                    str(row.get("workedDays", 0)),
                    f"{row.get('totalHours', 0):.1f}",
                    f"{row.get('overtimeHours', 0):.1f}",
                    str(row.get("counts", {}).get("D", 0)),
                    str(row.get("counts", {}).get("N", 0)),
                    str(row.get("counts", {}).get("M", 0)),
                    str(row.get("counts", {}).get("OFF", 0)),
                    str(row.get("counts", {}).get("V", 0)),
                    str(row.get("counts", {}).get("SL", 0)),
                    str(row.get("counts", {}).get("L", 0) + row.get("counts", {}).get("EM", 0)),
                    str(row.get("overtimeFlags", 0)),
                    str(row.get("emergencyFlags", 0)),
                ]
                x = margin_x
                for c_idx, ((_, w), val) in enumerate(zip(cols, vals)):
                    rect = fitz.Rect(x, y, x + w, y + row_h)
                    shape.draw_rect(rect)
                    shape.finish(color=BORDER, fill=bg, width=0.4)
                    tw = tw_navy
                    if c_idx == 6 and float(row.get("overtimeHours", 0)) > 0:
                        tw = tw_amber
                    elif c_idx == 4:
                        tw = tw_emerald
                    tw.append((x + 3, y + 12), val, fontsize=7.0)
                    x += w
                y += row_h

            shape.commit()
            tw_white.write_text(page, color=WHITE)
            tw_muted.write_text(page, color=MUTED)
            tw_navy.write_text(page, color=NAVY)
            tw_emerald.write_text(page, color=EMERALD)
            tw_amber.write_text(page, color=AMBER)

    doc.save(out_path, deflate=True)


if __name__ == "__main__":
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        data = json.load(f)
    render_payroll_pdf(data, sys.argv[2])
