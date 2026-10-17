from src.models import DocumentChunk
from src.providers import FakeLLMProvider
from src.reader import InMemoryAnalysisStore, InMemoryChunkStore, ReaderAgent


def test_reader_only_retrieves_chunks_from_request_tenant() -> None:
    chunks = InMemoryChunkStore()
    analyses = InMemoryAnalysisStore()
    chunks.save(
        [
            DocumentChunk("tenant-a", "edital-a", 2, "Prazo", None, "Entrega em 30 dias.", {}),
            DocumentChunk("tenant-b", "edital-a", 9, "Sigilo", None, "Dado de outra conta.", {}),
        ]
    )
    result = ReaderAgent(FakeLLMProvider(), chunks, analyses).analyze("tenant-a", "edital-a", "prazo de entrega")

    assert result.evidencias
    assert all(evidence.pagina == 2 for evidence in result.evidencias)
    assert "conclusão jurídica" in result.disclaimer
    assert analyses.get("tenant-b", "edital-a") is None
