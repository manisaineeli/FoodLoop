"""
Build the FoodLoop OOAD project report from the university template.

    python docgen/build_report.py

Uses OOAD_PROJECT_TEMPLATE.docx as the base so styles.xml, theme1.xml,
fontTable.xml and the page setup are inherited, then rebuilds the body with
front matter + ten chapters. Page numbers in the table of contents are filled
in afterwards by fill_page_numbers.ps1, which reads the bookmark map this
script writes out.

Output: FoodLoop_OOAD_Project_Report.docx
"""

import json
import re
import shutil
import time
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt

import front_matter
from docx_kit import (BODY, BODY_FONT, CONTENT_W,
                      add_footer, body, bullets, cell_borders,
                      fix_layout, h1, h2, h_chapter, h_front, numbered, note,
                      para, repeat_header, set_page_numbering, shade, table)
from docx_kit import figure_fit as _figure_fit
from docx_kit import table_caption as _table_caption

ROOT = Path(__file__).resolve().parent.parent
HERE = Path(__file__).resolve().parent
DIAG = ROOT / "diagrams"
SHOTS = HERE / "screenshots"
LOGO = HERE / "aditya-logo.jpg"
TEMPLATE = Path(r"C:\Users\ganes\OneDrive\Documents\OOAD_PROJECT_TEMPLATE.docx")
OUTPUT = ROOT / "FoodLoop_OOAD_Project_Report.docx"
MAPFILE = HERE / "toc_map.json"

TEAM = [
    ("Pranav Vedula", "24B11CS355"),
    ("Posa Kaveri", "24B11CS352"),
    ("Medapati Satya Harsha Vardhan Reddy", "24B11CS275"),
    ("Bodhanapu Suhas", "24B11CS049"),
]

PROJECT = "AI-Based Food Waste Reduction Platform (FoodLoop)"
GUIDE = "Mr. Kothapalli Ramesh"
HOD = "Dr. A. Phani Sridhar"
ACADEMIC_YEAR = "2026-2027"

# Written onto the template's own (empty) ABSTRACT page.
ABSTRACT = [
    "Food waste is a serious environmental and economic problem. Restaurants, "
    "hotels, supermarkets, hostels and households routinely discard edible "
    "surplus because there is no fast, centralised way to publish it or to find "
    "a nearby organisation that can use it in time. This project, FoodLoop, is "
    "an AI-based Food Waste Reduction Platform that closes that gap. It gives "
    "food providers a single workspace in which to register accounts, publish "
    "surplus food listings with quantity and best-before information, and "
    "monitor every request that arrives. Community partners — NGOs, community "
    "kitchens, shelters and food banks — log in to a dedicated portal, browse "
    "what is available nearby and request the food they can collect. The "
    "provider accepts or declines each request, schedules a pickup, and tracks "
    "the donation through to delivery, while an activity feed and an impact "
    "dashboard make every kilogram that is diverted visible.",

    "The system was analysed and designed using the Object-Oriented Analysis "
    "and Design methodology. Requirements were gathered from the food-waste "
    "problem domain, leading to sixteen functional and twelve non-functional "
    "requirements, fourteen identified use cases, six external actors and a "
    "fourteen-event analysis table. The resulting models comprise a use case "
    "diagram, a domain class diagram, an object diagram, an activity diagram, "
    "a system sequence diagram, a high-level sequence diagram, a detailed "
    "sequence diagram, a communication diagram, a design class diagram "
    "organised into architectural layers, a state machine diagram, and package, "
    "component and deployment diagrams. Chapter 8 maps the class model onto a "
    "relational schema and provides a CRUD matrix for the nine collections the "
    "implementation uses.",

    "The prototype is implemented as a responsive single-page application "
    "built with HTML, CSS and JavaScript on the client and a Node.js and "
    "Express REST API on the server, backed by MongoDB through the Mongoose "
    "ODM. JSON Web Token authentication separates the admin and NGO roles, and "
    "a fifteen-second polling loop keeps every view synchronised with the "
    "database. Food photographs are resolved automatically from TheMealDB so "
    "that each listing is instantly recognisable to a partner browsing from a "
    "phone.",
]

KEYWORDS = ("Food waste reduction · surplus food redistribution · OOAD · UML · "
            "Node.js · Express · MongoDB · Mongoose · JSON Web Token · "
            "community kitchens · NGO partnerships")

# figure registry: label -> "path" ; captions are written inline instead
TOC_MAP = {"toc_table": None, "rows": []}
_bm_id = [1000]


def bookmark(par, name):
    """Wrap a heading paragraph in a bookmark so Word can report its page."""
    _bm_id[0] += 1
    start = OxmlElement("w:bookmarkStart")
    start.set(qn("w:id"), str(_bm_id[0]))
    start.set(qn("w:name"), name)
    end = OxmlElement("w:bookmarkEnd")
    end.set(qn("w:id"), str(_bm_id[0]))
    # w:pPr has to stay the first child of w:p, so insert after it
    p = par._p
    pPr = p.find(qn("w:pPr"))
    if pPr is not None:
        pPr.addnext(start)
    else:
        p.insert(0, start)
    p.append(end)
    return par


# --------------------------------------------------------------------------
# figure and table numbering
#
# Captions are numbered in the order they are written into the document rather
# than by whatever number the call site happens to carry, so a figure can never
# end up numbered out of sequence.  The chapter prefix is taken from the label
# that was supplied, which is all that is needed to renumber within a chapter.
# --------------------------------------------------------------------------
CAPTIONS = {"Figure": [], "Table": []}


def _renumber(kind, text):
    """Return (number, description) for a caption, numbered in document order."""
    m = re.match(rf"{kind}\s+(\d+)\.(\d+)\s*(.*)", text or "", re.S)
    if not m:
        raise RuntimeError(
            f"caption does not start with a {kind.lower()} number: {text!r}")
    chapter = m.group(1)
    used = [n for n, _ in CAPTIONS[kind] if n.startswith(chapter + ".")]
    number = f"{chapter}.{len(used) + 1}"
    return number, m.group(3).strip()


def figure_fit(doc, path, cap=None, **kw):
    number, description = _renumber("Figure", cap)
    CAPTIONS["Figure"].append((number, description))
    return _figure_fit(doc, path, cap=f"Figure {number}   {description}", **kw)


def table_caption(doc, text):
    number, description = _renumber("Table", text)
    CAPTIONS["Table"].append((number, description))
    return _table_caption(doc, f"Table {number}   {description}")


# ==========================================================================
# front matter
#
# The certificate, declaration, acknowledgement, abstract and table-of-contents
# pages are the university template's own paragraphs and tables, adopted in
# place by front_matter.adopt().  Only the List of Figures and List of Tables
# are new, because the template has no equivalent page.
# ==========================================================================
def _compact(doc, headers, rows):
    """A tight single-page list: small text, no cell padding, thin rules."""
    t = doc.add_table(rows=1, cols=3)
    t.style = doc.styles["Table Grid"]
    t.alignment = 1
    t.autofit = False
    fix_layout(t, [0.85, 4.45, 1.20], cell_margin_in=0.04)

    hdr = t.rows[0]
    repeat_header(hdr)
    for i, txt in enumerate(headers):
        c = hdr.cells[i]
        c.text = ""
        c.width = Inches([0.85, 4.45, 1.20][i])
        p = c.paragraphs[0]
        p.paragraph_format.space_before = Pt(1)
        p.paragraph_format.space_after = Pt(1)
        p.paragraph_format.line_spacing = 1.0
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(txt)
        r.font.size = Pt(10)
        r.bold = True
        r.font.color.rgb = BODY
        r.font.name = BODY_FONT
        cell_borders(c, color="808080", sz=2)

    for row in rows:
        cells = t.add_row().cells
        for i, v in enumerate(row):
            c = cells[i]
            c.text = ""
            c.width = Inches([0.85, 4.45, 1.20][i])
            p = c.paragraphs[0]
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.0
            p.paragraph_format.left_indent = Inches(0)
            p.paragraph_format.first_line_indent = Inches(0)
            if i == 2:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            r = p.add_run(v)
            r.font.size = Pt(9.5)
            r.font.color.rgb = BODY
            r.font.name = BODY_FONT
            cell_borders(c, color="808080", sz=2)
    return t


def list_of_figures(doc):
    heading = h_front(doc, "List of Figures", after=12)
    _compact(doc, ["S.No.", "Figure", "Page"],
             [[n, cap, ""] for n, cap in CAPTIONS["Figure"]])
    doc.add_paragraph().paragraph_format.space_after = Pt(6)
    return heading


def list_of_tables(doc):
    heading = h_front(doc, "List of Tables", after=12)
    _compact(doc, ["S.No.", "Table", "Page"],
             [[n, cap, ""] for n, cap in CAPTIONS["Table"]])
    doc.add_paragraph().paragraph_format.space_after = Pt(6)
    return heading


# ==========================================================================
# chapter 1
# ==========================================================================
def ch1(doc):
    # the section break already opened a new page, so no extra break here
    h_chapter(doc, 1, "Introduction", page_break=False)

    h1(doc, "1.1  Introduction to the Project")
    body(doc,
         "FoodLoop is a centralised web platform that reduces avoidable food waste "
         "by connecting the organisations that produce surplus food with the "
         "organisations that can use it. A restaurant, hotel, supermarket, hostel or "
         "household publishes what it has; an NGO, community kitchen, shelter or food "
         "bank asks for what it can collect; the platform records the agreement, "
         "coordinates the pickup and reports what was saved. The unit of value in "
         "the system is the kilogram of edible food that reaches a person instead of "
         "a bin.")
    body(doc,
         "The system is deliberately split into two role-specific experiences. A "
         "food provider signs in as an administrator and receives a workspace with a "
         "surplus inventory, an inbox of donation requests, a pickup board, a waste "
         "log, a partner directory and an impact dashboard. An NGO signs in and "
         "receives a much simpler portal that lists only the food currently "
         "available, with a single action — “Request this food” — on each card. "
         "Both experiences read and write the same MongoDB database through one "
         "Express REST API, so a request raised by an NGO appears in the provider's "
         "inbox within seconds.")
    body(doc,
         "Everything the provider sees is real data. Listing cards carry photographs, "
         "quantities and best-before times; the request inbox is filtered by status; "
         "the pickup board groups collections into Today, Tomorrow and Completed; "
         "the waste log explains what could not be rescued and why; and the "
         "dashboard aggregates kilograms diverted, meals shared, pending pickups and "
         "active partners. Nothing on screen is a static mock-up.")
    para(doc, "", after=4)
    figure_fit(doc, SHOTS / "01-signin.png", max_w=5.4, max_h=3.5,
               cap="Figure 1.1  Sign-in screen with the Admin / NGO role selector")
    figure_fit(doc, SHOTS / "16-ngo-dashboard.png", max_w=CONTENT_W, max_h=4.2,
               cap="Figure 1.2  NGO portal listing surplus food available near the "
                   "partner, with a request action on every card")
    body(doc,
         "The prototype is deployed publicly and is reachable at "
         "https://manisaineeli.github.io/FoodLoop/. The static page is published "
         "from GitHub Pages, while the REST API is hosted separately; the two are "
         "connected by a single configurable base URL held in config.js.")

    h1(doc, "1.2  Project Modules")
    body(doc,
         "The platform is decomposed into nine modules. Each module owns one slice "
         "of the workflow and maps to a group of use cases in Chapter 2 and to a set "
         "of REST endpoints described in Chapter 7.")
    table_caption(doc, "Table 1.1  Functional modules of FoodLoop")
    table(doc, ["Code", "Module", "Responsibility"],
          [
              ["M1", "Authentication & Role Management",
               "Registration and sign-in for admins and NGOs, bcrypt password "
               "hashing, JWT issue and verification, role-guarded views."],
              ["M2", "Food Listing Management",
               "Publish surplus food with name, quantity, best-before and notes; "
               "automatic photograph resolution; availability and reservation state."],
              ["M3", "Donation Request Handling",
               "Raise, accept and decline requests; status history; partner-facing "
               "browsing of what is available."],
              ["M4", "Pickup & Delivery Coordination",
               "Schedule a collection against a day and time, attach a delivery "
               "partner and close the pickup on delivery."],
              ["M5", "Community Partner Network",
               "Maintain the directory of NGOs, kitchens, shelters and food banks "
               "with type, service area and connection status."],
              ["M6", "Food Waste Logging & Analysis",
               "Record waste by category, quantity and reason; analyse dominant "
               "causes so prevention can be planned."],
              ["M7", "Notifications & Activity Feed",
               "Append-only event stream surfaced in the notifications panel and "
               "the Recent Activity card."],
              ["M8", "Impact Reporting",
               "Aggregate kilograms diverted, meals shared, pending pickups and "
               "active partners; export a plain-text impact report."],
              ["M9", "AI Recommendation",
               "Predict demand for a dish and analyse waste patterns to suggest the "
               "next action for the provider."],
          ],
          widths=[0.55, 2.15, 4.0], size=9.5)

    h1(doc, "1.3  Problem Statement")
    body(doc,
         "Large quantities of edible food are discarded every day because nobody "
         "who could use it knows that it exists. Donation activity is handled "
         "through phone calls, text messages and personal contacts, which does not "
         "scale: a provider who discovers forty surplus meal boxes at 6 p.m. has "
         "very little time to reach a partner before the food becomes unusable, and "
         "the provider has no way to know whether the food was actually collected.")
    bullets(doc, [
        "There is no centralised platform on which a provider can publish surplus "
        "food or a partner can discover it.",
        "Finding a nearby NGO, community kitchen, shelter or food bank depends on "
        "personal contacts rather than a searchable directory.",
        "Surplus quantities, best-before times and reservation status are not "
        "tracked, so the same batch can be claimed twice or not at all.",
        "Pickup and delivery are coordinated verbally, leaving no record of who "
        "collected what, or when.",
        "Food that cannot be rescued is not logged with a reason, so the provider "
        "cannot see whether the real cause was overproduction, spoilage or a "
        "quality issue.",
        "Providers have no measure of the impact they generate, so a successful "
        "programme is difficult to justify or improve.",
    ])

    h1(doc, "1.4  Objectives of the Project")
    numbered(doc, [
        "Provide a single web workspace where any food provider can register an "
        "account and publish surplus food in under a minute.",
        "Expose every currently available listing to registered NGOs and community "
        "partners with photographs, quantity and best-before time.",
        "Allow a partner to request a listing and a provider to accept or decline "
        "that request, with the decision persisted against the request record.",
        "Coordinate the resulting pickup by recording the collection day, time and "
        "delivery partner, and closing the pickup on delivery.",
        "Maintain a persistent, queryable record of food waste with category, "
        "quantity and reason so that recurring causes become visible.",
        "Generate an impact report showing kilograms diverted, meals shared, "
        "pending pickups and active partners, and allow it to be exported.",
        "Model the whole system with UML so that requirements, structure, behaviour "
        "and architecture can be reviewed before and during implementation.",
        "Deliver a responsive interface that works on a phone in a food bank as "
        "well as on a desktop in a restaurant office.",
    ])

    h1(doc, "1.5  Scope of the Project")
    body(doc,
         "The scope below is what the delivered prototype actually implements. "
         "Items marked out of scope are deliberate design decisions, not omissions.")
    table_caption(doc, "Table 1.2  Scope of the project")
    table(doc, ["In scope", "Out of scope (and why)"],
          [
              ["Web application served by a single Express process that serves both "
               "the page and the REST API.",
               "Native mobile applications — the responsive web interface already "
               "covers the phone use case."],
              ["MongoDB persistence for users, listings, requests, NGO requests, "
               "pickups, partners, waste, activity and metrics.",
               "Payments and settlement between providers and partners — outside the "
               "purpose of a surplus redistribution tool."],
              ["Two roles: admin (food provider) and NGO (community partner).",
               "Separate roles for delivery drivers and regulators — modelled as "
               "future work in Chapter 10."],
              ["Automatic food photograph resolution through TheMealDB.",
               "Machine-learning demand prediction — the AI Recommendation module "
               "is specified and stubbed, not trained."],
              ["Fifteen-second live polling so several users see the same data.",
               "Real-time push notification — polling already satisfies the "
               "requirement for freshness."],
              ["JWT authentication with bcrypt password hashing.",
               "Password reset and e-mail verification — left for a later release."],
          ],
          widths=[3.2, 3.3], size=9.5, keep_together=True)


# ==========================================================================
# chapter 2
# ==========================================================================
def ch2(doc):
    h_chapter(doc, 2, "Requirement Analysis")

    h1(doc, "2.1  Functional Requirements")
    body(doc,
         "Functional requirements state what the system must do. Each is given an "
         "identifier so that it can be traced to a use case, to a screen and to an "
         "endpoint later in this report.")
    table_caption(doc, "Table 2.1  Functional requirements")
    table(doc, ["ID", "Requirement", "Priority", "Realised by"],
          [
              ["FR-01", "The system shall allow a user to register an account with a "
                        "name, email address, password and a role of admin or NGO.",
               "Must", "M1 · POST /api/signup"],
              ["FR-02", "The system shall authenticate a user with an email address, "
                        "password and role, and reject a mismatch between the role "
                        "and the stored account.", "Must", "M1 · POST /api/signin"],
              ["FR-03", "The system shall store passwords only as bcrypt hashes and "
                        "shall never return a password or hash in any response.",
               "Must", "M1"],
              ["FR-04", "The system shall issue a signed JSON Web Token on successful "
                        "authentication and shall accept it on every subsequent "
                        "request.", "Must", "M1"],
              ["FR-05", "The system shall present a separate interface to an NGO "
                        "account that shows available food and allows a request to "
                        "be raised.", "Must", "M1 · M2"],
              ["FR-06", "The system shall allow an admin to publish a surplus food "
                        "listing with a name, quantity, best-before time and optional "
                        "notes.", "Must", "M2 · POST /api/listings"],
              ["FR-07", "The system shall attach a photograph to every listing, "
                        "resolved automatically from the food name.", "Should",
               "M2 · ImageResolver"],
              ["FR-08", "The system shall let an admin view all listings and search "
                        "them by name.", "Must", "M2 · GET /api/bootstrap"],
              ["FR-09", "The system shall allow an NGO to request any listing whose "
                        "status is Available.", "Must", "M3 · POST /api/requests"],
              ["FR-10", "The system shall allow an admin to accept or decline a "
                        "pending request and shall persist that decision.",
               "Must", "M3 · PATCH /api/requests/:id"],
              ["FR-11", "The system shall let an admin filter requests by All, "
                        "Pending, Accepted and Declined and search by partner or item.",
               "Must", "M3"],
              ["FR-12", "The system shall allow an admin to schedule a pickup with a "
                        "day, time, item and delivery partner.", "Must",
               "M4 · POST /api/pickups"],
              ["FR-13", "The system shall group pickups into Today, Tomorrow and "
                        "Completed and let an admin search them.", "Must", "M4"],
              ["FR-14", "The system shall allow an admin to maintain a partner "
                        "directory with name, type and distance.", "Should",
               "M5 · POST /api/partners"],
              ["FR-15", "The system shall allow an admin to log a waste entry with "
                        "date, category, quantity, reason and the person who logged "
                        "it.", "Must", "M6 · POST /api/waste"],
              ["FR-16", "The system shall maintain an activity feed recording every "
                        "listing, request, decision, pickup, waste entry and new "
                        "partner.", "Must", "M7"],
              ["FR-17", "The system shall display food diverted, meals shared, "
                        "pending pickups and active partners on the dashboard.",
               "Must", "M8 · metrics"],
              ["FR-18", "The system shall allow an admin to export the current impact "
                        "figures and the live listings and requests as a report file.",
               "Should", "M8"],
              ["FR-19", "The system shall provide a global search across listings, "
                        "requests, pickups and partners that navigates to the "
                        "matching view.", "Should", "M2 · M3 · M4 · M5"],
              ["FR-20", "The system shall report a clear, actionable message when the "
                        "backend cannot be reached, instead of a generic failure.",
               "Must", "All modules"],
          ],
          widths=[0.62, 3.42, 0.80, 1.66], size=9)
    figure_fit(doc, SHOTS / "02-signup.png", max_w=4.9, max_h=3.2,
               cap="Figure 2.1  Create-account screen implementing FR-01, with the "
                   "role that will be requested from the server")

    h1(doc, "2.2  Non-Functional Requirements")
    body(doc,
         "Non-functional requirements constrain how the system must behave rather "
         "than what it must do. They are grouped by the quality attribute they "
         "protect.")
    table_caption(doc, "Table 2.2  Non-functional requirements")
    table(doc, ["ID", "Category", "Requirement", "Measure"],
          [
              ["NFR-01", "Performance", "A view must render within two seconds of the "
                                        "data request completing.", "Observed on load"],
              ["NFR-02", "Performance", "Live data must refresh without a page reload "
                                        "at least every thirty seconds.",
               "15 s poll interval"],
              ["NFR-03", "Availability", "The host health endpoint shall report service "
                                         "status without depending on the database.",
               "GET /api/health"],
              ["NFR-04", "Scalability", "The data access layer shall isolate storage "
                                        "behind an interface so the database can be "
                                        "replaced.", "IRepository"],
              ["NFR-05", "Security", "Passwords shall be stored as salted bcrypt "
                                     "hashes and never returned by the API.",
               "bcrypt cost 10"],
              ["NFR-06", "Security", "A successful authentication shall return a "
                                     "time-limited signed token rather than a "
                                     "credential.", "JWT, 7-day expiry"],
              ["NFR-07", "Security", "The API shall refuse to serve data while the "
                                     "database is unavailable instead of hanging.",
               "HTTP 503"],
              ["NFR-08", "Usability", "The interface shall be usable on a 430-pixel "
                                     "wide phone screen.", "Responsive CSS"],
              ["NFR-09", "Usability", "Every view shall be reachable from the sidebar "
                                     "within one interaction.", "Single-level nav"],
              ["NFR-10", "Reliability", "The server shall retry a failed database "
                                        "connection with backoff instead of exiting.",
               "10 s to 15 s backoff"],
              ["NFR-11", "Maintainability", "Configuration shall live in environment "
                                           "variables so no secret is committed.",
               ".env / render.yaml"],
              ["NFR-12", "Portability", "The same build shall run on a local machine "
                                        "and on a hosted Node environment.",
               "render.yaml blueprint"],
          ],
          widths=[0.74, 1.02, 3.14, 1.10], size=9)

    h1(doc, "2.3  Actors and Their Roles")
    body(doc,
         "An actor is any entity that interacts with the system from outside it. "
         "FoodLoop recognises six actors: four human roles and two supporting ones.")
    table_caption(doc, "Table 2.3  Actors and their roles")
    table(doc, ["Actor", "Kind", "Goal", "Interfaces used"],
          [
              ["Admin (food provider)", "Human",
               "Publish surplus, decide on requests, schedule pickups, log waste, "
               "read the impact report.",
               "Admin workspace"],
              ["NGO / Food Bank", "Human",
               "Find food it can collect and request it before the best-before time.",
               "NGO portal"],
              ["Restaurant / Hotel / Supermarket", "Human",
               "Act as the concrete provider that records surplus; the admin role "
               "is used on their behalf.", "Admin workspace"],
              ["Delivery Partner", "Human",
               "Accept a pickup, collect the food and confirm receipt.",
               "Pickup board"],
              ["User", "Human",
               "Hold an authenticated session; the generic account holder from "
               "whom the specific roles are derived.", "Sign-in screen"],
              ["AI System", "Supporting",
               "Predict demand for a dish and analyse waste patterns to recommend an "
               "action.", "AiRecommender"],
              ["TheMealDB (external service)", "External",
               "Supply a photograph for a named dish or ingredient.",
               "ImageResolver (HTTPS)"],
          ],
          widths=[1.75, 0.85, 2.75, 1.15], size=9.5, keep_together=True)

    h1(doc, "2.4  Use Case Identification")
    body(doc,
         "Fourteen use cases were identified from the actor analysis and the "
         "functional requirements. Each is given a stable identifier that the class "
         "model, the sequence diagrams and the database design all refer back to.")
    table_caption(doc, "Table 2.4  Identified use cases")
    table(doc, ["ID", "Use case", "Primary actor", "Supporting actors", "Requirement"],
          [
              ["UC-01", "Register / Log In", "User", "—", "FR-01, FR-02, FR-04"],
              ["UC-02", "List Surplus Food", "Restaurant / Hotel / Supermarket",
               "AI System, NGO", "FR-06, FR-07"],
              ["UC-03", "View Available Food", "NGO / Food Bank", "Admin", "FR-05, FR-08"],
              ["UC-04", "Request Surplus Food", "NGO / Food Bank", "Admin", "FR-09"],
              ["UC-05", "Manage Donation", "Admin", "NGO, Delivery Partner",
               "FR-10, FR-11"],
              ["UC-06", "Arrange Pickup", "Admin", "Delivery Partner", "FR-12"],
              ["UC-07", "Track Delivery", "Delivery Partner", "NGO, Admin", "FR-13"],
              ["UC-08", "Manage Users", "Admin", "—", "FR-01, FR-02"],
              ["UC-09", "Record Food Waste", "Admin", "AI System", "FR-15"],
              ["UC-10", "Analyse Food Waste", "Admin", "AI System", "FR-15"],
              ["UC-11", "Manage Partner", "Admin", "NGO", "FR-14"],
              ["UC-12", "Generate Reports", "Admin", "—", "FR-17, FR-18"],
              ["UC-13", "Receive Notifications", "NGO", "Admin", "FR-16"],
              ["UC-14", "Generate AI Recommendations", "AI System",
               "Admin, NGO", "FR-07"],
          ],
          widths=[0.55, 1.75, 1.55, 1.4, 1.25], size=9)

    h1(doc, "2.5  Use Case Descriptions")
    body(doc,
         "The five most significant use cases are specified below in the standard "
         "template: the primary actor, the supporting actors, the trigger, the "
         "precondition, the normal flow, the alternative flows and the "
         "postcondition. The remaining nine are summarised in Table 2.4 and "
         "described in prose in the chapters that implement them.")

    def uc(doc, tnum, ident, name, rows):
        table_caption(doc, f"Table 2.{tnum}  Use case specification — {name}")
        table(doc, ["Element", "Description"], rows, widths=[1.35, 5.15],
              size=9.5, align=[None, None], keep_together=True)

    uc(doc, "5", "UC-01", "Register / Log In", [
        ["Use case ID", "UC-01"],
        ["Name", "Register / Log In"],
        ["Primary actor", "User"],
        ["Supporting actor", "None"],
        ["Trigger", "The user submits the sign-in or create-account form."],
        ["Precondition", "The Express API is running and reachable."],
        ["Normal flow",
         "1. The system validates that all four fields are present.\n"
         "2. It hashes the password with bcrypt at cost 10.\n"
         "3. It rejects the attempt if the email is already registered (409).\n"
         "4. It inserts the user document into the users collection.\n"
         "5. It signs a JWT carrying the user id and role, valid for 7 days.\n"
         "6. It stores the session and reveals the role-specific interface."],
        ["Alternative flows",
         "A required field is missing → 400 with a field-level message.\n"
         "The email already exists → 409, the form stays on Create Account.\n"
         "The role does not match the stored account → 403 telling the user to "
         "switch roles.\n"
         "The API cannot be reached → the form shows the actionable hint from "
         "FR-20."],
        ["Postcondition", "An authenticated session exists and the correct "
                          "workspace is displayed."],
        ["Related requirements", "FR-01 to FR-04, FR-20 · NFR-05, NFR-06"],
    ])

    uc(doc, "6", "UC-02", "List Surplus Food", [
        ["Use case ID", "UC-02"],
        ["Name", "List Surplus Food"],
        ["Primary actor", "Restaurant / Hotel / Supermarket"],
        ["Supporting actor", "AI System"],
        ["Trigger", "The provider opens the Add food listing modal and submits it."],
        ["Precondition", "The provider holds an admin session."],
        ["Normal flow",
         "1. The system validates the food name, quantity and best-before time.\n"
         "2. It derives a search keyword from the name, stripping filler words.\n"
         "3. It queries TheMealDB for a dish photograph and falls back to an "
         "ingredient photograph.\n"
         "4. It inserts a listing with status Available and requests '0 requests'.\n"
         "5. It appends a 'Food listing published' activity entry.\n"
         "6. It returns the new listing and re-renders the inventory."],
        ["Alternative flows",
         "A required field is empty → 400 and the modal stays open.\n"
         "The photograph service times out → a default bread photograph is used.\n"
         "No photograph is found at all → the listing falls back to its emoji "
         "glyph, so a tile is never blank."],
        ["Postcondition", "The surplus food is visible to every partner browsing "
                          "available listings."],
        ["Related requirements", "FR-06, FR-07, FR-16 · NFR-01"],
    ])

    uc(doc, "7", "UC-04", "Request Surplus Food", [
        ["Use case ID", "UC-04"],
        ["Name", "Request Surplus Food"],
        ["Primary actor", "NGO / Food Bank"],
        ["Supporting actor", "Admin"],
        ["Trigger", "The partner presses “Request this food” on a listing card."],
        ["Precondition",
         "The partner holds an NGO session and the listing status is Available."],
        ["Normal flow",
         "1. The system records the partner's request intent.\n"
         "2. It inserts a request document with status pending.\n"
         "3. It mirrors the item into the ngoRequests collection.\n"
         "4. It appends a 'New request received' activity entry.\n"
         "5. The card switches to 'Request sent' and becomes disabled.\n"
         "6. The request appears in the provider's inbox on the next poll."],
        ["Alternative flows",
         "The item is missing → 400 and the toast explains the failure.\n"
         "The partner has already requested this item → the button stays disabled.\n"
         "The API is unreachable → the last known good mirror is kept and a toast "
         "is shown."],
        ["Postcondition", "A pending request exists against the listing and the "
                          "provider has been notified."],
        ["Related requirements", "FR-09, FR-16, FR-19 · NFR-02, NFR-08"],
    ])

    uc(doc, "8", "UC-05", "Manage Donation", [
        ["Use case ID", "UC-05"],
        ["Name", "Manage Donation"],
        ["Primary actor", "Admin"],
        ["Supporting actor", "NGO / Food Bank, Delivery Partner"],
        ["Trigger", "The provider presses Accept request or Decline on a pending "
                    "request."],
        ["Precondition", "The request status is pending."],
        ["Normal flow (accept)",
         "1. The system sets the request status to accepted and saves it.\n"
         "2. It appends a 'Donation accepted' activity entry.\n"
         "3. It returns the updated request, re-renders the inbox and reloads "
         "the data set."],
        ["Normal flow (decline)",
         "1. The system sets the request status to declined and saves it.\n"
         "2. The listing stays Available so another partner can claim it."],
        ["Alternative flow", "The request no longer exists → 404 with an explicit "
                             "message."],
        ["Postcondition", "The decision is persisted and visible to the partner."],
        ["Related requirements", "FR-10, FR-11, FR-16"],
    ])

    uc(doc, "9", "UC-09", "Record Food Waste", [
        ["Use case ID", "UC-09"],
        ["Name", "Record Food Waste"],
        ["Primary actor", "Admin"],
        ["Supporting actor", "AI System"],
        ["Trigger", "The provider presses Log waste on the Waste log view."],
        ["Precondition", "The provider holds an admin session."],
        ["Normal flow",
         "1. The system prompts for category, quantity and reason.\n"
         "2. It validates that all three are present.\n"
         "3. It inserts a waste document stamped with today's date and the "
         "logged-by name.\n"
         "4. It appends a 'Waste logged' activity entry.\n"
         "5. It re-renders the waste table."],
        ["Alternative flows",
         "A field is empty → 400 and the table is left unchanged.\n"
         "A reason is not chosen → 'Other' is recorded."],
        ["Postcondition", "The loss is recorded and available for analysis under "
                          "UC-10."],
        ["Related requirements", "FR-15, FR-16"],
    ])

    h1(doc, "2.6  Event List")
    body(doc,
         "An event is a significant occurrence that the system must recognise. "
         "Events are the bridge between use cases and the design models: each one "
         "names the object it affects, the class that reacts and the notification "
         "that the user sees.")
    table_caption(doc, "Table 2.10  Event list")
    table(doc, ["ID", "Event", "Triggered by", "Object affected", "Maps to"],
          [
              ["E-01", "UserRegistered", "A completed create-account form",
               "User", "UC-01 · FR-01"],
              ["E-02", "UserSignedIn", "A successful authentication", "User",
               "UC-01 · FR-02"],
              ["E-03", "SurplusFoodListed", "Publishing a listing", "FoodItem",
               "UC-02 · FR-06"],
              ["E-04", "FoodPhotoResolved", "A photograph is resolved for a listing",
               "FoodItem", "UC-14 · FR-07"],
              ["E-05", "DonationRequested", "A partner presses Request this food",
               "Donation", "UC-04 · FR-09"],
              ["E-06", "DonationAccepted", "The provider accepts a request",
               "Donation", "UC-05 · FR-10"],
              ["E-07", "DonationDeclined", "The provider declines a request",
               "Donation", "UC-05 · FR-10"],
              ["E-08", "NotificationRaised", "Any of E-03 to E-07", "Notification",
               "UC-13 · FR-16"],
              ["E-09", "PickupScheduled", "Scheduling a collection", "Pickup",
               "UC-06 · FR-12"],
              ["E-10", "FoodDelivered", "Marking a pickup delivered", "Pickup",
               "UC-07 · FR-13"],
              ["E-11", "WasteLogged", "Recording a waste entry", "WasteRecord",
               "UC-09 · FR-15"],
              ["E-12", "WasteAnalysed", "A report or trend is requested",
               "WasteRecord", "UC-10 · FR-15"],
              ["E-13", "PartnerJoined", "A partner is added to the directory",
               "NGO", "UC-11 · FR-14"],
              ["E-14", "ReportGenerated", "Generating or exporting the impact report",
               "Admin", "UC-12 · FR-17"],
          ],
          widths=[0.55, 1.45, 2.15, 1.25, 1.1], size=9)

    h1(doc, "2.7  Event Table")
    body(doc,
         "Table 2.6 pairs each event with the response the system must produce and "
         "the requirement that justifies it. This table is the acceptance checklist "
         "used to test the implementation.")
    table_caption(doc, "Table 2.11  Event table — stimulus, response and requirement")
    table(doc, ["ID", "Event", "System response", "Requirement"],
          [
              ["E-01", "UserRegistered",
               "Insert the user document with a bcrypt hash, sign a JWT, store the "
               "session and open the correct workspace.", "FR-01, FR-04"],
              ["E-02", "UserSignedIn",
               "Compare the hash, verify the role, return a token and a safe user "
               "object, and reject a role mismatch with 403.", "FR-02, FR-03"],
              ["E-03", "SurplusFoodListed",
               "Persist the listing as Available, append an activity entry and "
               "re-render the inventory and dashboard counts.", "FR-06, FR-16"],
              ["E-04", "FoodPhotoResolved",
               "Attach the first photograph URL that answers a HEAD request, "
               "otherwise fall back to an ingredient image and finally to the "
               "default.", "FR-07"],
              ["E-05", "DonationRequested",
               "Insert a pending request, mirror it to ngoRequests, append an "
               "activity entry and notify the provider.", "FR-09, FR-16"],
              ["E-06", "DonationAccepted",
               "Set the status to accepted, append 'Donation accepted' and reload "
               "so the partner sees the new state.", "FR-10"],
              ["E-07", "DonationDeclined",
               "Set the status to declined and leave the listing Available for "
               "another partner.", "FR-10"],
              ["E-08", "NotificationRaised",
               "Append to the activity collection, increment the badge and list the "
               "entry in the notifications panel.", "FR-16"],
              ["E-09", "PickupScheduled",
               "Insert the pickup and place its card under Today, Tomorrow or "
               "Completed.", "FR-12, FR-13"],
              ["E-10", "FoodDelivered",
               "Move the pickup to Completed, update the donation status and "
               "increment the diverted kilograms.", "FR-13, FR-17"],
              ["E-11", "WasteLogged",
               "Insert the waste document with its reason and append 'Waste "
               "logged'.", "FR-15"],
              ["E-12", "WasteAnalysed",
               "Aggregate waste by category and reason and show the dominant cause "
               "on the Waste log view.", "FR-15"],
              ["E-13", "PartnerJoined",
               "Insert the partner, derive its initials, and append 'New partner "
               "joined'.", "FR-14, FR-16"],
              ["E-14", "ReportGenerated",
               "Build the impact report from live data and offer it as a "
               "downloadable file.", "FR-17, FR-18"],
          ],
          widths=[0.55, 1.4, 3.35, 1.2], size=9)


# ==========================================================================
# chapter 3
# ==========================================================================
def ch3(doc):
    h_chapter(doc, 3, "Use Case and Domain Modelling")

    h1(doc, "3.1  Use Case Modelling")
    body(doc,
         "The use case model is the requirement model of the system. It shows what "
         "the system does for whom, and it is the first artefact to be reviewed "
         "with the client because it contains no implementation detail at all.")

    h2(doc, "3.1.1  Use Case Diagram")
    body(doc,
         "Figure 3.1 is the use case diagram for the AI-Based Food Waste Reduction "
         "Platform. The rectangle is the system boundary. Six actors sit outside "
         "it and interact only through the fourteen use cases inside. Three "
         "relationships refine the model: «include» where one use case always "
         "calls another as part of its own completion, and «extend» where a use "
         "case adds behaviour only under a particular condition.")
    figure_fit(doc, DIAG / "use-case.png", max_w=CONTENT_W, max_h=6.1,
               cap="Figure 3.1  Use case diagram of the AI-Based Food Waste "
                   "Reduction Platform")

    h2(doc, "3.1.2  Description and Terminology")
    table_caption(doc, "Table 3.1  Use case modelling terminology")
    table(doc, ["Term", "Meaning", "Seen in this project"],
          [
              ["Actor", "An external entity that interacts with the system and "
                        "benefits from it.", "Admin, NGO, Delivery Partner, AI System"],
              ["Use case", "A complete, externally observable behaviour that "
                           "achieves one actor goal.", "Fourteen, listed in Table 2.4"],
              ["System boundary", "The rectangle separating the system under "
                                  "construction from everything outside it.",
               "The box labelled AI-Based Food Waste Reduction Platform"],
              ["«include»", "A mandatory reuse relationship: the base use case "
                             "always invokes the included one.",
               "Arrange Pickup «include» Track Delivery"],
              ["«extend»", "An optional relationship: the extending use case adds "
                           "behaviour only when its condition holds.",
               "Arrange Pickup «extend» Receive Notifications"],
              ["Generalisation", "An inheritance relationship between actors or "
                                 "between use cases, allowing a specialised actor "
                                 "to add behaviour.",
               "User is the parent of Admin and NGO"],
              ["Trigger", "The event that starts the use case.",
               "Submitting the Add food listing form"],
              ["Precondition", "The state that must hold before the use case runs.",
               "An admin session exists"],
              ["Postcondition", "The state that holds once the use case completes.",
               "The listing is Available to every partner"],
              ["Alternative flow", "A branch taken when a step cannot be completed "
                                   "as described.", "The photograph service times out"],
          ],
          widths=[1.15, 3.0, 2.35], size=9.5, keep_together=True)

    h2(doc, "3.1.3  Project-Specific Explanation")
    body(doc,
         "Three pairs of include and extend relationships carry most of the "
         "meaning in Figure 3.1, and each corresponds directly to a behaviour in the "
         "running application.")
    bullets(doc, [
        "Arrange Pickup «include» Track Delivery. A pickup cannot exist without "
        "being tracked, so the tracking behaviour is not optional. In the "
        "implementation, scheduling a pickup always creates the record that the "
        "pickup board reads back, and marking it delivered always updates the "
        "donation status.",
        "Arrange Pickup «extend» Receive Notifications. The pickup itself is not "
        "sent to the NGO portal; the notification is added only when a partner has "
        "to be told. This matches the code, where an activity entry is written for "
        "the pickup while the partner-facing alert is a separate decision.",
        "Record Food Waste «include» Analyse Food Waste, and Analyse Food Waste "
        "«extend» Predict Food Demand. Every waste entry is recorded so that it can "
        "be analysed; the prediction is invoked only when a provider asks for a "
        "trend rather than for a single entry.",
        "Generate AI Recommendations «include» Add Food Data. A recommendation is "
        "only as good as the data behind it, so the recommendation use case depends "
        "on the listing and waste data being present.",
        "User is the parent of both Admin and NGO. The sign-in form therefore asks "
        "for a role, and the server refuses a mismatch between the chosen role and "
        "the role stored against the account.",
    ])
    body(doc,
         "The four screenshots that follow are the running system showing three of "
         "these use cases and one supporting module. They are included so that the "
         "diagrams can be checked against what was actually built.")
    figure_fit(doc, SHOTS / "04-food-listings.png", max_w=CONTENT_W, max_h=4.1,
               cap="Figure 3.4  Food listings view — UC-02 List Surplus Food and "
                   "UC-03 View Available Food")
    figure_fit(doc, SHOTS / "05-requests.png", max_w=CONTENT_W, max_h=4.1,
               cap="Figure 3.5  Donation requests inbox — UC-04 Request Surplus Food "
                   "and UC-05 Manage Donation, with live status tabs")
    figure_fit(doc, SHOTS / "06-pickups.png", max_w=CONTENT_W, max_h=4.1,
               cap="Figure 3.6  Pickup coordination board — UC-06 Arrange Pickup "
                   "and UC-07 Track Delivery")
    figure_fit(doc, SHOTS / "08-partners.png", max_w=CONTENT_W, max_h=4.1,
               cap="Figure 3.7  Community partners view — UC-11 Manage Partner, "
                   "filtered by partner type")

    h1(doc, "3.2  Domain Modelling")
    body(doc,
         "Where the use case model answers “what does the system do”, the domain "
         "model answers “what is the system made of”. The domain class diagram "
         "identifies the classes that hold the information the business rules act "
         "on, and it deliberately excludes anything that exists only to serve the "
         "implementation.")

    h2(doc, "3.2.1  Domain Class Diagram")
    body(doc,
         "Figure 3.2 is the domain class diagram. Ten classes carry the vocabulary "
         "of the problem: Restaurant, FoodItem, Donation, NGO, Pickup, "
         "WasteRecord, Notification, User, Admin and AiRecommendation. Each class "
         "shows the attributes the business needs and the operations that change "
         "its state; visibility markers follow the UML convention, with a minus for "
         "private state and a plus for public behaviour.")
    figure_fit(doc, DIAG / "class.png", max_w=CONTENT_W, max_h=4.3,
               cap="Figure 3.2  Domain class diagram with attributes, operations and "
                   "multiplicities")

    h2(doc, "3.2.2  Description and Terminology")
    table_caption(doc, "Table 3.2  Domain modelling terminology")
    table(doc, ["Term", "Meaning", "Seen in this project"],
          [
              ["Class", "A description of a set of objects that share structure and "
                        "behaviour.", "Donation is a class; each request is an object"],
              ["Object", "A concrete instance of a class with its own attribute "
                         "values.", "donation1 : DN-1042"],
              ["Attribute", "A property that describes an instance of a class.",
               "FoodItem.food : String"],
              ["Operation", "A behaviour an instance of a class can perform.",
               "Donation.accept() : void"],
              ["Association", "A structural link between two classes.",
               "Restaurant offers FoodItem"],
              ["Multiplicity", "How many instances of one class may be linked to an "
                               "instance of the other.",
               "1 Restaurant to 0..* FoodItem"],
              ["Dependency", "A weak, “uses” relationship where one class relies "
                              "on another without owning it.",
               "AiRecommendation advises Restaurant"],
              ["Stereotype", "A keyword that refines what a class means.",
               "AiRecommendation is an AI component"],
              ["Object diagram", "A snapshot of real instances and the links between "
                                 "them at one moment in time.",
               "Figure 3.3"],
          ],
          widths=[1.2, 2.85, 2.45], size=9.5, keep_together=True)

    h2(doc, "3.2.3  Project-Specific Explanation")
    body(doc,
         "The multiplicities in Figure 3.2 are the constraints that the business "
         "actually imposes. One Restaurant offers zero or more FoodItem objects, "
         "because it may not have surplus at all on a given day. One FoodItem "
         "becomes zero or one Donation, because two partners cannot claim the same "
         "batch. One Donation is received by exactly one NGO and is fulfilled by "
         "zero or one Pickup, since an accepted request may still be awaiting "
         "collection. One Delivery Partner handles zero or more pickups, and every "
         "Pickup is handled by exactly one partner. A WasteRecord is written for "
         "each unsalvaged batch and notifies the Admin, which is why Notification "
         "has a «sent to» dependency on User.")
    body(doc,
         "Figure 3.3 shows the same model as an object diagram at a single instant: "
         "the instance restaurant1 of Restaurant, named “Green Leaf Hotel”, has "
         "offered food1, a Veg Biryani of 15.0 kg expiring on 18 August at 22:00. "
         "The AI component has already produced rec1, an AiRecommendation of type "
         "Redistribute with a confidence of 0.92. food1 has become donation1, an "
         "approved donation of 15.0 kg, which was received by ngo1, “Helping Hands”, "
         "and is fulfilled by pickup1, scheduled for 18 August at 19:30 and handled "
         "by partner1, whose vehicle is available. notif1 tells the NGO that new "
         "surplus is available and has not yet been read. Reading the object diagram "
         "alongside the class diagram is what makes the multiplicities concrete: "
         "here every 1 is satisfied exactly once.")
    figure_fit(doc, DIAG / "object.png", max_w=3.9, max_h=4.4,
               cap="Figure 3.3  Object diagram — an instance snapshot of a donation "
                   "in progress")
    figure_fit(doc, SHOTS / "07-waste-log.png", max_w=CONTENT_W, max_h=4.1,
               cap="Figure 3.8  Waste log view — UC-09 Record Food Waste and "
                   "UC-10 Analyse Food Waste, grouped by reason")


# ==========================================================================
# chapter 4
# ==========================================================================
def ch4(doc):
    h_chapter(doc, 4, "Interaction Modelling")

    h1(doc, "4.1  System Sequence Diagram")
    body(doc,
         "The system sequence diagram is the black-box view of one complete "
         "scenario. Only the system appears as a single lifeline; every internal "
         "object is hidden, which makes the diagram useful for agreeing business "
         "outcomes with the client before any design decision is made.")
    body(doc,
         "Figure 4.1 traces the central scenario of the project — a restaurant "
         "publishes surplus, an NGO asks for it, the provider decides, the food is "
         "collected and the impact is reported. The numbering is chronological and "
         "matches the event list in Table 2.10. The alternative fragment shows what "
         "happens when the partner declines, which is the branch that leaves the "
         "listing available for someone else.")
    figure_fit(doc, DIAG / "system-sequence.png", max_w=5.5, max_h=6.4,
               cap="Figure 4.1  System sequence diagram for publishing surplus and "
                   "completing a donation")
    table_caption(doc, "Table 4.1  Messages of the system sequence diagram")
    table(doc, ["#", "Message", "Direction", "Event"],
          [
              ["1", "login(credentials)", "Restaurant Admin → System", "E-02"],
              ["2", "authenticationResult(token)", "System → Restaurant Admin", "E-02"],
              ["3", "enterSurplusFoodDetails(name, qty, bestBefore)",
               "Restaurant Admin → System", "E-03"],
              ["4", "listingPublished(listing, photoUrl)", "System → Restaurant Admin",
               "E-03, E-04"],
              ["5", "notifyAvailableFood(listing)", "System → NGO", "E-05, E-08"],
              ["6", "requestFood(listingId)", "NGO → System", "E-05"],
              ["7", "donationAccepted()", "System → NGO", "E-06"],
              ["8", "declineRequest()", "System → NGO", "E-07"],
              ["9", "schedulePickup(day, time, partner)", "Restaurant Admin → System",
               "E-09"],
              ["10", "pickupDelivered()", "System → Restaurant Admin", "E-10"],
              ["11", "updateDonationStatus('Delivered')",
               "System → Restaurant Admin", "E-10"],
              ["12", "generateImpactReport()", "Restaurant Admin → System", "E-14"],
              ["13", "report(foodDiverted, mealsShared)",
               "System → Restaurant Admin", "E-14"],
          ],
          widths=[0.4, 3.15, 2.15, 0.8], size=9, keep_together=True)

    h1(doc, "4.2  High-Level Sequence Diagram")
    body(doc,
         "The high-level sequence diagram opens the system boundary and names the "
         "components that actually exchange messages. It answers a different "
         "question from Figure 4.1: not what the system promises, but which parts of "
         "the implementation are responsible for keeping that promise.")
    body(doc,
         "Figure 4.2 shows the full path a listing takes. The browser submits to the "
         "REST API, which asks the AI engine for analysis and writes the record to "
         "the database, saves the recommendation, triggers the notification service "
         "and answers. The NGO then requests food through the same API, a pickup is "
         "scheduled with the delivery service, and the delivery status comes back to "
         "be written against the donation. The final response returns to the user, "
         "who sees a confirmation.")
    figure_fit(doc, DIAG / "high-level-sequence.png", max_w=CONTENT_W, max_h=6.0,
               cap="Figure 4.2  High-level sequence diagram showing the interaction "
                   "between the major components")

    h1(doc, "4.3  Detailed Sequence Diagram")
    body(doc,
         "The detailed sequence diagram descends into the internals of the system. "
         "Where Figure 4.2 treats the AI engine and the notification service as "
         "single participants, Figure 4.3 expands the system into the actors and "
         "internal objects that implement the scenario, and it makes the alternative "
         "path explicit.")
    body(doc,
         "Figure 4.3 shows the Restaurant logging in, entering the surplus details "
         "and receiving a recommendation with a confidence value from the AI engine. "
         "The system then notifies available food to the NGO. The alt fragment is the "
         "important part: if the restaurant approves, a pickup request is created and "
         "the delivery partner accepts, delivers and confirms the receipt, after "
         "which the status is marked Delivered. If the restaurant rejects, the NGO "
         "is told the food is unavailable and the listing returns to the pool. This "
         "is precisely the branch recorded as events E-06 and E-07 in Table 2.10.")
    figure_fit(doc, DIAG / "sequence.png", max_w=4.6, max_h=6.2,
               cap="Figure 4.3  Detailed sequence diagram of the donation process, "
                   "with the approve and reject branches")

    h1(doc, "4.4  Communication Diagram")
    body(doc,
         "The communication diagram presents the same scenario as Figure 4.3 but "
         "organises it by object rather than by time. The links between object "
         "instances are the arrows; the order in which they are traversed is "
         "carried by the message numbers. It is the right diagram when the question "
         "is which objects collaborate, and it is a useful cross-check that no "
         "object is left without a collaborator.")
    figure_fit(doc, DIAG / "communication.png", max_w=CONTENT_W, max_h=6.0,
               cap="Figure 4.4  Communication diagram of the same scenario, showing "
                   "the object links in chronological order")


# ==========================================================================
# chapter 5
# ==========================================================================
def ch5(doc):
    h_chapter(doc, 5, "Design Class Modelling")

    h1(doc, "5.1  Design Class Diagram")
    body(doc,
         "The design class diagram refines the domain model into something that can "
         "be implemented. It adds the layers the implementation actually uses — "
         "presentation, application services, domain entities and persistence — and "
         "introduces two interfaces that let the layers be tested and replaced "
         "independently: IAuthService and IRepository.")
    figure_fit(doc, DIAG / "design-class.png", max_w=CONTENT_W, max_h=7.2,
               cap="Figure 5.1  Design class diagram organised into presentation, "
                   "service, entity and persistence layers")

    h1(doc, "5.2  Classes, Attributes and Operations")
    body(doc,
         "Table 5.1 lists the attributes and operations of each design class. The "
         "attributes are private because no client code may reach into an entity "
         "directly; every change is made through one of the public operations, "
         "which is what keeps the status rules in one place.")
    table_caption(doc, "Table 5.1  Design classes, attributes and operations")
    table(doc, ["Class", "Key attributes", "Operations"],
          [
              ["User", "userId, email, passwordHash, role, joinedOn",
               "login(), logout(), updateProfile()"],
              ["FoodListing", "listingId, name, quantity, bestBefore, photoUrl, status",
               "publish(dto), listSurplus(), reserve(), checkExpiry()"],
              ["DonationRequest", "requestId, ngoId, foodName, requestedAt, status",
               "createDonation(), accept(), decline(), notifyFood()"],
              ["Pickup", "pickupId, scheduledTime, status, partnerId",
               "assignPartner(), trackDelivery(), markDelivered()"],
              ["Partner", "partnerId, name, type, serviceArea, capacity",
               "register(), requestFood(), confirmReceipt()"],
              ["WasteRecord", "wasteId, category, quantity, reason, loggedOn",
               "logWaste(), calculateWaste()"],
              ["Notification", "noteId, message, isRead, timestamp",
               "send(), markRead()"],
              ["ImpactMetric", "metricId, foodDivertedKg, mealsShared, "
                               "pendingPickups, activePartners",
               "generateReport(), aggregate()"],
              ["ApiClient", "baseUrl, token, timeoutMs",
               "get(), post(), patch(), bootstrap(), poll()"],
              ["AuthService", "— (interface)",
               "signUp(dto), signIn(dto), verifyToken(token)"],
              ["IRepository", "— (interface)",
               "findAll(), findById(id), insert(doc), update(id, doc), remove(id)"],
              ["MongoRepository", "model",
               "implements IRepository"],
          ],
          widths=[1.35, 2.55, 2.6], size=9, keep_together=True)
    body(doc,
         "The mapping back to the implementation is direct. FoodListing corresponds "
         "to the listingSchema and its Listing model; DonationRequest to "
         "requestSchema; WasteRecord to wasteSchema; Notification to activitySchema, "
         "which also backs the activity feed; ImpactMetric to metricSchema. "
         "ApiClient corresponds to the api() helper in app.js, and AuthService to the "
         "three /api routes that implement it.")

    h1(doc, "5.3  Relationships and Multiplicity")
    table_caption(doc, "Table 5.2  Relationships and multiplicity in the design model")
    table(doc, ["From", "Relationship", "To", "Mult.", "Reading"],
          [
              ["User", "lists", "FoodListing", "1 : 0..*",
               "One user publishes zero or many listings."],
              ["FoodListing", "received by", "DonationRequest", "1 : 0..*",
               "One listing can attract several requests, but only one can be accepted."],
              ["DonationRequest", "fulfilled by", "Pickup", "1 : 0..1",
               "An accepted donation produces at most one pickup."],
              ["DonationRequest", "requested by", "Partner", "1 : 0..*",
               "One partner raises many requests; each request names one partner."],
              ["Pickup", "aggregated into", "ImpactMetric", "1 : 0..*",
               "Each completed pickup moves the impact counters."],
              ["FoodListing", "produces", "WasteRecord", "1 : 0..*",
               "A listing that expires uncollected becomes a waste record."],
              ["WasteRecord", "logs", "Notification", "1 : 0..1",
               "Logging waste raises exactly one activity entry."],
          ],
          widths=[1.30, 1.32, 1.20, 0.80, 1.88], size=9, keep_together=True)

    h1(doc, "5.4  Interfaces, Dependencies and Generalization")
    body(doc,
         "Table 5.3 records the non-structural relationships. They matter because "
         "they are the seams along which the system can be changed without touching "
         "the rest of it.")
    table_caption(doc, "Table 5.3  Interfaces, dependencies and generalisation")
    table(doc, ["Relationship", "Kind", "From → To", "Meaning and benefit"],
          [
              ["Realisation", "«interface»", "AuthService → ApiClient",
               "The client side of authentication depends on the interface, not on "
               "the Express routes, so the transport can be replaced."],
              ["Realisation", "«interface»", "IRepository → MongoRepository",
               "The persistence contract is separate from Mongoose, which is what "
               "makes NFR-04 (swappable storage) achievable."],
              ["Dependency", "«uses»", "Presentation → Application services",
               "Views and controllers call services; they never touch entities or "
               "models directly."],
              ["Dependency", "«uses»", "Application services → Domain entities",
               "Services orchestrate entities; entities hold no service references."],
              ["Dependency", "«persists»", "Domain entities → Persistence",
               "Entities are written through repositories, not saved directly."],
              ["Dependency", "«queries»", "MongoRepository → TheMealDB API",
               "Photograph resolution is an external call isolated inside the "
               "repository, so a failure cannot corrupt a listing."],
              ["Dependency", "«drives»", "Presentation → Presentation",
               "index.html and app.js: the markup drives the controller layer."],
              ["Generalisation", "Inheritance", "User → Admin",
               "An admin is a user with provider rights."],
              ["Generalisation", "Inheritance", "User → NGO",
               "An NGO is a user with request rights and a restricted portal."],
          ],
          widths=[1.28, 1.02, 1.55, 2.65], size=9, keep_together=True)


# ==========================================================================
# chapter 6
# ==========================================================================
def ch6(doc):
    h_chapter(doc, 6, "Behavioural Modelling")

    h1(doc, "6.1  Activity Diagram")
    body(doc,
         "The activity diagram models the workflow of the surplus redistribution "
         "process as a sequence of activities connected by control and data flow. "
         "It begins when a provider logs in and ends when the NGO confirms the "
         "receipt, and it shows the two decision points that give the process its "
         "shape: whether the submitted information is valid, and whether the food is "
         "suitable for donation at all.")
    body(doc,
         "The first diamond sends invalid input back to the provider with an error "
         "message, which is FR-20 and the retry loop in the implementation. The "
         "second diamond is the heart of the process. If the food is not suitable it "
         "is recorded as waste and the analytics are updated, and the flow ends. If "
         "it is suitable, a nearby NGO is found and notified; the flow then waits "
         "for a response, and a refusal sends the search back to another NGO rather "
         "than ending the process. Acceptance leads to arranging the pickup, "
         "assigning a delivery partner, delivering the food, updating the donation "
         "status and confirming the receipt.")
    figure_fit(doc, DIAG / "activity.png", max_w=3.7, max_h=6.4,
               cap="Figure 6.1  Activity diagram of the surplus food redistribution "
                   "workflow")
    body(doc,
         "The dashboard in Figure 6.2 is the visible consequence of this workflow. "
         "The kilograms diverted, meals shared, pending pickups and active partners "
         "counters are all derived from the same records the activity diagram "
         "produces, and the recent activity list is the event stream in "
         "chronological order.")
    figure_fit(doc, SHOTS / "03-overview.png", max_w=CONTENT_W, max_h=4.2,
               cap="Figure 6.2  Overview dashboard — live impact counters and the "
                   "recent activity feed")

    h1(doc, "6.2  State Machine Diagram")
    body(doc,
         "Where the activity diagram describes the process, the state machine "
         "describes one object through that process. Figure 6.3 follows a single "
         "DonationRequest from creation to completion and shows exactly which "
         "transitions are legal.")
    body(doc,
         "A request is created in the pending state. The provider may accept it, "
         "which moves it to accepted and permits a delivery partner to be assigned, "
         "or decline it, which is terminal. An accepted request becomes a pickup and "
         "then a delivery, after which the partner confirms the receipt and the flow "
         "ends. Two guards protect the data: if the best-before time passes while "
         "the request is still accepted, the request moves to expired and the food is "
         "logged as waste; and the listing can always be withdrawn, returning the "
         "request to pending for the next batch.")
    figure_fit(doc, DIAG / "state-machine.png", max_w=CONTENT_W, max_h=4.3,
               cap="Figure 6.3  State machine diagram of the DonationRequest life "
                   "cycle")


# ==========================================================================
# chapter 7
# ==========================================================================
def ch7(doc):
    h_chapter(doc, 7, "Architectural Modelling")

    h1(doc, "7.1  Package Diagram")
    body(doc,
         "The package diagram groups the classes of the system into logical "
         "subsystems and shows the dependencies between them. FoodLoop has a root "
         "package containing three client-side packages and two server-side "
         "packages. The dependency arrows all point downwards, which means no lower "
         "layer knows about a higher one.")
    figure_fit(doc, DIAG / "package.png", max_w=CONTENT_W, max_h=6.4,
               cap="Figure 7.1  Package diagram of the FoodLoop logical structure")
    table_caption(doc, "Table 7.1  Packages and their responsibilities")
    table(doc, ["Package", "Contents", "Depends on"],
          [
              ["presentation", "All screens, modals, forms and toasts", "client"],
              ["client", "ApiClient, SessionStore, PollScheduler",
               "backend «invokes»"],
              ["service", "authService, surplusService, logisticsService, "
                          "wasteService, impactService", "backend, persistence"],
              ["backend (express)", "HTTP routes, JWT middleware, ImageResolver, "
                                    "domain services, seed jobs, config loader",
               "persistence «maps»"],
              ["persistence (mongoose)", "Nine models, repositories, seed data, "
                                         "connection and retry", "—"],
          ],
          widths=[1.4, 3.55, 1.55], size=9.5, keep_together=True)

    h1(doc, "7.2  Component Diagram")
    body(doc,
         "The component diagram replaces the logical packages with the deployable "
         "artefacts of the implementation. On the client, index.html and styles.css "
         "provide presentation, app.js acts as the controller and config.js supplies "
         "the API base URL. On the server, Express routes are grouped into "
         "controllers that delegate to domain services, and the Mongoose models and "
         "repositories form the only path to the database.")
    figure_fit(doc, DIAG / "component.png", max_w=CONTENT_W, max_h=6.4,
               cap="Figure 7.2  Component diagram of the FoodLoop runtime components")
    body(doc,
         "Figure 7.3 shows the client half of this diagram in use. The Add food "
         "listing modal is a presentation component driven by app.js, which collects "
         "the four fields and posts them to the surplus controller. It is also the "
         "clearest illustration of why FR-07 works: the modal promises the provider "
         "that a photograph is attached automatically, and the ImageResolver "
         "component on the server is what makes that promise true.")
    figure_fit(doc, SHOTS / "10-add-listing.png", max_w=CONTENT_W, max_h=4.2,
               cap="Figure 7.3  Add food listing modal — the presentation component "
                   "that collects the data for UC-02")

    h1(doc, "7.3  Deployment Diagram")
    body(doc,
         "The deployment diagram shows the physical runtime. A single Node.js "
         "process serves both the static page and the REST API on port 5000, so the "
         "browser talks to one origin and no CORS configuration is needed. The "
         "process connects to MongoDB over the local mongod service or a MongoDB "
         "Atlas cluster, and it calls TheMealDB over HTTPS to resolve food "
         "photographs.")
    body(doc,
         "Configuration is supplied through environment variables — PORT, "
         "MONGODB_URI and JWT_SECRET — which is what allows the same build to run "
         "on a laptop and on a hosted Node environment described by render.yaml. One "
         "constraint is worth recording: GitHub Pages can only serve the static "
         "page, so the deployed site needs a separately hosted HTTPS backend and "
         "window.FOODLOOP_API in config.js must point at it.")
    figure_fit(doc, DIAG / "deployment.png", max_w=CONTENT_W, max_h=6.0,
               cap="Figure 7.4  Deployment diagram of the FoodLoop runtime topology")
    table_caption(doc, "Table 7.2  REST endpoints exposed by the server")
    table(doc, ["Method", "Endpoint", "Purpose"],
          [
              ["POST", "/api/signup", "Register an admin or NGO account"],
              ["POST", "/api/signin", "Authenticate and receive a JWT"],
              ["GET", "/api/verify", "Validate a token and return the safe user"],
              ["GET", "/api/bootstrap", "Return every collection in one call"],
              ["GET", "/api/health", "Liveness probe that never touches the database"],
              ["POST", "/api/listings", "Publish surplus food"],
              ["POST", "/api/requests", "Raise a donation request"],
              ["PATCH", "/api/requests/:id", "Accept or decline a request"],
              ["POST", "/api/waste", "Record a waste entry"],
              ["POST", "/api/pickups", "Schedule a pickup"],
              ["POST", "/api/partners", "Add a community partner"],
          ],
          widths=[0.7, 2.1, 3.7], size=9.5)


# ==========================================================================
# chapter 8
# ==========================================================================
def ch8(doc):
    h_chapter(doc, 8, "Database Design")

    h1(doc, "8.1  Mapping Class Diagram to Relational Database")
    body(doc,
         "The class model is mapped onto a relational schema in the standard way. "
         "Each class becomes a table, each attribute becomes a column, and each "
         "association becomes either a foreign key or a junction table. Multiplicity "
         "decides which: a one-to-many association is mapped as a foreign key on the "
         "many side, while a many-to-many association needs a junction table.")
    body(doc,
         "Table 8.2 records the resulting constraints. Restaurant and FoodItem are merged "
         "into listings because in this domain a listing belongs to exactly one "
         "provider and the provider identity is already held in users. NGO becomes "
         "partners, extended with type, service area and capacity. Donation splits "
         "into requests, which holds the decision and the partner, and ngoRequests, "
         "which preserves the original item name so the audit trail survives a "
         "rename. AiRecommendation, Notification and ImpactMetric are stored as "
         "activity and metrics rather than as separate tables, because they are "
         "derived values that never need to be queried independently.")
    figure_fit(doc, DIAG / "relational-schema.png", max_w=CONTENT_W, max_h=6.2,
               cap="Figure 8.1  Relational schema mapped from the design class "
                   "diagram")

    h1(doc, "8.2  Database Tables")
    body(doc,
         "The implementation uses MongoDB, so each table below is a collection of "
         "documents and each column is a field. The database name is foodloop and it "
         "is reached at mongodb://127.0.0.1:27017 locally, or through MONGODB_URI "
         "when deployed.")
    table_caption(doc, "Table 8.1  Database tables (MongoDB collections)")
    table(doc, ["Table", "Purpose", "Key fields"],
          [
              ["users", "Accounts of food providers and community partners.",
               "name, email (unique), password (hashed), role, createdAt"],
              ["listings", "Surplus food published by a provider.",
               "name, detail, quantity, expiry, image, status, requests, createdAt"],
              ["requests", "Donation requests and the provider's decision.",
               "name, item, time, status, createdAt"],
              ["ngoRequests", "Audit trail of what each partner originally asked "
                              "for.", "foodName, ngoName, createdAt"],
              ["pickups", "Scheduled and completed collections.",
               "day, time, item, partner"],
              ["partners", "Directory of NGOs, kitchens, shelters and food banks.",
               "initials, name, detail, color, status"],
              ["waste", "Food that could not be rescued, with the reason why.",
               "date, category, quantity, reason, loggedBy, createdAt"],
              ["activity", "Append-only event feed behind notifications.",
               "icon, iconClass, title, description, time, createdAt"],
              ["metrics", "Single dashboard document holding the impact counters.",
               "key, foodDiverted, mealsShared, pendingPickups, activePartners"],
          ],
          widths=[1.1, 2.6, 2.8], size=9, keep_together=True)

    h1(doc, "8.3  Primary Keys and Foreign Keys")
    table_caption(doc, "Table 8.2  Primary keys, foreign keys and constraints")
    table(doc, ["Table", "Primary key", "Foreign keys", "Constraints"],
          [
              ["users", "_id (ObjectId)", "—",
               "email is unique; role ∈ {admin, ngo}; name, email, password, role "
               "are required"],
              ["listings", "_id (ObjectId)", "user_id → users (logical)",
               "name is required; status defaults to Available; image defaults to "
               "empty"],
              ["requests", "_id (ObjectId)", "ngo_id → users.user_id",
               "name and item are required; status ∈ {pending, accepted, declined}, "
               "default pending"],
              ["ngoRequests", "_id (ObjectId)", "ngo_name → users.name (logical)",
               "createdAt is stamped on insert"],
              ["pickups", "_id (ObjectId)", "partner → partners.name (logical)",
               "item is required; day defaults to Today"],
              ["partners", "_id (ObjectId)", "—",
               "name is required; status defaults to Connected"],
              ["waste", "_id (ObjectId)", "logged_by → users.name (logical)",
               "category, quantity and reason are required"],
              ["activity", "_id (ObjectId)", "—", "Append-only; createdAt is "
                                                  "stamped on insert"],
              ["metrics", "_id (ObjectId)", "—", "key is unique and is used to "
                                                  "find the dashboard document"],
          ],
          widths=[1.0, 1.15, 1.55, 2.8], size=9, keep_together=True)
    note(doc,
         "In MongoDB the only enforced relationship is the explicit reference stored "
         "in a document; the remaining links are logical and are maintained by the "
         "application. That is an intentional trade-off for a document store: it "
         "keeps writes cheap and the schema flexible, at the cost of referential "
         "integrity that a relational engine would give for free.")

    h1(doc, "8.4  CRUD Matrix")
    body(doc,
         "The CRUD matrix records, for every table, whether the system creates, "
         "reads, updates or deletes its rows. It is the quickest way to check that "
         "no table has been left without a lifecycle. Most collections are "
         "append-only by design: a donation request is never deleted, because its "
         "history is the evidence that the food was saved.")
    table_caption(doc, "Table 8.3  CRUD matrix")
    table(doc, ["Table", "Create", "Read", "Update", "Delete", "Notes"],
          [
              ["users", "POST /api/signup", "POST /api/signin, GET /api/verify",
               "—", "—", "Accounts are never modified after registration"],
              ["listings", "POST /api/listings", "GET /api/bootstrap",
               "Status change to Reserved on acceptance", "—", "Append-only history"],
              ["requests", "POST /api/requests", "GET /api/bootstrap",
               "PATCH /api/requests/:id", "—", "Only the status field is updated"],
              ["ngoRequests", "POST /api/requests", "GET /api/bootstrap", "—", "—",
               "Immutable audit record"],
              ["pickups", "POST /api/pickups", "GET /api/bootstrap",
               "Move to Completed on delivery", "—", "Append-only history"],
              ["partners", "POST /api/partners", "GET /api/bootstrap", "—", "—",
               "Append-only directory"],
              ["waste", "POST /api/waste", "GET /api/bootstrap", "—", "—",
               "Append-only log"],
              ["activity", "Created internally by every other route",
               "GET /api/bootstrap", "—", "—", "System-written only"],
              ["metrics", "Seeded once", "GET /api/bootstrap",
               "Recomputed on delivery", "—", "One document per key"],
          ],
          widths=[0.95, 1.32, 1.36, 1.32, 0.64, 1.28], size=8.5, keep_together=True)


# ==========================================================================
# chapter 9
# ==========================================================================
def ch9(doc):
    h_chapter(doc, 9, "Tools and Technologies Used")

    h1(doc, "9.1  Overview of Tools and Technologies")
    body(doc,
         "The project deliberately uses a small, well-understood stack. Every "
         "choice below was made because it keeps the delivery simple enough to "
         "finish and document, and because each tool is widely available so that "
         "the work can be reproduced.")
    table_caption(doc, "Table 9.1  Tools and technologies used")
    table(doc, ["Layer", "Technology", "Version", "Why it was chosen"],
          [
              ["Frontend", "HTML5", "—",
               "Semantic structure for the auth screen and the nine workspace views"],
              ["Frontend", "CSS3", "—",
               "Grid and flexbox layout, custom properties for the theme, and a "
               "responsive breakpoint at 900 px"],
              ["Frontend", "JavaScript (ES2020)", "—",
               "No build step: the browser runs app.js directly, which keeps the "
               "prototype easy to deploy and to read"],
              ["Frontend", "Google Fonts — DM Sans, Manrope", "—",
               "Consistent typography without shipping font binaries"],
              ["Backend", "Node.js", "≥ 18",
               "One language on both sides of the wire, and native fetch"],
              ["Backend", "Express", "4.18",
               "Minimal routing and middleware for the fifteen REST endpoints"],
              ["Backend", "Mongoose ODM", "7.6",
               "Schema validation and typed models over MongoDB"],
              ["Database", "MongoDB", "local or Atlas",
               "Document model matches the listings and requests; free tier is "
               "sufficient for the prototype"],
              ["Security", "bcryptjs", "2.4", "Password hashing at cost 10"],
              ["Security", "jsonwebtoken", "9.0", "Stateless authentication tokens"],
              ["External service", "TheMealDB", "free API",
               "Supplies a real photograph for each named dish or ingredient"],
              ["Deployment", "GitHub Pages", "—", "Publishes the static page"],
              ["Deployment", "Render blueprint", "render.yaml",
               "Runs the same Node process for the API and the page on one origin"],
              ["UML modelling", "diagrams.net (draw.io)", "—",
               "Draws the use case, class, object, activity and sequence diagrams"],
              ["Additional UML", "Matplotlib", "3.11",
               "Scripted generation of the design class, communication, state "
               "machine, package, component, deployment and schema diagrams"],
              ["Document automation", "Python + python-docx", "3.13 / 1.2",
               "Generates this report from the university template so that the "
               "structure and page numbering stay consistent"],
              ["Screenshots", "Chrome headless via CDP", "—",
               "Captures the running application without installing a test runner"],
          ],
          widths=[0.95, 1.6, 0.85, 3.4], size=8.5)
    figure_fit(doc, SHOTS / "09-reports.png", max_w=CONTENT_W, max_h=4.1,
               cap="Figure 9.3  Impact reports view — UC-12 Generate Reports, "
                   "rendered from the metrics and waste collections")
    figure_fit(doc, SHOTS / "13-notifications.png", max_w=CONTENT_W, max_h=4.1,
               cap="Figure 9.2  Notifications panel — UC-13 Receive Notifications, "
                   "fed by the activity collection")

    h1(doc, "9.2  UML Modelling Tool")
    body(doc,
         "The UML diagrams were produced with diagrams.net, an open-source "
         "graphical modelling tool that runs in the browser and needs no "
         "installation. It was chosen because the team already used it for "
         "modelling work, because it supports every UML 2.x diagram type required "
         "by this report, and because its files are plain XML that can be kept in "
         "version control alongside the source code.")

    h1(doc, "9.3  Introduction to the Tool")
    body(doc,
         "diagrams.net — originally released as draw.io — is a web-based "
         "visual editor for user-interface mock-ups and UML diagrams. It runs "
         "entirely in the browser: diagrams are held in an in-memory model and "
         "saved either to the clipboard as XML or to a file on disk, so no server, "
         "account or internet connection is required once the page has loaded. It "
         "supports shape libraries for UML, including the actor, use case, class, "
         "object, package, component and node shapes used throughout this report, "
         "and it can export to PNG for inclusion in documentation.")
    body(doc,
         "For this project the tool was used for the six hand-drawn diagrams — the "
         "use case, class, object, activity, high-level sequence and detailed "
         "sequence diagrams. The remaining seven were generated from scripts with "
         "Matplotlib so that they stay consistent with one another and can be "
         "regenerated after a change, which matters because seven separate diagrams "
         "drawn by hand drift apart very quickly.")

    h1(doc, "9.4  Features and Capabilities")
    table_caption(doc, "Table 9.2  Features of the UML modelling tool used")
    table(doc, ["Feature", "How it was used in this project"],
          [
              ["Complete UML 2.x shape library",
               "Actor, use case, class, object, package, component, note and node "
               "shapes for Figures 3.1 to 3.3 and 7.1 to 7.3"],
              ["Relationship types",
               "Association, dependency, realisation and generalisation arrows for "
               "the class and component models"],
              ["Stereotype labels",
               "«include», «extend», «interface», «system», «database» and "
               "«external» qualifiers"],
              ["Multiplicity and role editing",
               "The 1 : 0..* and 0..* : 1 labels on the class diagram"],
              ["Grid and alignment guides",
               "Consistent spacing across the use case and sequence diagrams"],
              ["Layers and groups",
               "The four architecture bands in the design class diagram"],
              ["Free-form text and notes",
               "Explanatory notes attached to the state machine and package diagrams"],
              ["SVG and PNG export",
               "PNG export of every diagram for inclusion in this report"],
              ["Offline operation",
               "Diagrams could be edited without an internet connection, which "
               "suited the laboratory sessions"],
              ["XML source format",
               "Diagrams could be version-controlled and reviewed like code"],
          ],
          widths=[1.85, 4.65], size=9.5, keep_together=True)
    figure_fit(doc, SHOTS / "12-search.png", max_w=CONTENT_W, max_h=4.1,
               cap="Figure 9.1  Global search command palette — FR-19, implemented as "
                   "a presentation component driven by app.js")
    figure_fit(doc, SHOTS / "14-about.png", max_w=CONTENT_W, max_h=4.1,
               cap="Figure 9.5  The About FoodLoop view, which embeds this project's "
                   "own documentation and UML diagrams")
    figure_fit(doc, SHOTS / "15-settings.png", max_w=CONTENT_W, max_h=4.1,
               cap="Figure 9.6  Settings view showing the account, the API and "
                   "database connection, and notification preferences")
    figure_fit(doc, SHOTS / "11-help.png", max_w=CONTENT_W, max_h=4.1,
               cap="Figure 9.4  Help centre modal — the in-application guidance "
                   "component")
    figure_fit(doc, SHOTS / "17-mobile-overview.png", max_w=2.5, max_h=4.6,
               cap="Figure 9.7  Responsive layout at 430 px, satisfying NFR-08")


# ==========================================================================
# chapter 10
# ==========================================================================
def ch10(doc):
    h_chapter(doc, 10, "Conclusion and Future Scope")

    h1(doc, "10.1  Conclusion")
    body(doc,
         "FoodLoop was built to answer a simple question: why is edible food thrown "
         "away when somebody nearby would like it? The answer the project gives is "
         "a single shared record. A provider publishes what it has; every partner "
         "sees the same list with photographs, quantities and best-before times; a "
         "partner claims what it can collect; the provider accepts or declines; the "
         "pickup is scheduled and the delivery is recorded; and the kilogram that "
         "was saved appears on the dashboard.")
    body(doc,
         "The Object-Oriented Analysis and Design process produced the models that "
         "made this buildable rather than improvised. Sixteen functional and twelve "
         "non-functional requirements were traced to fourteen use cases and a "
         "fourteen-event table; the use case model fixed the vocabulary; the domain "
         "and design class diagrams fixed the structure and the persistence; the "
         "sequence, communication and state machine diagrams fixed the behaviour, "
         "including the two failure paths that are easy to forget; and the package, "
         "component and deployment diagrams fixed the architecture and the runtime "
         "topology. Chapter 8 then mapped that structure onto nine collections with "
         "an explicit CRUD matrix, so every class in the model has a storage home and "
         "every stored document has a class that justifies it.")
    body(doc,
         "The delivered prototype runs on Node.js, Express and MongoDB, protects "
         "accounts with bcrypt and JWT, keeps every view synchronised with a "
         "fifteen-second poll, and works from a phone in a food bank as well as from "
         "a desktop in a hotel office. Its value is not the sophistication of any "
         "single part but the fact that all of them agree with one another: the "
         "diagrams in this report describe the system that was built, and the "
         "screenshots in it were captured from that running system.")

    h1(doc, "10.2  Limitations")
    body(doc,
         "The following limitations are known and were accepted deliberately at this "
         "stage of the project.")
    bullets(doc, [
        "Notifications and dashboard freshness depend on fifteen-second polling "
        "rather than server push, so a partner may see a change up to fifteen "
        "seconds late.",
        "Food photographs are fetched from TheMealDB, so a dish the service does not "
        "know falls back to an ingredient image and then to an emoji glyph.",
        "The AiRecommendation module is specified and stubbed but not trained; the "
        "demand prediction in Figures 4.3 and 6.1 is a design commitment rather than "
        "a working model.",
        "Pickups are recorded but not tracked in transit: there is no live location, "
        "no driver application and no proof of delivery.",
        "Impact figures are aggregated counters maintained by the application rather "
        "than computed from the donation history, so they do not yet reconcile "
        "automatically with the waste log.",
        "Only two roles exist. Delivery partners, food banks as a distinct role, and "
        "regulators are all outside the current scope.",
        "Authentication covers sign-up and sign-in; there is no password reset, no "
        "e-mail verification and no multi-factor authentication.",
        "Search filters the four main collections client-side, which is adequate for "
        "a few hundred records but would need server-side indexing at scale.",
    ])

    h1(doc, "10.3  Future Enhancements")
    body(doc,
         "The following enhancements are planned, in the order in which they would "
         "deliver the most value.")
    table_caption(doc, "Table 10.1  Planned enhancements")
    table(doc, ["#", "Enhancement", "Addresses"],
          [
              ["1", "Server-sent events or WebSockets to replace polling, so a "
                    "partner sees a new listing the moment it is published.",
               "Limitation 1"],
              ["2", "A trained demand-prediction model using the waste and listing "
                    "history, exposed through the existing AiRecommender class.",
               "Limitation 3"],
              ["3", "A delivery-partner role with a driver view, live status "
                    "transitions and a digital receipt with photograph proof.",
               "Limitation 4, role scope"],
              ["4", "Impact figures recomputed from the donation and waste history "
                    "so the dashboard always reconciles with the logs.", "Limitation 5"],
              ["5", "Geolocation and distance matching so a partner is shown the food "
                    "closest to it first, and a collection radius per partner.",
               "FR-09"],
              ["6", "Expiry alerts to providers and NGOs as a listing approaches its "
                    "best-before time, with automatic re-listing after collection.",
               "UC-06, UC-07"],
              ["7", "A restaurant admin view for multi-branch providers, with "
                    "per-kitchen waste comparison.", "Scope"],
              ["8", "Password reset, e-mail verification and optional "
                    "multi-factor authentication.", "Limitation 7"],
              ["9", "Server-side search with indexes, plus filters on date range and "
                    "waste reason.", "Limitation 8"],
              ["10", "Monthly impact reports in PDF with charts, shareable with "
                     "partners and municipal bodies.", "UC-12"],
          ],
          widths=[0.4, 4.2, 1.9], size=9.5, keep_together=True)
    body(doc,
         "Beyond these, the natural next step is to open the platform to partner "
         "organisations as tenants, so that each NGO manages only its own requests "
         "and capacity, and to publish the waste analytics as an anonymised "
         "dataset that a city can use to target interventions. The models in this "
         "report were built to allow both: the interfaces already isolate "
         "persistence and authentication, so adding tenancy is a change to two "
         "packages rather than to the system.")


# The lists of figures and tables are built from CAPTIONS once the chapters
# have been written, so their numbering always matches the document.

OUTLINE = [
    {"num": 1, "title": "Introduction", "render": ch1, "sections": [
        {"num": "1.1", "title": "Introduction to the Project"},
        {"num": "1.2", "title": "Project Modules"},
        {"num": "1.3", "title": "Problem Statement"},
        {"num": "1.4", "title": "Objectives of the Project"},
        {"num": "1.5", "title": "Scope of the Project"},
    ]},
    {"num": 2, "title": "Requirement Analysis", "render": ch2, "sections": [
        {"num": "2.1", "title": "Functional Requirements"},
        {"num": "2.2", "title": "Non-Functional Requirements"},
        {"num": "2.3", "title": "Actors and Their Roles"},
        {"num": "2.4", "title": "Use Case Identification"},
        {"num": "2.5", "title": "Use Case Descriptions"},
        {"num": "2.6", "title": "Event List"},
        {"num": "2.7", "title": "Event Table"},
    ]},
    {"num": 3, "title": "Use Case and Domain Modelling", "render": ch3, "sections": [
        {"num": "3.1", "title": "Use Case Modelling", "subs": [
            {"num": "3.1.1", "title": "Use Case Diagram"},
            {"num": "3.1.2", "title": "Description and Terminology"},
            {"num": "3.1.3", "title": "Project-Specific Explanation"},
        ]},
        {"num": "3.2", "title": "Domain Modelling", "subs": [
            {"num": "3.2.1", "title": "Domain Class Diagram"},
            {"num": "3.2.2", "title": "Description and Terminology"},
            {"num": "3.2.3", "title": "Project-Specific Explanation"},
        ]},
    ]},
    {"num": 4, "title": "Interaction Modelling", "render": ch4, "sections": [
        {"num": "4.1", "title": "System Sequence Diagram"},
        {"num": "4.2", "title": "High-Level Sequence Diagram"},
        {"num": "4.3", "title": "Detailed Sequence Diagram"},
        {"num": "4.4", "title": "Communication Diagram"},
    ]},
    {"num": 5, "title": "Design Class Modelling", "render": ch5, "sections": [
        {"num": "5.1", "title": "Design Class Diagram"},
        {"num": "5.2", "title": "Classes, Attributes and Operations"},
        {"num": "5.3", "title": "Relationships and Multiplicity"},
        {"num": "5.4", "title": "Interfaces, Dependencies and Generalization"},
    ]},
    {"num": 6, "title": "Behavioural Modelling", "render": ch6, "sections": [
        {"num": "6.1", "title": "Activity Diagram"},
        {"num": "6.2", "title": "State Machine Diagram"},
    ]},
    {"num": 7, "title": "Architectural Modelling", "render": ch7, "sections": [
        {"num": "7.1", "title": "Package Diagram"},
        {"num": "7.2", "title": "Component Diagram"},
        {"num": "7.3", "title": "Deployment Diagram"},
    ]},
    {"num": 8, "title": "Database Design", "render": ch8, "sections": [
        {"num": "8.1", "title": "Mapping Class Diagram to Relational Database"},
        {"num": "8.2", "title": "Database Tables"},
        {"num": "8.3", "title": "Primary Keys and Foreign Keys"},
        {"num": "8.4", "title": "CRUD Matrix"},
    ]},
    {"num": 9, "title": "Tools and Technologies Used", "render": ch9, "sections": [
        {"num": "9.1", "title": "Overview of Tools and Technologies"},
        {"num": "9.2", "title": "UML Modelling Tool"},
        {"num": "9.3", "title": "Introduction to the Tool"},
        {"num": "9.4", "title": "Features and Capabilities"},
    ]},
    {"num": 10, "title": "Conclusion and Future Scope", "render": ch10, "sections": [
        {"num": "10.1", "title": "Conclusion"},
        {"num": "10.2", "title": "Limitations"},
        {"num": "10.3", "title": "Future Enhancements"},
    ]},
]


# ==========================================================================
# assembly
# ==========================================================================
def tag_headings(doc):
    """Attach a bookmark to every chapter and section heading, in order."""
    wanted = {}
    for ch in OUTLINE:
        wanted[f"FL_CH{ch['num']}"] = None
        for sec in ch["sections"]:
            wanted[f"FL_{sec['num'].replace('.', '_')}"] = None
            for sub in sec.get("subs", []):
                wanted[f"FL_{sub['num'].replace('.', '_')}"] = None

    for par in doc.paragraphs:
        txt = par.text.strip()
        for bm in list(wanted):
            if wanted[bm] is not None:
                continue
            if bm.startswith("FL_CH"):
                if txt.startswith("Chapter ") and txt.split()[1] == bm[5:]:
                    wanted[bm] = True
                    bookmark(par, bm)
                    break
            else:
                num = bm[3:].replace("_", ".")
                if txt.startswith(num + "  ") or txt.startswith(num + " "):
                    wanted[bm] = True
                    bookmark(par, bm)
                    break

    missing = [k for k, v in wanted.items() if v is None]
    if missing:
        raise RuntimeError(f"headings not found for bookmarks: {missing}")


def main():
    if not TEMPLATE.exists():
        raise SystemExit(f"template not found: {TEMPLATE}")

    # Start from the university template and keep its front matter, so the
    # certificate, declaration and acknowledgement pages are the template's own
    # paragraphs rather than a re-typed approximation of them.
    #
    # OneDrive keeps a handle on a file that Word has open, so the copy is
    # retried for a while before giving up.
    for attempt in range(10):
        try:
            shutil.copyfile(TEMPLATE, OUTPUT)
            break
        except OSError as exc:
            if attempt == 9:
                raise
            time.sleep(2)
    doc = Document(str(OUTPUT))

    toc_index, toc_rows = front_matter.adopt(
        doc, PROJECT, ABSTRACT, KEYWORDS)
    TOC_MAP["toc_table"] = toc_index
    TOC_MAP["rows"] = toc_rows

    # ---- body (arabic page numbers restarting at 1)
    body_section = doc.add_section()
    set_page_numbering(doc.sections[0], "lowerRoman", start=1)
    set_page_numbering(body_section, "decimal", start=1)
    add_footer(doc.sections[0])
    add_footer(body_section)

    for ch in OUTLINE:
        ch["render"](doc)

    tag_headings(doc)

    # ---- the two list pages the template does not provide.  They are written
    # after the chapters so the figure and table numbers are already known, then
    # moved back in front of the section break that starts the body.
    # w:sectPr sits inside w:pPr, so the paragraph that carries the break is
    # its grandparent
    section_break = doc.sections[0]._sectPr.getparent().getparent()
    body_el = doc.element.body
    # python-docx appends new content *before* the trailing sectPr
    existing = list(body_el)
    figures_heading = list_of_figures(doc)
    tables_heading = list_of_tables(doc)
    added = [e for e in body_el if not any(e is x for x in existing)
             and e.tag != qn("w:sectPr")]
    for el in added:
        section_break.addprevious(el)

    front_matter.bookmark_paragraph(figures_heading, "FL_FM_LOF", 2010)
    front_matter.bookmark_paragraph(tables_heading, "FL_FM_LOT", 2011)

    # find the list tables by walking from each heading to the next sibling table
    def table_after(par):
        node = par._p.getnext()
        while node is not None and node.tag != qn("w:tbl"):
            node = node.getnext()
        return node

    lot_node = table_after(tables_heading)
    lof_node = table_after(figures_heading)

    # map node identity to the index in doc.tables
    tbl_map = {t._tbl: i for i, t in enumerate(doc.tables)}
    lof_index = tbl_map.get(lof_node)
    lot_index = tbl_map.get(lot_node)

    doc.save(str(OUTPUT))
    MAPFILE.write_text(json.dumps(
        dict(TOC_MAP, lof_table=lof_index, lot_table=lot_index), indent=2),
        encoding="utf-8")
    print(f"wrote {OUTPUT.name}")
    print(f"wrote {MAPFILE.name}  ({len(TOC_MAP['rows'])} bookmarked rows)")
    print(f"{len(CAPTIONS['Figure'])} figures, {len(CAPTIONS['Table'])} tables")


if __name__ == "__main__":
    main()