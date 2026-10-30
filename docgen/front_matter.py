"""
Adopt the university template's own front matter.

The certificate, declaration and acknowledgement pages in
OOAD_PROJECT_TEMPLATE.docx are not re-typed here.  They are kept exactly as the
template wrote them and only two things are changed:

  * the placeholder project title is swapped for the real one;
  * the empty ABSTRACT page is filled in.

Because the paragraphs, tables, indents and runs are the template's own, the
submitted document cannot drift away from the university sample: same wording,
same layout, same Times New Roman.

The template's Table of Contents is adopted the same way.  Its rows already
enumerate exactly the chapters and sections this report contains, so the table is
kept as it is and only its filler rows are dropped.
"""

import re

from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

from docx_kit import _fmt, _run

OLD_TITLE = "Airport Management System"

# Front-matter rows whose page number is filled in by Word afterwards.  The
# template also lists a standalone "Title Page", but its first page *is* the
# certificate, so that row is dropped and the rest are renumbered.
FRONT_ROWS = [
    ("Certificate", "FM_CERT"),
    ("Declaration", "FM_DECL"),
    ("Acknowledgement", "FM_ACK"),
    ("Abstract", "FM_ABS"),
    ("Table of Contents", "FM_TOC"),
    ("List of Figures", "FM_LOF"),
    ("List of Tables", "FM_LOT"),
]

# heading text in the template -> bookmark that Word resolves to a page number
FRONT_HEADINGS = [
    ("CERTIFICATE", "FL_FM_CERT"),
    ("DECLARATION", "FL_FM_DECL"),
    ("ACKNOWLEDGEMENT", "FL_FM_ACK"),
    ("ABSTRACT", "FL_FM_ABS"),
    ("Table of contents", "FL_FM_TOC"),
]


def _body(doc):
    return doc.element.body


def _children(doc):
    """Body children, excluding the trailing sectPr."""
    return [c for c in _body(doc) if c.tag != qn("w:sectPr")]


def _table_index(doc, tbl_el):
    """Position of tbl_el among the document's top-level tables."""
    kids = list(_body(doc))
    pos = kids.index(tbl_el)
    return sum(1 for el in kids[:pos] if el.tag == qn("w:tbl"))


def _set_cell(cell, text, bold=None, align=WD_ALIGN_PARAGRAPH.CENTER):
    """Replace a cell's text, keeping the first run's formatting."""
    for extra in cell.paragraphs[1:]:
        extra._p.getparent().remove(extra._p)
    par = cell.paragraphs[0]
    runs = list(par.runs)
    if not runs:
        _run(par, text)
    else:
        runs[0].text = text
        for r in runs[1:]:
            r._r.getparent().remove(r._r)
    par.alignment = align
    if bold is not None:
        for r in par.runs:
            r.bold = bold
    return par


def find_heading(doc, text):
    for par in doc.paragraphs:
        if par.text.strip().lower() == text.lower():
            return par
    raise RuntimeError(f"heading not found in the template: {text!r}")


def swap_project_title(doc, title):
    """Replace the template's placeholder title wherever it appears."""
    hits = 0

    def scan(paragraphs):
        nonlocal hits
        for par in paragraphs:
            for run in par.runs:
                if OLD_TITLE in run.text:
                    run.text = run.text.replace(OLD_TITLE, title)
                    hits += 1

    scan(doc.paragraphs)
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                scan(cell.paragraphs)
    return hits


def bookmark_paragraph(par, name, bid):
    """Wrap a paragraph in a bookmark so Word can report its page."""
    start = par._p.makeelement(qn("w:bookmarkStart"), {})
    start.set(qn("w:id"), str(bid))
    start.set(qn("w:name"), name)
    end = par._p.makeelement(qn("w:bookmarkEnd"), {})
    end.set(qn("w:id"), str(bid))
    pPr = par._p.find(qn("w:pPr"))
    if pPr is not None:
        pPr.addnext(start)
    else:
        par._p.insert(0, start)
    par._p.append(end)
    return par


def fill_abstract(doc, heading, paragraphs, keywords=None):
    """Write the abstract under the template's own ABSTRACT heading.

    The template parks its page break in a second run of the heading, so that
    run is detached and re-attached behind the new text; the abstract therefore
    ends its page exactly where the template's did.
    """
    for run in list(heading.runs):
        if run._r.findall(qn("w:br")):
            heading._p.remove(run._r)

    anchor = heading._p
    for text in paragraphs:
        p = doc.add_paragraph()
        _fmt(p, after=10, line=1.5, align=WD_ALIGN_PARAGRAPH.JUSTIFY, first=0.40)
        _run(p, text, size=12)
        anchor.addnext(p._p)
        anchor = p._p

    if keywords:
        p = doc.add_paragraph()
        _fmt(p, before=6, after=0, line=1.5, align=WD_ALIGN_PARAGRAPH.JUSTIFY)
        _run(p, "Keywords:  ", size=12, bold=True)
        _run(p, keywords, size=12, italic=True)
        anchor.addnext(p._p)
        anchor = p._p


def _drop_row(table, index):
    table.rows[index]._tr.getparent().remove(table.rows[index]._tr)


def adopt_contents_table(doc, heading):
    """Adopt the template's contents table and prepare it for numbering.

    Returns (index_in_doc_tables, [row specs for the page-number pass]).
    """
    # The template leaves a run of empty paragraphs between the abstract and
    # this heading. Left in place they flow onto a page of their own, so drop
    # them and start the contents cleanly with a page-break-before.
    prev = heading._p.getprevious()
    while prev is not None and prev.tag == qn("w:p"):
        text = "".join(t.text or "" for t in prev.iter(qn("w:t")))
        has_break = prev.findall(".//" + qn("w:br"))
        if text.strip() or has_break:
            break
        before = prev.getprevious()
        prev.getparent().remove(prev)
        prev = before
    heading.paragraph_format.page_break_before = True

    kids = _children(doc)
    start = kids.index(heading._p)
    tbl_el = next((el for el in kids[start + 1:] if el.tag == qn("w:tbl")), None)
    if tbl_el is None:
        raise RuntimeError("the template's contents table was not found")

    # everything after the contents table is template filler
    seen = False
    for el in kids:
        if el is tbl_el:
            seen = True
            continue
        if seen:
            el.getparent().remove(el)

    table = Table(tbl_el, doc)

    # 1. drop the empty filler rows at the foot of the template's table
    while len(table.rows) > 1 and not any(
            c.text.strip() for c in table.rows[-1].cells):
        _drop_row(table, len(table.rows) - 1)

    # 2. the template lists a standalone "Title Page" that this report does not
    #    have, so drop that row and reuse the front block for our own entries
    if table.rows[1].cells[1].text.strip().lower() == "title page":
        _drop_row(table, 1)

    specs = []
    for i, (label, bookmark) in enumerate(FRONT_ROWS):
        cells = table.rows[i + 1].cells
        _set_cell(cells[0], str(i + 1), bold=False)
        _set_cell(cells[1], label, bold=False)
        _set_cell(cells[2], "", bold=False)
        specs.append({"row": i + 1, "bookmark": "FL_" + bookmark})

    # 3. every remaining row is a chapter or a section: blank the page column
    #    and hand Word the bookmark it will resolve to a real page number
    for index in range(len(FRONT_ROWS) + 1, len(table.rows)):
        row = table.rows[index]
        first = row.cells[0].text.strip()
        name = None
        m = re.match(r"^Chapter\s+(\d+)$", first)
        if m:
            name = "FL_CH" + m.group(1)
        else:
            m = re.match(r"^(\d+(?:\.\d+)*)$", first)
            if m:
                name = "FL_" + m.group(1).replace(".", "_")
        if name is None:
            continue
        _set_cell(row.cells[-1], "", bold=False)
        specs.append({"row": index, "bookmark": name})

    return _table_index(doc, tbl_el), specs


def adopt(doc, project_title, abstract_paragraphs, keywords=None):
    """Turn a freshly copied template into this project's front matter.

    Returns (toc_table_index, toc_row_specs) for the page-number pass.
    """
    swap_project_title(doc, project_title)

    for offset, (text, name) in enumerate(FRONT_HEADINGS):
        bookmark_paragraph(find_heading(doc, text), name, 2000 + offset)

    abstract_heading = find_heading(doc, "ABSTRACT")
    fill_abstract(doc, abstract_heading, abstract_paragraphs, keywords)

    toc_heading = find_heading(doc, "Table of contents")
    return adopt_contents_table(doc, toc_heading)
