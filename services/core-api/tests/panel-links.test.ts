import { describe, expect, it } from 'vitest';
import { loadConfig, panelBaseUrl } from '../src/config.js';
import { invitationLink } from '../src/platform.js';

const base = { NODE_ENV: 'test', APP_URL: 'https://velho.licite.test' };
const panels = {
  ...base,
  PANEL_URL_ADMIN: 'https://admin.licite.test',
  PANEL_URL_EMPRESA: 'https://app.licite.test/',
  PANEL_URL_ALUNO: 'https://aluno.licite.test',
};

describe('links por painel', () => {
  it('sem endereços por painel, tudo continua no APP_URL', () => {
    const config = loadConfig(base);
    expect(invitationLink(config, 'tok', 'empresa')).toBe(
      'https://velho.licite.test/convite?token=tok',
    );
    expect(panelBaseUrl(config, 'aluno')).toBe('https://velho.licite.test');
  });

  it('cada convite abre no painel de quem foi convidado', () => {
    const config = loadConfig(panels);
    expect(invitationLink(config, 't', 'empresa')).toBe('https://app.licite.test/convite?token=t');
    expect(invitationLink(config, 't', 'aluno')).toBe('https://aluno.licite.test/convite?token=t');
    // sem endereço de Mentor, o mentor usa o do Aluno
    expect(invitationLink(config, 't', 'mentor')).toBe('https://aluno.licite.test/convite?token=t');
  });

  it('o painel de origem só vale se for um endereço configurado', () => {
    const config = loadConfig(panels);
    expect(panelBaseUrl(config, 'empresa', 'https://admin.licite.test/')).toBe(
      'https://admin.licite.test',
    );
    expect(panelBaseUrl(config, 'empresa', 'https://golpe.example')).toBe(
      'https://app.licite.test',
    );
  });

  it('a Administração do curso usa o endereço do Aluno, ou o próprio se existir', () => {
    expect(panelBaseUrl(loadConfig(panels), 'curso')).toBe('https://aluno.licite.test');
    const own = loadConfig({ ...panels, PANEL_URL_CURSO: 'https://gestao.licite.test' });
    expect(panelBaseUrl(own, 'curso')).toBe('https://gestao.licite.test');
    expect(panelBaseUrl(own, 'aluno')).toBe('https://aluno.licite.test');
  });
});
