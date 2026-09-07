# MQ Native HA Learning Portal

Two architecture presentations for IBM MQ Native HA on OpenShift / Kubernetes:

- `/architecture/nativeha_use_cases` — failover and region switch
- `/architecture/nativeha_internals` — replicated log, quorum, heartbeat, election

Educational visualization only — not official IBM or Red Hat documentation. Trademarks and third-party licenses: [NOTICE](NOTICE).

## Run

Python 3.9+.

```bash
git clone git@github.com:ibm-middleware/mq_learning_portal.git
cd mq_learning_portal
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:5080

Optional branding: edit `site.yaml`, or set `PORTAL_ORG` / `PORTAL_SITE_NAME`.

## License

Apache License 2.0.
