import json
import sys
import os
import pymupdf

SHIFT_COLORS = {
    "D":   ((0.57, 0.82, 0.31), (0.05, 0.15, 0.05)),
    "N":   ((0.62, 0.25, 0.78), (1.0, 1.0, 1.0)),
    "M":   ((1.00, 0.75, 0.00), (0.10, 0.08, 0.00)),
    "T":   ((0.02, 0.52, 0.78), (1.0, 1.0, 1.0)),
    "OFF": ((0.92, 0.12, 0.14), (1.0, 1.0, 1.0)),
    "V":   ((0.78, 0.80, 0.84), (0.10, 0.12, 0.15)),
    "L":   ((0.92, 0.38, 0.08), (1.0, 1.0, 1.0)),
    "SL":  ((0.88, 0.11, 0.28), (1.0, 1.0, 1.0)),
    "EM":  ((0.65, 0.08, 0.08), (1.0, 1.0, 1.0)),
}

FONT_REG = pymupdf.Font("helv")
FONT_BOLD = pymupdf.Font("hebo")

def add_cell(shape, writers, rect, text, fill=None, text_color=(0.08, 0.10, 0.14), fontsize=7.0, bold=False, align=1):
    shape.draw_rect(rect)
    shape.finish(color=(0.35, 0.38, 0.44), width=0.45, fill=fill)
    if text:
        tx = str(text)
        font = FONT_BOLD if bold else FONT_REG
        fs = fontsize
        if align == 0:
            x = rect.x0 + 3
        else:
            tw = font.text_length(tx, fontsize=fs)
            if tw > rect.width - 2:
                fs = max(4.5, fs * (rect.width - 2) / tw)
                tw = font.text_length(tx, fontsize=fs)
            x = rect.x0 + (rect.width - tw) / 2
        y = rect.y0 + rect.height * 0.68
        key = text_color
        if key not in writers:
            writers[key] = pymupdf.TextWriter(shape.page.rect)
        writers[key].append((x, y), tx, font=font, fontsize=fs)

def build_pdf(payload_path, out_pdf_path):
    with open(payload_path, encoding="utf-8") as f:
        data = json.load(f)

    doc = pymupdf.open()
    page_w, page_h = pymupdf.paper_size("a3-l")
    margin_x = 22
    margin_y = 20
    logo_path = os.path.join(os.path.dirname(__file__), "..", "public", "uuds-logo.png")

    for team in data["teams"]:
        page = doc.new_page(width=page_w, height=page_h)
        if os.path.exists(logo_path):
            logo_rect = pymupdf.Rect(margin_x, margin_y, margin_x + 56, margin_y + 42)
            page.insert_image(logo_rect, filename=logo_path)

        shape = page.new_shape()
        writers = {}

        def write_free(x, y, tx, fontsize=8.0, bold=False, color=(0.06, 0.12, 0.24)):
            if color not in writers:
                writers[color] = pymupdf.TextWriter(page.rect)
            writers[color].append((x, y), str(tx), font=(FONT_BOLD if bold else FONT_REG), fontsize=fontsize)

        title = f"UUDS DXB WORKSHOP  |  {team['fullName']}  —  {data['monthLabel'].upper()} ({team['revision']})"
        write_free(margin_x + 70, margin_y + 22, title, fontsize=14, bold=True, color=(0.06, 0.12, 0.24))
        sub = f"Staff: {len(team['rows'])}   |   Status: {data['status']}   |   Printed: {data['generatedAt']}"
        write_free(margin_x + 70, margin_y + 36, sub, fontsize=8.5, bold=False, color=(0.35, 0.40, 0.48))

        days = team["days"]
        n_days = len(days)
        usable_w = page_w - 2 * margin_x

        w_no = 22
        w_name = 152
        w_skill = 78
        w_uuds = 58
        w_cont = 54
        w_days_sum = 32
        left_w = w_no + w_name + w_skill + w_uuds + w_cont
        day_w = (usable_w - left_w - w_days_sum) / max(1, n_days)

        top_y = margin_y + 52
        n_rows = len(team["rows"])
        legend_h = 54
        avail_h = page_h - top_y - margin_y - legend_h
        header_h = 28
        footer_h = 16
        row_h = min(16.5, max(10.5, (avail_h - header_h - footer_h) / max(1, n_rows)))

        x = margin_x
        hdr_fill = (0.06, 0.10, 0.18)
        hdr_txt = (1.0, 1.0, 1.0)
        for label, w in [("NO", w_no), ("NAME", w_name), ("SKILL", w_skill), ("UUDS NO", w_uuds), ("CONT. NO", w_cont)]:
            add_cell(shape, writers, pymupdf.Rect(x, top_y, x + w, top_y + header_h), label, fill=hdr_fill, text_color=hdr_txt, fontsize=7, bold=True)
            x += w

        for d in days:
            is_wknd = d["dow"] in ("SAT", "SUN")
            dfill = (0.14, 0.19, 0.29) if is_wknd else hdr_fill
            dtxt = (1.0, 0.85, 0.4) if is_wknd else hdr_txt
            add_cell(shape, writers, pymupdf.Rect(x, top_y, x + day_w, top_y + 13), d["dow"][:3], fill=dfill, text_color=dtxt, fontsize=5.8, bold=True)
            add_cell(shape, writers, pymupdf.Rect(x, top_y + 13, x + day_w, top_y + header_h), str(d["day"]), fill=dfill, text_color=dtxt, fontsize=7.2, bold=True)
            x += day_w

        add_cell(shape, writers, pymupdf.Rect(x, top_y, x + w_days_sum, top_y + header_h), "DAYS", fill=hdr_fill, text_color=hdr_txt, fontsize=6.8, bold=True)

        y = top_y + header_h
        for idx, r in enumerate(team["rows"]):
            x = margin_x
            zebra = (0.97, 0.98, 0.99) if idx % 2 == 1 else (1.0, 1.0, 1.0)
            add_cell(shape, writers, pymupdf.Rect(x, y, x + w_no, y + row_h), str(idx + 1), fill=zebra, fontsize=6.8)
            x += w_no
            add_cell(shape, writers, pymupdf.Rect(x, y, x + w_name, y + row_h), r["name"][:28], fill=zebra, fontsize=6.8, bold=True, align=0)
            x += w_name
            add_cell(shape, writers, pymupdf.Rect(x, y, x + w_skill, y + row_h), (r["skill"] or "")[:14], fill=zebra, fontsize=6.2, align=0)
            x += w_skill
            add_cell(shape, writers, pymupdf.Rect(x, y, x + w_uuds, y + row_h), r["uudsNo"] or "", fill=zebra, fontsize=6.2)
            x += w_uuds
            add_cell(shape, writers, pymupdf.Rect(x, y, x + w_cont, y + row_h), r["contingentNo"] or "", fill=zebra, fontsize=6.2)
            x += w_cont

            for sh in r["shifts"]:
                code = sh["code"]
                fill_c, txt_c = SHIFT_COLORS.get(code, ((0.9, 0.9, 0.9), (0.1, 0.1, 0.1)))
                add_cell(shape, writers, pymupdf.Rect(x, y, x + day_w, y + row_h), code, fill=fill_c, text_color=txt_c, fontsize=6.5, bold=True)
                x += day_w

            add_cell(shape, writers, pymupdf.Rect(x, y, x + w_days_sum, y + row_h), str(r["stats"]["workedDays"]), fill=(0.94, 0.96, 0.98), fontsize=6.8, bold=True)
            y += row_h

        x = margin_x
        add_cell(shape, writers, pymupdf.Rect(x, y, x + left_w, y + footer_h), "TOTAL ON DUTY", fill=(0.88, 0.91, 0.95), fontsize=7.2, bold=True)
        x += left_w
        for dt in team["dailyTotals"]:
            add_cell(shape, writers, pymupdf.Rect(x, y, x + day_w, y + footer_h), str(dt["onDuty"]), fill=(0.92, 0.95, 0.98), fontsize=7.0, bold=True)
            x += day_w
        add_cell(shape, writers, pymupdf.Rect(x, y, x + w_days_sum, y + footer_h), "", fill=(0.88, 0.91, 0.95))

        ly = y + footer_h + 10
        lx = margin_x
        write_free(lx, ly + 10, "SHIFT TIMINGS & LEGEND:", fontsize=7.5, bold=True, color=(0.15, 0.20, 0.28))
        lx += 115
        for code, desc in (team.get("shiftTimings") or {}).items():
            fill_c, txt_c = SHIFT_COLORS.get(code, ((0.85, 0.85, 0.85), (0.1, 0.1, 0.1)))
            add_cell(shape, writers, pymupdf.Rect(lx, ly, lx + 28, ly + 14), code, fill=fill_c, text_color=txt_c, fontsize=6.8, bold=True)
            label_str = f" {desc}"
            write_free(lx + 31, ly + 10, label_str, fontsize=7.2, bold=False, color=(0.15, 0.18, 0.22))
            lx += 36 + FONT_REG.text_length(label_str, fontsize=7.2) + 14

        shape.commit()
        for color, tw in writers.items():
            tw.write_text(page, color=color)

    doc.save(out_pdf_path, deflate=True)
    doc.close()

if __name__ == "__main__":
    build_pdf(sys.argv[1], sys.argv[2])
