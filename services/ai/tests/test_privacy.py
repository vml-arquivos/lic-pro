from src.privacy import mask_sensitive


def test_masks_cpf_and_email_without_removing_context() -> None:
    value = "Contato maria.silva@example.com CPF 123.456.789-09 para revisão."
    masked = mask_sensitive(value)

    assert "m***@example.com" in masked
    assert "123.456.789-09" not in masked
    assert "***.***.***-**" in masked
    assert "para revisão" in masked
