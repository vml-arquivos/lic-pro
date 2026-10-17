# Ingestão

Serviço Python reservado para conectores públicos, normalização e publicação de eventos. Nesta fase ele contém apenas a fundação e um smoke test local; conectores e integrações entram na Fase 2.

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e '.[dev]'
ruff check src tests
mypy src
pytest
```
