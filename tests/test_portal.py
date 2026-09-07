"""Unit and integration tests for the MQ Learning Portal."""

import pytest
from app import app, load_portal


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_health_endpoint(client):
    """Health endpoint must return 200 and json status ok."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "ok"
    assert data["pages"] >= 3


def test_home_page(client):
    """Home page must return 200 and contain core branding."""
    response = client.get("/")
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert "<title>" in html
    assert "MQ Native HA" in html


def test_all_configured_pages(client):
    """Every page registered in site.yaml must render with status 200."""
    portal_data = load_portal()
    for path, page_meta in portal_data["pages"].items():
        response = client.get(path)
        assert response.status_code == 200, f"Page {path} failed with {response.status_code}"
        html = response.get_data(as_text=True)
        assert page_meta["title"] in html or page_meta["nav"] in html


def test_404_page(client):
    """Non-existent route should return custom 404 page."""
    response = client.get("/non-existent-page-xyz")
    assert response.status_code == 404
    html = response.get_data(as_text=True)
    assert "Not found" in html


def test_token_interpolation():
    """Portal data should properly interpolate variables like {mq}, {ocp}, {org}."""
    portal_data = load_portal()
    names = portal_data["names"]
    assert "site" in names
    assert "org" in names
    assert "mq" in names
    assert "ocp" in names
    assert "nativeha" in names

    # Verify no unresolved curly tokens in critical site fields
    site = portal_data["site"]
    assert "{mq}" not in site.get("tagline", "")
    assert "{ocp}" not in site.get("tagline", "")


def test_environment_variable_override(monkeypatch):
    """Verify that PORTAL_ORG and PORTAL_SITE_NAME environment variables override defaults."""
    monkeypatch.setenv("PORTAL_ORG", "AcmeCorp")
    monkeypatch.setenv("PORTAL_SITE_NAME", "Acme MQ Hub")
    portal_data = load_portal()
    assert portal_data["names"]["org"] == "AcmeCorp"
    assert portal_data["names"]["site"] == "Acme MQ Hub"
    assert portal_data["site"]["name"] == "Acme MQ Hub"
