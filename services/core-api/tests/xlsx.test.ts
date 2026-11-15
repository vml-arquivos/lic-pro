import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCsv, buildXlsx, safeCellText } from '../src/xlsx.js';

function hasOpenpyxl(): boolean {
  try {
    execFileSync('python3', ['-I', '-c', 'import openpyxl'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('exportação', () => {
  it('protege contra fórmulas em texto vindo da fonte', () => {
    expect(safeCellText('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(safeCellText('+55 61')).toBe("'+55 61");
    expect(safeCellText('Pregão')).toBe('Pregão');
  });

  it('gera CSV com BOM, ponto e vírgula e aspas escapadas', () => {
    const csv = buildCsv(
      ['a', 'b'],
      [
        ['x;y', 'diz "oi"'],
        [1.5, null],
      ],
    );
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"x;y";"diz ""oi"""');
    expect(csv).toContain('1.5;');
  });

  it.skipIf(!hasOpenpyxl())('gera um .xlsx que o Python consegue abrir', () => {
    const buffer = buildXlsx(
      'Editais',
      ['Título', 'Valor'],
      [
        ['Pregão <A> & B', 1234.5],
        ['=2+2', null],
      ],
    );
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    const dir = mkdtempSync(join(tmpdir(), 'xlsx-'));
    const file = join(dir, 'saida.xlsx');
    writeFileSync(file, buffer);
    const out = execFileSync(
      'python3',
      [
        '-I',
        '-c',
        'import sys,openpyxl;ws=openpyxl.load_workbook(sys.argv[1]).active;print(ws.title);print([[c.value for c in r] for r in ws.iter_rows()])',
        file,
      ],
      { encoding: 'utf8' },
    );
    expect(out).toContain('Editais');
    expect(out).toContain("'Título', 'Valor'");
    expect(out).toContain("'Pregão <A> & B', 1234.5");
    expect(out).toContain('"\'=2+2"');
  });
});
