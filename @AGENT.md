# Agent Build & Run Instructions

## Initial Setup
```bash
# Install uv if not present
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies
uv sync

# Copy environment configuration
cp .env.example .env
# Edit .env and add your Azure API keys and endpoints
```

## Build
```bash
# Build Docker image
docker build -t document-drafter .
```

## Test
```bash
# Run all tests
uv run pytest

# Run with verbose output
uv run pytest -v

# Run with coverage
uv run pytest --cov=document_drafter
```

## Run
```bash
# Development server (with auto-reload)
uv run uvicorn document_drafter.main:app --reload

# Or use Makefile
make run

# Production server
uv run uvicorn document_drafter.main:app --host 0.0.0.0 --port 8000

# Docker
docker run -p 8000:8000 \
  -e AZURE_OPENAI_API_KEY=your-key \
  -e AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/ \
  -e AZURE_DOC_INTEL_KEY=your-key \
  -e AZURE_DOC_INTEL_ENDPOINT=https://your-resource.cognitiveservices.azure.com/ \
  document-drafter
```

## Development Mode
```bash
# Run with hot reload
uv run uvicorn document_drafter.main:app --reload
```

## Lint/Format
```bash
# Check for issues
uv run ruff check src/ tests/

# Auto-fix issues
uv run ruff check src/ tests/ --fix

# Format code
uv run ruff format src/ tests/

# Check formatting without changes
uv run ruff format --check .
```

## Clean
```bash
# Remove Python cache files
find . -type d -name "__pycache__" -exec rm -rf {} +
find . -type f -name "*.pyc" -delete
```

---

## Environment Variables
Required environment variables (see `.env.example`):
- `AZURE_OPENAI_API_KEY`: Azure OpenAI API key (required for AI features)
- `AZURE_OPENAI_ENDPOINT`: Azure OpenAI endpoint URL (required for AI features)
- `AZURE_OPENAI_DEPLOYMENT`: Azure OpenAI deployment name (default: gpt-4o-mini)
- `AZURE_DOC_INTEL_KEY`: Azure Document Intelligence API key (required for AI features)
- `AZURE_DOC_INTEL_ENDPOINT`: Azure Document Intelligence endpoint URL (required for AI features)
- `AZURE_DOC_INTEL_MODEL`: Document Intelligence model (default: prebuilt-read)
- `MIN_CONTENT_THRESHOLD`: Minimum chars before AI fallback (default: 100)
- `LOG_LEVEL`: Logging level - DEBUG, INFO, WARNING, ERROR (default: INFO)

## Dependencies
Main dependencies (see `pyproject.toml` for versions):
- FastAPI: Web framework
- Uvicorn: ASGI server
- OpenAI: Azure OpenAI API client
- Azure AI Document Intelligence: PDF/document parsing
- PyMuPDF: Local PDF parsing
- python-docx: DOCX reading/writing
- Pydantic Settings: Configuration management

Dev dependencies:
- pytest: Testing framework
- httpx: HTTP client for testing
- ruff: Linting and formatting
- pytest-asyncio: Async test support

## Troubleshooting
Common issues and solutions:
- **Azure API keys not set**: Copy `.env.example` to `.env` and add your Azure API keys and endpoints
- **uv not found**: Install with `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **Import errors**: Run `uv sync` to install dependencies
- **Tests failing**: Ensure `AZURE_OPENAI_API_KEY` is set for integration tests

## Makefile Commands
- `make check` - Verify environment setup (API key, uv, docker)
- `make test` - Run tests
- `make lint` - Check code with ruff
- `make build` - Build Docker image
- `make run` - Start dev server
- `make docs` - Generate documentation
