import { describe, expect, it } from 'vitest';
import {
  cepValido,
  cnpjValido,
  cpfValido,
  formatarCep,
  formatarCnpj,
  formatarCpf,
  formatarCpfOuCnpj,
  somenteDigitos,
} from '../src/index.js';

describe('documentos', () => {
  it('valida CNPJ pelos dígitos verificadores', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('00.000.000/0001-91')).toBe(true);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
    expect(cnpjValido('11111111111111')).toBe(false);
    expect(cnpjValido('123')).toBe(false);
    expect(cnpjValido(null)).toBe(false);
  });

  it('valida CPF pelos dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224726')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false);
  });

  it('valida CEP', () => {
    expect(cepValido('01001-000')).toBe(true);
    expect(cepValido('0100100')).toBe(false);
    expect(cepValido('00000000')).toBe(false);
  });

  it('aplica máscara enquanto digita', () => {
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarCnpj('112223')).toBe('11.222.3');
    expect(formatarCnpj('1122233300')).toBe('11.222.333/00');
    expect(formatarCpf('52998224725')).toBe('529.982.247-25');
    expect(formatarCpf('5299')).toBe('529.9');
    expect(formatarCpfOuCnpj('52998224725')).toBe('529.982.247-25');
    expect(formatarCpfOuCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarCep('01001000')).toBe('01001-000');
    expect(formatarCep('0100')).toBe('0100');
    expect(somenteDigitos('a1-2.3')).toBe('123');
  });
});
