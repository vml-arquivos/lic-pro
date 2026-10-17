# IA

Serviço Python reservado para os agentes Reader, Hunter, Pricer, Writer e para a Ana. Nesta fase ele contém apenas a fundação e um smoke test local; os provedores e agentes entram nas fases previstas no escopo.

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e '.[dev]'
ruff check src tests
mypy src
pytest
```
