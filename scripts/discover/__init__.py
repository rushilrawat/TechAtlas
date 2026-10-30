"""TechAtlas discovery-assist tool (offline / build-time only).

Proposes candidate technologies from authoritative structured sources (Wikidata,
optionally package registries) for HUMAN review. It never writes data/seed/* directly
and never invents domain assignments or typed edges — those stay human decisions.
Approved candidates reach the dataset only via promote.py -> scripts/expand/_apply.py,
the same curated commit path the manual batches use.

Not importable from the API request path.
"""
