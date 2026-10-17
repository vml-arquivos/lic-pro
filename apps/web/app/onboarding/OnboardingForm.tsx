'use client';

import { useState } from 'react';

const questions = [
  'Você já participou de uma licitação?',
  'Como prefere aprender um assunto novo?',
  'Qual é seu objetivo principal agora?',
  'Como está sua familiaridade com termos de compras públicas?',
  'Você quer receber orientação passo a passo?',
] as const;

export function OnboardingForm() {
  const [profile, setProfile] = useState<'iniciante' | 'mentorado' | 'profissional'>('iniciante');
  const [submitted, setSubmitted] = useState(false);

  return (
    <form
      className="onboarding-form"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
      }}
    >
      {questions.map((question, index) => (
        <label key={question} className="question-card">
          <span>
            {index + 1}. {question}
          </span>
          <select defaultValue={index === 0 ? 'Ainda estou começando' : 'Quero explorar'}>
            <option>Ainda estou começando</option>
            <option>Já tenho alguma experiência</option>
            <option>Quero explorar</option>
            <option>Quero acelerar uma rotina profissional</option>
          </select>
        </label>
      ))}

      <fieldset className="question-card">
        <legend>Seu perfil de jornada</legend>
        <label>
          <input
            type="radio"
            name="perfil_jornada"
            value="iniciante"
            checked={profile === 'iniciante'}
            onChange={() => setProfile('iniciante')}
          />{' '}
          Iniciante — quero começar com explicações simples
        </label>
        <label>
          <input
            type="radio"
            name="perfil_jornada"
            value="mentorado"
            checked={profile === 'mentorado'}
            onChange={() => setProfile('mentorado')}
          />{' '}
          Mentorado — quero estudar e conversar com um mentor
        </label>
        <label>
          <input
            type="radio"
            name="perfil_jornada"
            value="profissional"
            checked={profile === 'profissional'}
            onChange={() => setProfile('profissional')}
          />{' '}
          Profissional — quero uma visão mais direta e densa
        </label>
      </fieldset>

      <button type="submit">Salvar minha jornada</button>
      {submitted ? (
        <p className="success-message">
          Jornada salva como <strong>{profile}</strong>. O core API receberá estas respostas quando
          a sessão estiver conectada.
        </p>
      ) : null}
    </form>
  );
}
