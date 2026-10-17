from src.ingestion import DeterministicEmbeddingProvider, chunk_pages, embed_chunks
from src.models import PageText


def test_chunking_preserves_page_and_structural_heading() -> None:
    chunks = chunk_pages(
        [
            PageText(1, "1. Objeto\nAquisição de papel.\n\n2. Prazo\nEntrega em 30 dias."),
            PageText(2, "CLÁUSULA DE HABILITAÇÃO\nComprovação conforme anexos."),
        ],
        "tenant-a",
        "edital-a",
    )
    embedded = embed_chunks(chunks, DeterministicEmbeddingProvider())

    assert len(chunks) == 3
    assert chunks[0].pagina == 1
    assert chunks[0].secao == "1. Objeto"
    assert chunks[2].clausula == "CLÁUSULA DE HABILITAÇÃO"
    assert len(embedded[0].embedding) == 1024
