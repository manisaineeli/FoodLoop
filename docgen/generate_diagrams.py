"""
Generate the FoodLoop UML diagrams that are not already present in ./diagrams.

Existing PNGs (use-case, class, object, activity, sequence, high-level-sequence)
stay untouched. This script produces the remaining figures required by the
OOAD report template, using the same dark-green palette sampled from
diagrams/class.png so the whole figure set looks like one set.

    green  #2C5F2D   header fill / strokes
    dark   #1B3F1C   header text
    light  #F4F8F4   alternate body fill
    grey   #737373   annotations

Usage:  python docgen/generate_diagrams.py
Output: diagrams/*.png
"""

import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import (Circle, Ellipse, FancyArrowPatch,
                                FancyBboxPatch, Rectangle)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "diagrams"

GREEN = "#2C5F2D"
DARK = "#1B3F1C"
LIGHT = "#F4F8F4"
GREY = "#737373"
LINEW = 1.15
DPI = 150

DASH = {"solid": "-", "dashed": "--", "dotted": ":",
        "dep": (0, (5, 2)), "impl": (0, (7, 2, 1, 2))}


# --------------------------------------------------------------------------
# primitives
# --------------------------------------------------------------------------
def canvas(w, h):
    fig, ax = plt.subplots(figsize=(w, h), dpi=DPI)
    ax.set_xlim(0, w)
    ax.set_ylim(0, h)
    ax.axis("off")
    fig.subplots_adjust(left=0, right=1, top=1, bottom=0)
    return fig, ax


def heading(ax, cx, cy, text, fs=11.5):
    ax.text(cx, cy, text, ha="center", va="center", fontsize=fs,
            fontweight="bold", color=DARK)


def node(ax, x, y, w, h, title, items=(), icon=None, th=None,
         fs=10.5, ifs=8.2, fill="white", radius=0.09):
    """UML box with a green title bar and stacked body lines."""
    box = FancyBboxPatch(
        (x, y), w, h,
        boxstyle=f"round,pad=0,rounding_size={radius}",
        linewidth=LINEW, edgecolor=GREEN, facecolor=fill, zorder=3)
    ax.add_patch(box)

    if title is None:
        return

    if th is None:
        th = 0.44 if items else h

    # rounded header, then square off its lower half
    ax.add_patch(FancyBboxPatch(
        (x, y + h - th), w, th,
        boxstyle=f"round,pad=0,rounding_size={radius}",
        linewidth=0, facecolor=GREEN, zorder=4))
    ax.add_patch(Rectangle((x, y + h - th), w, th / 2, linewidth=0,
                           facecolor=GREEN, zorder=4))

    tx = x + 0.1
    if icon:
        ax.add_patch(Circle((x + 0.21, y + h - th / 2), 0.13,
                            facecolor="white", edgecolor="none", zorder=6))
        ax.text(x + 0.21, y + h - th / 2 - 0.005, icon, ha="center",
                va="center", fontsize=8.5, fontweight="bold",
                color=GREEN, zorder=7)
        tx = x + 0.40
    ax.text(tx, y + h - th / 2 - 0.02, title, ha="left", va="center",
            fontsize=fs, fontweight="bold", color="white", zorder=7)

    if items:
        top = y + h - th - 0.06
        span = (top - y) / len(items)
        for i, line in enumerate(items):
            colour, weight = GREEN, "normal"
            if line.startswith("##"):
                colour, weight, line = DARK, "bold", line[2:]
            elif line.startswith("#"):
                colour, line = GREY, line[1:]
            ax.text(x + 0.11, top - span * (i + 0.60), line, ha="left",
                    va="center", fontsize=ifs, color=colour,
                    fontweight=weight, zorder=7)


def frame(ax, x, y, w, h, label, fill=LIGHT, fs=10.5, tab=0.44):
    """Outer frame with a stereotype tab, e.g. «package» / «boundary»."""
    ax.add_patch(FancyBboxPatch(
        (x, y), w, h,
        boxstyle="round,pad=0,rounding_size=0.1",
        linewidth=1.7, edgecolor=GREEN, facecolor=fill, zorder=2))
    ax.add_patch(FancyBboxPatch(
        (x, y + h - tab), w * 0.40, tab,
        boxstyle="round,pad=0,rounding_size=0.09",
        linewidth=0, facecolor=GREEN, zorder=3))
    ax.text(x + 0.12, y + h - tab / 2 - 0.01, label, ha="left", va="center",
            fontsize=fs, fontweight="bold", color="white", zorder=5)


def actor(ax, x, y, label, h=1.15, fs=9.5, lines=None):
    """Stick-figure actor whose feet rest on baseline y."""
    top = y + h
    ax.add_patch(Circle((x, top - 0.14), 0.13, facecolor=GREEN,
                        edgecolor="none", zorder=4))
    ax.plot([x, x], [top - 0.27, y + 0.36], color=GREEN, lw=2.0, zorder=4)
    ax.plot([x - 0.32, x + 0.32], [top - 0.27, top - 0.27], color=GREEN,
            lw=2.0, zorder=4)
    ax.plot([x - 0.28, x, x + 0.28], [y, y + 0.36, y], color=GREEN,
            lw=2.0, zorder=4)
    if lines:
        ax.text(x, y - 0.16, label, ha="center", va="top", fontsize=fs,
                fontweight="bold", color=DARK, zorder=4)
        ax.text(x, y - 0.16 - 0.22 * len(lines), "\n".join(lines),
                ha="center", va="top", fontsize=fs - 1.5, color=GREEN, zorder=4)
    else:
        ax.text(x, y - 0.16, label, ha="center", va="top", fontsize=fs,
                fontweight="bold", color=DARK, zorder=4)


def _seg(ax, p1, p2, style, color, head, rad=0.0):
    ax.add_patch(FancyArrowPatch(
        p1, p2,
        arrowstyle="-|>" if head else "-",
        mutation_scale=13, linewidth=LINEW, linestyle=DASH[style],
        color=color, zorder=5, shrinkA=0, shrinkB=0,
        connectionstyle=f"arc3,rad={rad}"))


def link(ax, p1, p2, style="solid", head=True, color=GREEN, rad=0.0):
    _seg(ax, p1, p2, style, color, head, rad)


def elbow(ax, pts, style="solid", head=True, color=GREEN):
    """Orthogonal polyline; the arrowhead sits on the final segment only."""
    for a, b in zip(pts, pts[1:]):
        _seg(ax, a, b, style, color, head and b is pts[-1])


def tag(ax, x, y, text, fs=7.4, colour=DARK, ha="center", va="center",
        box=True):
    kwargs = {}
    if box:
        kwargs["bbox"] = dict(boxstyle="round,pad=0.17", fc="white", ec="none")
    ax.text(x, y, text, ha=ha, va=va, fontsize=fs, color=colour, zorder=8, **kwargs)


def note(ax, x, ytop, text, w=4.5, fs=7.8):
    """Titled-ish explanatory box; the body text is wrapped to fit w."""
    import textwrap
    per_line = max(20, int(w * 9.2))
    body = "\n".join(textwrap.wrap(text, per_line))
    n = body.count("\n") + 1
    h = 0.19 * n + 0.22
    ax.add_patch(FancyBboxPatch(
        (x, ytop - h), w, h,
        boxstyle="round,pad=0,rounding_size=0.08",
        linewidth=1.0, edgecolor=GREY, facecolor="white", zorder=4))
    ax.plot([x + 0.02, x + 0.02, x + 0.22], [ytop - h, ytop, ytop],
            color=GREY, lw=1.0, zorder=5)
    ax.text(x + 0.14, ytop - 0.11, body, ha="left", va="top", fontsize=fs,
            color=DARK, zorder=6, linespacing=1.35)


def state(ax, x, y, w, h, label, fs=9.0, radius=0.20, fill="white"):
    ax.add_patch(FancyBboxPatch(
        (x, y), w, h,
        boxstyle=f"round,pad=0,rounding_size={radius}",
        linewidth=LINEW, edgecolor=GREEN, facecolor=fill, zorder=4))
    ax.text(x + w / 2, y + h / 2, label, ha="center", va="center",
            fontsize=fs, fontweight="bold", color=DARK, zorder=6)


def ell_pt(cx, cy, rx, ry, tx, ty):
    """Point where the ray from (cx,cy) towards (tx,ty) leaves the ellipse."""
    dx, dy = tx - cx, ty - cy
    n = math.hypot(dx / rx, dy / ry) or 1.0
    return (cx + dx / n, cy + dy / n)


def save(fig, name):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    fig.savefig(path, dpi=DPI, bbox_inches="tight", pad_inches=0.06,
                facecolor="white")
    plt.close(fig)
    print("wrote", path.relative_to(ROOT))


# --------------------------------------------------------------------------
# 1. Design class diagram — organised in design layers
# --------------------------------------------------------------------------
def design_class():
    W, H = 16.8, 12.9
    fig, ax = canvas(W, H)

    frame(ax, 0.30, 10.30, 16.20, 2.10, "«boundary»  presentation")
    frame(ax, 0.30, 7.60, 16.20, 2.25, "«service»  application services")
    frame(ax, 0.30, 2.60, 16.20, 4.55, "«entity»  domain model")
    frame(ax, 0.30, 0.30, 16.20, 1.85, "«persistence»  data access")

    # --- boundary
    for i, (t, sub) in enumerate([
            ("index.html", "auth screen · views · modals"),
            ("app.js", "render · event handlers · session"),
            ("styles.css", "layout · theme · responsive"),
            ("config.js", "window.FOODLOOP_API")]):
        node(ax, 0.70 + i * 4.05, 10.80, 3.55, 1.10, t,
             ["«presentation»", sub], fs=10.0, ifs=7.8)

    # --- application services
    for i, (t, sub) in enumerate([
            ("AuthService", "signUp · signIn · verifyToken"),
            ("SurplusService", "publishSurplus · acceptRequest"),
            ("LogisticsService", "schedulePickup · trackDelivery"),
            ("WasteService", "logWaste · analyseWaste"),
            ("ImpactService", "generateReport · aggregate")]):
        node(ax, 0.70 + i * 3.13, 8.10, 2.95, 1.25, t,
             ["«service»", sub], fs=9.5, ifs=7.6)

    # --- domain entities: row 1
    row1 = [("User", ["#-userId : String", "-email : String",
                      "-passwordHash : String",
                      "-role : [admin|ngo]",
                      "+login() : Session", "+logout() : void"]),
            ("FoodListing", ["#-listingId : String", "-name : String",
                             "-quantity : String", "-bestBefore : DateTime",
                             "-status : [Available|Reserved]",
                             "+publish(dto) : void",
                             "+reserve() : void"]),
            ("DonationRequest", ["#-requestId : String", "-ngoId : String",
                                 "-foodName : String",
                                 "-status : [pending|accepted|declined]",
                                 "+createDonation() : void",
                                 "+accept() : void", "+decline() : void"]),
            ("Pickup", ["#-pickupId : String", "-scheduledTime : DateTime",
                        "-status : [Assigned|Delivered]",
                        "+assignPartner() : void",
                        "+markDelivered() : void"])]
    for i, (t, items) in enumerate(row1):
        node(ax, 0.70 + i * 3.95, 5.55, 3.65, 1.15, t, items,
             icon="C", fs=10.0, ifs=7.4)

    # --- domain entities: row 2
    row2 = [("Notification", ["#-noteId : String", "-message : String",
                              "-isRead : Boolean", "+send() : void",
                              "+markRead() : void"]),
            ("WasteRecord", ["#-wasteId : String", "-category : String",
                             "-quantity : Float", "-reason : String",
                             "+logWaste() : void",
                             "+calculateWaste() : Float"]),
            ("Partner", ["#-partnerId : String", "-name : String",
                         "-type : [NGO|Kitchen|Shelter]",
                         "+register() : void",
                         "+confirmReceipt() : void"]),
            ("ImpactMetric", ["#-metricId : String", "-foodDivertedKg : Float",
                              "-mealsShared : Integer",
                              "-pendingPickups : Integer",
                              "+generateReport() : Report"])]
    for i, (t, items) in enumerate(row2):
        node(ax, 0.70 + i * 3.95, 3.75, 3.65, 1.15, t, items,
             icon="C", fs=10.0, ifs=7.4)

    # --- entity associations (adjacent boxes only, so nothing is crossed)
    ASSOC = 5.92          # y of the horizontal association line (row 1 bodies)
    a, b = 4.35, 4.65     # User | FoodListing
    link(ax, (a, ASSOC), (b, ASSOC))
    tag(ax, a - 0.20, ASSOC + 0.22, "1", fs=7.0)
    tag(ax, b + 0.20, ASSOC + 0.22, "0..*", fs=7.0)
    tag(ax, (a + b) / 2, ASSOC, "lists", fs=7.2)

    a, b = 8.30, 8.60
    link(ax, (a, ASSOC), (b, ASSOC))
    tag(ax, a - 0.20, ASSOC + 0.22, "1", fs=7.0)
    tag(ax, b + 0.22, ASSOC + 0.22, "0..*", fs=7.0)
    tag(ax, (a + b) / 2, ASSOC, "received by", fs=6.9)

    a, b = 12.25, 12.55
    link(ax, (a, ASSOC), (b, ASSOC))
    tag(ax, a - 0.20, ASSOC + 0.22, "1", fs=7.0)
    tag(ax, b + 0.20, ASSOC + 0.22, "0..1", fs=7.0)
    tag(ax, (a + b) / 2, ASSOC, "fulfilled by", fs=6.7)

    # FoodListing -> WasteRecord (vertical)
    link(ax, (6.47, 5.55), (6.47, 4.90))
    tag(ax, 6.47, 5.22, "0..*", fs=7.0)

    # WasteRecord -> Notification (horizontal, arrow points left)
    link(ax, (4.35, 4.32), (2.52, 4.32))
    tag(ax, 3.43, 4.32, "logs", fs=7.2)
    tag(ax, 4.52, 4.54, "1", fs=7.0)
    tag(ax, 2.30, 4.54, "0..1", fs=7.0)

    # DonationRequest -> Partner (vertical)
    link(ax, (10.42, 5.55), (10.42, 4.90))
    tag(ax, 10.42, 5.22, "1", fs=7.0)
    tag(ax, 10.68, 5.22, "0..*", fs=7.0)
    tag(ax, 9.50, 5.22, "requested by", fs=7.0)

    # Pickup -> ImpactMetric (vertical)
    link(ax, (14.37, 5.55), (14.37, 4.90))
    tag(ax, 14.37, 5.22, "1", fs=7.0)
    tag(ax, 14.63, 5.22, "0..*", fs=7.0)
    tag(ax, 13.50, 5.22, "aggregated into", fs=7.0)

    # --- layer dependencies
    for i in range(5):
        cx = 0.70 + i * 3.13 + 1.47
        link(ax, (cx, 7.60), (cx, 7.15), style="dashed")
        tag(ax, cx, 7.37, "«uses»", fs=6.4)
    for cx in [2.52, 6.47, 10.42, 14.37]:
        link(ax, (cx, 2.60), (cx, 2.15), style="dashed")
        tag(ax, cx, 2.37, "«persists»", fs=6.4)
    for i in range(4):
        cx = 0.70 + i * 4.05 + 1.77
        link(ax, (cx, 10.30), (cx, 9.85), style="dashed")
        tag(ax, cx, 10.07, "«drives»", fs=6.4)

    # --- persistence
    node(ax, 0.70, 0.50, 3.55, 1.25, "IRepository", [
        "«interface»", "+findAll() : List<T>", "+findById(id) : T",
        "+insert(doc) : T", "+update(id, doc) : T"],
        icon="I", fs=10.0, ifs=7.4, fill=LIGHT)
    node(ax, 4.75, 0.50, 3.55, 1.25, "MongoRepository", [
        "«service»", "implements IRepository", "+insert(doc) : T",
        "+find(query) : List<T>"], icon="C", fs=10.0, ifs=7.4)
    node(ax, 8.80, 0.50, 3.55, 1.25, "Mongoose models", [
        "«database»", "9 schemas", "user · listing · request · pickup",
        "partner · waste · activity · metric"], fs=10.0, ifs=7.4)
    node(ax, 12.85, 0.50, 3.55, 1.25, "TheMealDB API", [
        "«external»", "food photo lookup", "resolveFoodImage(name) : URL"],
        fs=10.0, ifs=7.4, fill=LIGHT)

    link(ax, (4.25, 1.12), (4.75, 1.12), style="impl")
    tag(ax, 4.50, 1.34, "«realise»", fs=6.0)
    link(ax, (8.30, 1.12), (8.80, 1.12), style="dep")
    tag(ax, 8.55, 1.34, "«maps»", fs=6.0)
    link(ax, (12.35, 1.12), (12.85, 1.12), style="dep")
    tag(ax, 12.60, 1.34, "«queries»", fs=6.0)

    save(fig, "design-class.png")


# --------------------------------------------------------------------------
# 2. Communication diagram
# --------------------------------------------------------------------------
def communication():
    W, H = 15.6, 9.4
    fig, ax = canvas(W, H)
    heading(ax, W / 2, 9.15,
            "Communication diagram — publishing surplus food and completing a donation")

    RX, RY = 0.95, 0.36
    O = {
        1: (1.50, 7.55, "1: RestaurantAdmin"),
        2: (5.40, 7.55, "2: ListingForm"),
        3: (9.30, 7.55, "3: SurplusController"),
        4: (9.30, 5.15, "4: SurplusService"),
        5: (13.20, 5.15, "5: AiRecommender"),
        6: (9.30, 3.00, "6: MongoRepository"),
        7: (5.40, 3.00, "7: NGO dashboard"),
        8: (13.20, 7.55, "8: NotificationService"),
    }
    SUB = {1: "actor", 2: "«view»", 3: "«boundary»", 4: "«service»",
           5: "«service»", 6: "«database»", 7: "«view»", 8: "«service»"}

    for n, (cx, cy, name) in O.items():
        ax.add_patch(Ellipse((cx, cy), RX * 2, RY * 2, facecolor="white",
                             edgecolor=GREEN, lw=1.6, zorder=5))
        ax.text(cx, cy, name, ha="center", va="center", fontsize=8.4,
                fontweight="bold", color=DARK, zorder=8)
        ax.plot([cx - 0.52, cx + 0.52], [cy - RY - 0.10] * 2, color=GREEN,
                lw=1.3, zorder=8)
        ax.text(cx, cy - RY - 0.17, SUB[n], ha="center", va="center",
                fontsize=6.8, color=GREY, zorder=8)

    def msg(a, b, text, y=None, x=None, label_xy=None, style="solid"):
        ax1, ay1, _ = O[a]
        ax2, ay2, _ = O[b]
        if y is not None:
            ty1, ty2 = y, y
        else:
            ty1, ty2 = ay1, ay2
        if x is not None:
            tx1, tx2 = x, x
        else:
            tx1, tx2 = ax2, ax1
        p1 = ell_pt(ax1, ay1, RX, RY, tx1, ty1)
        p2 = ell_pt(ax2, ay2, RX, RY, tx1, ty2)
        link(ax, p1, p2, style=style)
        if label_xy is None:
            label_xy = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
        tag(ax, label_xy[0], label_xy[1], text, fs=7.3)

    msg(1, 2, "1: enterSurplusDetails()", y=7.80, label_xy=(3.45, 7.98))
    msg(2, 3, "2: POST /api/listings", y=7.80, label_xy=(7.35, 7.98))
    msg(3, 8, "9: notifyAvailableFood()", y=7.80, label_xy=(11.25, 7.98))
    msg(3, 4, "3: publishSurplus(dto)", x=10.15, label_xy=(10.42, 6.38))
    msg(4, 6, "6: insert(listingDoc)", x=10.15, label_xy=(10.42, 4.08))
    msg(6, 4, "7: saved(listing)", x=8.45, label_xy=(8.18, 4.08))
    msg(4, 3, "8: listing + photoUrl", x=8.45, label_xy=(8.18, 6.38))
    msg(4, 5, "4: predictDemand(name)", y=5.38, label_xy=(11.25, 5.58))
    msg(5, 4, "5: recommendation(conf)", y=4.92, label_xy=(11.25, 4.72))
    msg(2, 3, "12: requestFood(id)", y=7.30, label_xy=(7.35, 7.10))

    # notify the NGO dashboard, then the NGO requests the food
    elbow(ax, [(8.35, 7.19), (7.55, 6.30), (6.30, 6.30), (6.30, 3.36)])
    tag(ax, 7.05, 6.52, "10: notifyAvailableFood()", fs=7.3)
    elbow(ax, [(4.45, 3.00), (3.85, 3.00), (3.85, 7.55), (4.45, 7.55)])
    tag(ax, 3.55, 5.30, "11: requestFood(listingId)", fs=7.3, ha="right")

    note(ax, 11.05, 3.05,
         "A communication diagram shows the same scenario as the sequence "
         "diagram, but emphasises which objects live on which lifeline: the "
         "arrows are links between object instances, not messages down a "
         "timeline. Messages are numbered in chronological order.",
         w=4.25)

    save(fig, "communication.png")


# --------------------------------------------------------------------------
# 3. State machine diagram
# --------------------------------------------------------------------------
def state_machine():
    W, H = 16.7, 6.9
    fig, ax = canvas(W, H)
    heading(ax, W / 2, 6.55,
            "State machine diagram — life cycle of a DonationRequest")

    SH, MID, TOP, LOW = 0.62, 2.85, 4.55, 1.30
    cy, uy, ly = MID + SH / 2, TOP + SH / 2, LOW + SH / 2

    ax.add_patch(Circle((0.45, cy), 0.11, facecolor=DARK,
                        edgecolor="none", zorder=4))
    state(ax, 0.75, MID, 2.20, SH, "Unregistered")
    state(ax, 3.55, MID, 2.40, SH, "pending", fill=LIGHT)
    state(ax, 7.10, TOP, 2.50, SH, "accepted", fill=LIGHT)
    state(ax, 10.30, TOP, 2.70, SH, "pickup assigned", fill=LIGHT)
    state(ax, 13.95, TOP, 2.05, SH, "delivered", fill=LIGHT)
    state(ax, 7.10, LOW, 2.50, SH, "declined", fill=LIGHT)
    state(ax, 10.30, LOW, 2.70, SH, "expired", fill=LIGHT)
    ax.add_patch(Circle((16.38, uy), 0.15, facecolor="white",
                        edgecolor=DARK, lw=1.5, zorder=4))
    ax.add_patch(Circle((16.38, uy), 0.065, facecolor=DARK,
                        edgecolor="none", zorder=5))

    elbow(ax, [(0.45, cy), (0.45, 3.80), (1.85, 3.80), (1.85, MID + SH)])
    tag(ax, 1.20, 3.96, "signUp()", fs=7.6)

    link(ax, (2.95, cy), (3.55, cy))
    tag(ax, 3.25, MID - 0.20, "requestFood()", fs=7.6)

    elbow(ax, [(5.95, 3.30), (6.55, 3.30), (6.55, uy), (7.10, uy)])
    tag(ax, 6.40, 3.90, "accept()", fs=7.6, ha="right")

    elbow(ax, [(5.95, 3.02), (6.75, 3.02), (6.75, ly), (7.10, ly)])
    tag(ax, 6.60, 2.42, "decline()", fs=7.6, ha="right")

    link(ax, (9.60, uy), (10.30, uy))
    tag(ax, 9.95, TOP - 0.20, "assignPartner()", fs=7.4)
    link(ax, (13.00, uy), (13.95, uy))
    tag(ax, 13.48, TOP - 0.20, "markDelivered()", fs=7.4)
    elbow(ax, [(16.00, uy), (16.38, uy)])
    tag(ax, 16.15, TOP - 0.20, "confirmReceipt()", fs=6.4)

    elbow(ax, [(8.35, TOP), (8.35, 3.00), (9.90, 3.00), (9.90, ly), (10.30, ly)])
    tag(ax, 9.15, 3.14, "bestBefore passes", fs=7.2)

    note(ax, 0.75, LOW,
         "A request that is never accepted before the listing's best-before "
         "time also moves to expired, and the uncollected food is recorded in "
         "the waste log. Declined and expired are terminal for that request; a "
         "new request is raised for the next batch.", w=5.60)

    save(fig, "state-machine.png")


# --------------------------------------------------------------------------
# 4. Package diagram
# --------------------------------------------------------------------------
def package_diagram():
    W, H = 16.2, 9.5
    fig, ax = canvas(W, H)
    heading(ax, W / 2, 9.25, "Package diagram — FoodLoop logical organisation")

    frame(ax, 0.30, 4.35, 15.60, 4.65, "«root»  foodloop")

    frame(ax, 0.60, 5.05, 4.40, 3.35, "presentation", fs=9.5)
    frame(ax, 5.40, 5.05, 4.40, 3.35, "client", fs=9.5)
    frame(ax, 10.20, 5.05, 5.40, 3.35, "service", fs=9.5)

    for i, t in enumerate(["views · all screens", "auth / login screen",
                           "dashboard · reports"]):
        node(ax, 0.90, 7.55 - i * 0.70, 3.80, 0.52, t, fs=8.4)
    for i, t in enumerate(["PollScheduler", "ApiClient", "SessionStore"]):
        node(ax, 5.70, 7.55 - i * 0.70, 3.80, 0.52, t, fs=8.4)
    for i, t in enumerate(["authService · surplusService", "logisticsService",
                           "wasteService · impactService"]):
        node(ax, 10.50, 7.55 - i * 0.70, 4.80, 0.52, t, fs=8.4)

    frame(ax, 0.30, 0.30, 7.55, 3.60, "«node»  backend (express)", fs=9.5)
    frame(ax, 8.15, 0.30, 7.75, 3.60, "«database»  persistence (mongoose)", fs=9.5)

    for i, t in enumerate(["http layer · REST routes", "auth middleware · JWT",
                           "image resolver · TheMealDB"]):
        node(ax, 0.60, 2.90 - i * 0.90, 3.45, 0.75, t, fs=8.2)
    for i, t in enumerate(["seed & backfill jobs", "domain services",
                           "config / .env loader"]):
        node(ax, 4.25, 2.90 - i * 0.90, 3.45, 0.75, t, fs=8.2)

    for i, t in enumerate(["models · 9 schemas", "repositories"]):
        node(ax, 8.45, 2.90 - i * 0.90, 3.45, 0.75, t, fs=8.2)
    for i, t in enumerate(["seed data", "connect + retry"]):
        node(ax, 12.15, 2.90 - i * 0.90, 3.45, 0.75, t, fs=8.2)
    node(ax, 8.45, 1.10, 7.15, 0.75, "database: foodloop  (local mongod or Atlas)", fs=8.2)

    link(ax, (5.00, 6.75), (5.40, 6.75), style="dep")
    tag(ax, 5.20, 6.99, "«uses»", fs=6.6)
    link(ax, (9.80, 6.75), (10.20, 6.75), style="dep")
    tag(ax, 10.00, 6.99, "«uses»", fs=6.6)
    link(ax, (2.80, 5.05), (2.80, 3.90), style="dashed")
    tag(ax, 2.80, 4.47, "«invokes»", fs=6.8)
    link(ax, (12.90, 5.05), (12.90, 3.90), style="dashed")
    tag(ax, 12.90, 4.47, "«persists»", fs=6.8)
    link(ax, (7.85, 2.28), (8.15, 2.28), style="dashed")
    tag(ax, 8.00, 2.52, "«maps»", fs=6.4)

    save(fig, "package.png")


# --------------------------------------------------------------------------
# 5. Component diagram
# --------------------------------------------------------------------------
def component_diagram():
    W, H = 16.2, 9.4
    fig, ax = canvas(W, H)
    heading(ax, W / 2, 9.15, "Component diagram — FoodLoop runtime components")

    frame(ax, 0.30, 4.55, 15.60, 4.05, "«device»  client browser")
    frame(ax, 0.30, 0.30, 15.60, 3.85, "«server»  node.js application")

    for i, (t, sub) in enumerate([
            ("index.html", "«presentation» · screens and modals"),
            ("styles.css", "«presentation» · layout and theme"),
            ("app.js", "«controller» · render, events, session"),
            ("config.js", "«configuration» · FOODLOOP_API")]):
        node(ax, 0.70 + i * 3.85, 7.15, 3.55, 0.95, t,
             [sub], fs=10.0, ifs=7.8)

    node(ax, 1.20, 5.35, 3.65, 0.95, "ApiClient",
         ["«service»", "fetch wrapper · JSON · token"], fs=10.0)
    node(ax, 6.30, 5.35, 3.65, 0.95, "SessionStore",
         ["«service»", "localStorage session"], fs=10.0)
    node(ax, 11.40, 5.35, 3.95, 0.95, "PollScheduler",
         ["«service»", "bootstrap every 15 s"], fs=10.0)

    for i, (t, sub) in enumerate([
            ("Express App", "«boundary» · routes, static, json"),
            ("AuthController", "«controller» · signup/signin/verify"),
            ("SurplusController", "«controller» · listings, requests"),
            ("WasteController", "«controller» · waste, pickups, partners"),
            ("HealthController", "«control» · /api/health")]):
        node(ax, 0.70 + i * 3.03, 2.70, 2.85, 0.95, t,
             ["«controller»", sub], fs=9.4, ifs=7.4)

    node(ax, 0.70, 1.30, 3.65, 1.05, "Domain Services",
         ["«service»", "publish · request · accept · schedule"], fs=9.6)
    node(ax, 4.75, 1.30, 3.65, 1.05, "ImageResolver",
         ["«service»", "TheMealDB photo lookup"], fs=9.6)
    node(ax, 8.80, 1.30, 3.65, 1.05, "ActivityService",
         ["«service»", "activity feed and metrics"], fs=9.6)
    node(ax, 12.85, 1.30, 3.05, 1.05, "Seeder",
         ["«service»", "demo data + backfill"], fs=9.6)

    node(ax, 0.70, 0.45, 7.75, 0.75, "Mongoose Models & Repositories",
         ["«database» · users · listings · requests · ngoRequests · "
          "pickups · partners · waste · activity · metrics"],
         fs=9.4, ifs=7.4)
    node(ax, 8.80, 0.45, 7.10, 0.75, "MongoDB",
         ["«database» · foodloop database (local mongod or Atlas)"],
         fs=9.4, ifs=7.4)

    link(ax, (5.67, 7.15), (3.00, 6.30), style="dep")
    link(ax, (11.42, 7.15), (5.60, 6.30), style="dep", rad=0.08)
    link(ax, (15.20, 7.15), (13.30, 6.30), style="dep", rad=-0.06)
    tag(ax, 12.55, 6.80, "HTTPS / JSON", fs=7.2)
    link(ax, (3.00, 5.82), (3.00, 3.65), style="dep", rad=-0.12)
    link(ax, (13.30, 5.82), (13.30, 3.65), style="dep", rad=0.12)
    tag(ax, 8.15, 4.72, "«rest»", fs=6.8)
    link(ax, (8.10, 5.82), (8.10, 6.30), style="dep")
    link(ax, (3.55, 2.70), (3.55, 2.35), style="dep")
    link(ax, (6.58, 2.70), (6.40, 2.35), style="dep")
    link(ax, (9.61, 2.70), (10.40, 2.35), style="dep")
    link(ax, (12.64, 2.70), (13.90, 2.35), style="dep")
    link(ax, (2.50, 1.30), (2.50, 1.20), style="dep")
    link(ax, (10.60, 1.30), (10.60, 1.20), style="dep")

    save(fig, "component.png")


# --------------------------------------------------------------------------
# 6. Deployment diagram
# --------------------------------------------------------------------------
def deployment_diagram():
    W, H = 16.0, 8.9
    fig, ax = canvas(W, H)
    heading(ax, W / 2, 8.60, "Deployment diagram — FoodLoop runtime topology")

    frame(ax, 0.35, 4.55, 4.85, 3.10, "«device»  client", fs=9.8)
    frame(ax, 6.30, 0.35, 5.05, 7.95, "«node»  application server", fs=9.8)
    frame(ax, 12.55, 4.55, 3.10, 3.10, "«cloud»  database", fs=9.8)

    node(ax, 0.70, 5.85, 4.15, 1.35, "web browser",
         ["«artifact» index.html", "renders the app and issues fetch() calls"],
         fs=10.0, ifs=7.8)
    node(ax, 0.70, 4.75, 4.15, 0.80, "localStorage",
         ["«artifact» session token"], fs=10.0, ifs=7.8)

    node(ax, 6.65, 5.85, 4.35, 1.35, "FoodLoop Express service",
         ["«artifact» server.js", "PORT 5000 · node >= 18",
          "serves the static page and the REST API"], fs=10.0, ifs=7.8)
    node(ax, 6.65, 4.60, 4.35, 0.90, "Mongoose ODM",
         ["«artifact» 9 models + repositories"], fs=10.0, ifs=7.8)
    node(ax, 6.65, 3.20, 4.35, 0.90, "ImageResolver",
         ["«component» TheMealDB lookup"], fs=10.0, ifs=7.8)
    node(ax, 6.65, 1.30, 4.35, 1.35, "Seed & backfill jobs",
         ["«component» demo data on an empty database",
          "«artifact» .env · PORT · JWT_SECRET · MONGODB_URI"],
         fs=10.0, ifs=7.8)

    node(ax, 12.85, 5.85, 2.50, 1.35, "MongoDB",
         ["«database»", "db: foodloop", "local mongod or Atlas"], fs=10.0, ifs=7.8)

    node(ax, 12.55, 1.55, 3.10, 1.10, "TheMealDB API",
         ["«external»", "food photo lookup"], fs=10.0, ifs=7.8, fill=LIGHT)

    link(ax, (4.85, 6.55), (6.65, 6.55))
    tag(ax, 5.75, 6.82, "HTTP / JSON :5000", fs=7.2)
    link(ax, (11.00, 6.35), (12.85, 6.10))
    tag(ax, 11.98, 6.58, "mongodb://", fs=7.0)
    tag(ax, 12.62, 5.72, "27017", fs=6.8)
    link(ax, (11.00, 3.65), (12.55, 2.35), style="dashed", rad=-0.14)
    tag(ax, 12.35, 3.10, "HTTPS", fs=7.0)
    link(ax, (2.78, 5.85), (2.78, 5.55), style="dep")
    link(ax, (8.82, 5.85), (8.82, 5.50), style="dep")
    link(ax, (8.82, 4.60), (8.82, 4.10), style="dep")
    link(ax, (8.82, 3.20), (8.82, 2.65), style="dep")

    note(ax, 0.70, 4.05,
         "In production a single Express process serves index.html and /api, "
         "so the browser talks to one origin and no CORS setup is needed. "
         "GitHub Pages can host only the static page, so it needs a separately "
         "hosted HTTPS backend.", w=4.55)

    save(fig, "deployment.png")


# --------------------------------------------------------------------------
# 7. Relational schema (class diagram -> relational database)
# --------------------------------------------------------------------------
def relational():
    W, H = 16.2, 9.2
    fig, ax = canvas(W, H)
    heading(ax, W / 2, 8.90,
            "Relational schema mapped from the design class diagram")

    def tbl(x, ytop, name, rows, w=3.60):
        """Draw a table anchored by its TOP edge, growing downward."""
        h = 0.44 + 0.235 * len(rows)
        node(ax, x, ytop - h, w, h, name, rows, fs=10.0, ifs=7.8)
        return ytop - h

    b_users = tbl(0.40, 8.10, "users",
                  ["##PK  user_id", "UK    email", "      name",
                   "      password_hash", "      role", "      created_at"])
    b_list = tbl(4.60, 8.10, "listings",
                 ["##PK  listing_id", "      name", "      detail",
                  "      quantity", "      expiry", "      image",
                  "      status", "      requests"])
    b_req = tbl(8.80, 8.10, "requests",
                ["##PK  request_id", "##FK  ngo_id → users(user_id)",
                 "      name", "      item", "      status",
                 "      time", "      created_at"])
    b_pick = tbl(13.20, 8.10, "pickups",
                 ["##PK  pickup_id", "      day", "      time",
                  "      item", "      partner"], w=2.60)

    tbl(8.80, 5.55, "ngo_requests",
        ["##PK  id", "      food_name", "      ngo_name", "      created_at"])
    tbl(0.40, 5.55, "partners",
        ["##PK  partner_id", "      name", "      detail", "      color",
         "      status"])
    b_waste = tbl(4.60, 5.55, "waste",
                  ["##PK  waste_id", "      date", "      category",
                   "      quantity", "      reason", "      logged_by"])

    tbl(0.40, 3.10, "activity",
        ["##PK  activity_id", "      icon", "      title", "      description",
         "      time", "      created_at"])
    tbl(4.60, 3.10, "metrics",
        ["##PK  metric_id", "UK    key", "      food_diverted",
         "      meals_shared", "      pending_pickups", "      active_partners"])

    link(ax, (4.00, 7.00), (4.60, 7.00))
    tag(ax, 4.12, 7.24, "1", fs=7.0)
    tag(ax, 4.48, 7.24, "0..*", fs=7.0)
    tag(ax, 4.30, 6.76, "lists", fs=6.8)

    link(ax, (8.20, 7.00), (8.80, 7.00))
    tag(ax, 8.32, 7.24, "1", fs=7.0)
    tag(ax, 8.68, 7.24, "0..*", fs=7.0)
    tag(ax, 8.50, 6.76, "received by", fs=6.6)

    link(ax, (10.60, b_req), (10.60, 5.55))
    tag(ax, 10.88, 5.80, "0..1", fs=7.2)
    tag(ax, 10.00, 5.80, "raises", fs=7.0)

    elbow(ax, [(12.40, 6.50), (12.90, 6.50), (12.90, 5.05), (14.50, 5.05),
               (14.50, b_pick)])
    tag(ax, 13.85, 5.20, "scheduled as", fs=7.0)
    tag(ax, 12.72, 5.90, "0..*", fs=7.2)

    link(ax, (4.00, 4.70), (4.60, 4.70))
    tag(ax, 4.30, 4.92, "logs", fs=7.0)

    elbow(ax, [(6.00, b_waste), (6.00, 3.50), (2.20, 3.50), (2.20, 3.10)])
    tag(ax, 4.10, 3.50, "logged by", fs=7.0)

    note(ax, 8.80, 1.55,
         "MongoDB stores each table as a collection of documents. The ObjectId "
         "becomes the primary key; ngo_id is the only enforced relationship, "
         "linking each donation request back to the NGO account that raised it.",
         w=6.90)

    save(fig, "relational-schema.png")


# --------------------------------------------------------------------------
# 8. System sequence diagram (black-box view of the system)
# --------------------------------------------------------------------------
def system_sequence():
    W, H = 13.6, 8.4
    fig, ax = canvas(W, H)
    heading(ax, W / 2, 8.10,
            "System sequence diagram — publish surplus and complete a donation")

    AX, SX, NX = 2.60, 6.90, 11.30
    TOP, BOT = 6.60, 0.18

    actor(ax, AX, TOP, "Restaurant Admin", fs=9.0)
    node(ax, SX - 1.55, TOP - 0.10, 3.10, 0.72, "«system»  FoodLoop", fs=10.0)
    actor(ax, NX, TOP, "NGO partner", fs=9.0)

    for x in (AX, SX, NX):
        ax.plot([x, x], [TOP - 0.05, BOT], color=GREY, lw=1.1,
                linestyle=(0, (4, 3)), zorder=2)

    def msg(y, x1, x2, label, dashed=False, note=None):
        link(ax, (x1, y), (x2, y), style="dashed" if dashed else "solid")
        ax.add_patch(Rectangle((x1 - 0.085, y - 0.24), 0.17, 0.24,
                               linewidth=0, facecolor=GREEN, alpha=0.28, zorder=3))
        mx = (x1 + x2) / 2
        tag(ax, mx, y + 0.17, label, fs=7.4,
            ha="right" if x2 < x1 else "left",
            colour=GREY if dashed else DARK)
        if note:
            tag(ax, mx, y - 0.17, note, fs=6.8, colour=GREEN,
                ha="right" if x2 < x1 else "left", box=True)

    # alt frame around the accept / decline branch
    ax.add_patch(Rectangle((1.50, 2.62), 11.10, 1.38, linewidth=1.0,
                           edgecolor=GREEN, facecolor="none", zorder=1))
    ax.plot([1.50, 1.50, 1.82], [4.00, 3.78, 4.00], color=GREEN, lw=1.0, zorder=2)
    tag(ax, 1.88, 3.89, "[NGO accepts the request]", fs=7.4, ha="left")
    ax.plot([1.50, 12.60], [3.05, 3.05], color=GREEN, lw=0.9,
            linestyle=(0, (4, 2)), zorder=2)
    tag(ax, 1.88, 2.94, "[NGO declines — the listing stays available]", fs=7.4, ha="left")

    msg(5.90, AX, SX, "1: login(credentials)")
    msg(5.45, SX, AX, "2: authenticationResult(token)", dashed=True)
    msg(5.00, AX, SX, "3: enterSurplusFoodDetails(name, qty, bestBefore)")
    msg(4.55, SX, AX, "4: listingPublished(listing, photoUrl)", dashed=True,
        note="[create : resolveFoodImage(name)]")
    msg(4.12, SX, NX, "5: notifyAvailableFood(listing)")
    msg(3.72, NX, SX, "6: requestFood(listingId)")
    msg(3.32, SX, NX, "7: donationAccepted()", dashed=True)
    msg(2.82, SX, NX, "8: declineRequest()", dashed=True)
    msg(2.25, AX, SX, "9: schedulePickup(day, time, partner)")
    msg(1.80, SX, AX, "10: pickupDelivered()", dashed=True)
    msg(1.35, SX, AX, "11: updateDonationStatus('Delivered')", dashed=True)
    msg(0.90, AX, SX, "12: generateImpactReport()")
    msg(0.45, SX, AX, "13: report(foodDiverted, mealsShared)", dashed=True)

    save(fig, "system-sequence.png")


# --------------------------------------------------------------------------
if __name__ == "__main__":
    design_class()
    communication()
    system_sequence()
    state_machine()
    package_diagram()
    component_diagram()
    deployment_diagram()
    relational()
    print("\nAll missing diagrams generated.")