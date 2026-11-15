'use client';

import { useState } from 'react';
import { NICHE_CATALOG, type Area } from '@licitecomigo/shared';

const profiles = [
  { value: 'iniciante', label: 'Iniciante — quero começar com explicações simples' },
  { value: 'mentorado', label: 'Mentorado — quero estudar com acompanhamento' },
  { value: 'profissional', label: 'Avançado — quero uma visão direta e densa' },
] as const;

type Profile = (typeof profiles)[number]['value'];

/** Cada área só oferece os modos coerentes com ela (o servidor confere de novo). */
const PROFILES_BY_AREA: Record<Area, readonly Profile[]> = {
  administracao: ['iniciante', 'mentorado', 'profissional'],
  curso: ['iniciante', 'mentorado', 'profissional'],
  empresa: ['iniciante', 'profissional'],
  aluno: ['iniciante', 'mentorado'],
  mentor: ['iniciante', 'mentorado', 'profissional'],
  colaborador: ['iniciante', 'profissional'],
};

export function OnboardingForm({
  area,
  initialProfile,
}: Readonly<{ area: Area; initialProfile?: string | null }>) {
  const [profile, setProfile] = useState<Profile>(() =>
    profiles.some(
      (item) => item.value === initialProfile && PROFILES_BY_AREA[area].includes(item.value),
    )
      ? (initialProfile as Profile)
      : 'iniciante',
  );
  const options = profiles.filter((item) => PROFILES_BY_AREA[area].includes(item.value));
  const [niches, setNiches] = useState(['', '', '']);
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedNiches = [...new Set(niches.filter(Boolean))];
    if (selectedNiches.length === 0) {
      setMessage('Escolha pelo menos um nicho para receber oportunidades e alertas do seu escopo.');
      return;
    }
    const response = await fetch('/api/core/me/onboarding', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ perfil_jornada: profile, nichos: selectedNiches, respostas: {} }),
    });
    setMessage(
      response.ok
        ? `Jornada salva com ${selectedNiches.length} nicho(s).`
        : response.status === 401
          ? 'Entre para salvar seu diagnóstico.'
          : 'Não foi possível salvar a jornada e os nichos.',
    );
  }

  return (
    <form className="onboarding-form" onSubmit={(event) => void submit(event)}>
      <fieldset className="question-card">
        <legend>Seus nichos de atuação</legend>
        <p className="form-hint">
          Escolha de um a três nichos. Eles definem o escopo padrão do Radar, das buscas salvas e
          dos alertas.
        </p>
        {niches.map((niche, index) => (
          <label key={index}>
            {`Nicho ${index + 1}`}
            <select
              value={niche}
              required={index === 0}
              onChange={(event) =>
                setNiches((current) =>
                  current.map((value, currentIndex) =>
                    currentIndex === index ? event.target.value : value,
                  ),
                )
              }
            >
              <option value="">{index === 0 ? 'Selecione um nicho' : 'Não usar este campo'}</option>
              {NICHE_CATALOG.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <small>
          Catálogo de navegação com origem declarada; não substitui CNAE, CATMAT ou CATSER.
        </small>
      </fieldset>

      <label className="question-card">
        <span>Como você prefere as explicações</span>
        <select value={profile} onChange={(event) => setProfile(event.target.value as Profile)}>
          {options.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit">Salvar e continuar</button>
      {message ? (
        <p className="success-message" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
