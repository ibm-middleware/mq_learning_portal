# MQ Native HA Learning Portal

[![Python](https://img.shields.io/badge/Python-3.9%2B-blue?logo=python)](requirements.txt)
[![Framework](https://img.shields.io/badge/Framework-Flask-lightgrey?logo=flask)](app.py)
[![License](https://img.shields.io/badge/License-Apache%202.0-green.svg)](LICENSE)

A small, offline-capable learning portal with two architecture presentations for **IBM MQ Native HA** on **OpenShift** / **Kubernetes**:

- Native HA use cases (normal flow, replica loss, active-pod failover, region switch)
- Native HA internals (replicated log, quorum, heartbeat, election, catch-up)

This is **educational visualization**, not official IBM or Red Hat product documentation. Product names and logos are trademarks of their owners. See [NOTICE](NOTICE).

---

## Pages

| Route | Description |
| --- | --- |
| `/` | Portal home |
| `/architecture/nativeha_use_cases` | Interactive Native HA use cases |
| `/architecture/nativeha_internals` | Interactive Native HA pod internals |
| `/health` | JSON liveness/readiness probe |

---

## Quick start

Requires Python 3.9 or later.

```bash
git clone git@github.com:ibm-middleware/mq_learning_portal.git
cd mq_learning_portal
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
FLASK_DEBUG=true python app.py
```

Open [http://127.0.0.1:5080](http://127.0.0.1:5080).

---

## Rebrand for your organization

No customer data or organization-specific secrets belong in this repository.
Override branding at runtime:

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `5080` |
| `HOST` | Bind address | `0.0.0.0` |
| `PORTAL_ORG` | Organization label | `Enterprise Messaging` |
| `PORTAL_SITE_NAME` | Portal title | `MQ Native HA Portal` |
| `SITE_CONFIG` | Alternate YAML config | `site.yaml` |
| `FLASK_DEBUG` | Flask debug / reloader | `false` |

You can also edit [`site.yaml`](site.yaml). Tokens such as `{mq}`, `{ocp}`, `{nativeha}`, and `{org}` are expanded at load time.

---

## Container

```bash
docker build -t mq-learning-portal:latest .
docker run --rm -p 5080:5080 -e PORTAL_ORG="Your Organization" mq-learning-portal:latest
curl http://localhost:5080/health
```

Or: `docker compose up --build`

The image runs as a non-root user and is compatible with OpenShift restricted SCC (arbitrary UID).

Production without Docker:

```bash
gunicorn --bind 0.0.0.0:5080 --workers 2 --threads 4 app:app
```

---

## Tests

```bash
pip install -r requirements-dev.txt
pytest -v
```

---

## License

Apache License 2.0. Third-party fonts, icons, and trademarks are listed in [NOTICE](NOTICE).
