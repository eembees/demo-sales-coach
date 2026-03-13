PORT ?= 8000

.PHONY: run screenshots install

install:
	uv sync

run:
	uv run uvicorn main:app --reload --port $(PORT)

screenshots:
	uv run python scripts/screenshot.py --url http://localhost:$(PORT) --out screenshots
