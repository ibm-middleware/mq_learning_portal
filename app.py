"""Thin portal server. Branding and pages live in site.yaml."""

from __future__ import annotations

import os
from pathlib import Path

import yaml
from flask import Flask, abort, render_template

ROOT = Path(__file__).resolve().parent


def get_config_path() -> Path:
    config_env = os.environ.get("SITE_CONFIG")
    if config_env:
        cfg = Path(config_env)
        return cfg if cfg.is_absolute() else ROOT / cfg
    return ROOT / "site.yaml"


CONFIG_PATH = get_config_path()

app = Flask(__name__)


def _fill(value, names: dict):
    if isinstance(value, str):
        for key, replacement in names.items():
            value = value.replace("{" + key + "}", str(replacement))
        return value
    if isinstance(value, list):
        return [_fill(item, names) for item in value]
    if isinstance(value, dict):
        return {key: _fill(item, names) for key, item in value.items()}
    return value


def _names(raw: dict) -> dict:
    site = raw["site"]
    org_name = os.environ.get("PORTAL_ORG", site.get("org", ""))
    site_name = os.environ.get("PORTAL_SITE_NAME", site.get("name", "MQ Native HA Portal"))
    site["org"] = org_name
    site["name"] = site_name
    names = {
        "site": site_name,
        "org": org_name,
        "tagline": site.get("tagline", ""),
    }
    for key, product in raw["products"].items():
        names[key] = product["name"]
        names[f"{key}_short"] = product.get("short", product["name"])
    names["tagline"] = _fill(site.get("tagline", ""), names)
    return names


def load_portal():
    config_path = get_config_path()
    raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    names = _names(raw)
    site = _fill(raw["site"], names)
    products = raw["products"]
    sections = _fill(raw["sections"], names)
    home = _fill(raw["home"], names)
    pages = _fill(raw["pages"], names)

    by_path = {}
    for page in pages:
        page.setdefault("nav", page["title"])
        page.setdefault("product", "all")
        page.setdefault("related", [])
        page.setdefault("cta", "Open →")
        product = products.get(page["product"], {})
        page.setdefault("icon", page["product"])
        page.setdefault("mark", product.get("icon", page["icon"]))
        by_path[page["path"]] = page

    section_label = {item["id"]: item["label"] for item in sections}
    for page in pages:
        if page["section"] == "home":
            page["crumb"] = f'Portal / {page["nav"]}'
        else:
            label = section_label.get(page["section"], page["section"])
            page["crumb"] = (
                f'<a href="/">Home</a> / {label} / {page["nav"]}'
            )

    walkable = [page for page in pages if page["path"] != "/"]
    for index, page in enumerate(walkable):
        if index == 0:
            page["prev"] = {"href": "/", "label": site["name"]}
        else:
            prior = walkable[index - 1]
            page["prev"] = {"href": prior["path"], "label": prior["nav"]}
        if index + 1 < len(walkable):
            nxt = walkable[index + 1]
            page["next"] = {"href": nxt["path"], "label": nxt["nav"]}
        else:
            page["next"] = {"href": "/", "label": site["name"]}

    nav = []
    for section in sections:
        children = [
            {
                "href": page["path"],
                "label": page["nav"],
                "product": page.get("product", "all"),
            }
            for page in pages
            if page["section"] == section["id"] and page["path"] != "/"
        ]
        if section["id"] == "home":
            nav.append(
                {
                    "id": "home",
                    "label": section["label"],
                    "href": "/",
                    "icon": section.get("icon", "home"),
                }
            )
            continue
        if not children:
            continue
        nav.append(
            {
                "id": section["id"],
                "label": section["label"],
                "icon": section.get("icon", "folder"),
                "children": children,
            }
        )

    search_index = [
        {
            "title": page["title"],
            "href": page["path"],
            "blurb": page.get("blurb", ""),
            "tags": page.get("tags", ""),
        }
        for page in pages
        if page["path"] != "/"
    ]

    related_links = {}
    for page in pages:
        related_links[page["path"]] = [
            {"href": path, "label": by_path[path]["nav"]}
            for path in page.get("related", [])
            if path in by_path
        ]

    groups = []
    for group in home.get("groups", []):
        groups.append(
            {
                **group,
                "pages": [
                    page
                    for page in pages
                    if page.get("home_group") == group["title"]
                ],
            }
        )
    home["groups"] = groups
    home["link_items"] = [
        {"href": path, "label": by_path[path]["nav"]}
        for path in home.get("links", [])
        if path in by_path
    ]

    chips = []
    for key, product in products.items():
        product["id"] = key
        if product.get("chip"):
            chips.append(product)

    return {
        "site": site,
        "products": products,
        "names": names,
        "nav": nav,
        "pages": by_path,
        "page_list": pages,
        "search_index": search_index,
        "home": home,
        "related_links": related_links,
        "chips": chips,
        "n": type("N", (), names)(),
    }


def portal():
    if not hasattr(app, "portal_cache") or app.debug:
        app.portal_cache = load_portal()
    return app.portal_cache


@app.context_processor
def inject_portal():
    data = portal()
    return {
        "site": data["site"],
        "products": data["products"],
        "n": data["n"],
        "nav": data["nav"],
        "search_index": data["search_index"],
        "home": data["home"],
        "chips": data["chips"],
        "related_links": data["related_links"],
    }


def render_page(path: str):
    data = portal()
    page = data["pages"].get(path)
    if not page:
        abort(404)
    return render_template(
        page["template"],
        page=page,
        current_path=path,
        section=page["section"],
        related=data["related_links"].get(path, []),
    )


@app.route("/health")
def health():
    return {"status": "ok", "pages": len(portal()["pages"])}


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def any_page(path: str):
    return render_page("/" + path if path else "/")


@app.errorhandler(404)
def not_found(_error):
    data = portal()
    return (
        render_template(
            "404.html",
            page={
                "title": "Not found",
                "section": "home",
                "nav": "Not found",
                "crumb": "Portal / Not found",
                "path": "",
            },
            current_path="",
            section="home",
            related=[],
        ),
        404,
    )


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "5080"))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() in ("1", "true", "yes")
    app.run(host=host, port=port, debug=debug)

