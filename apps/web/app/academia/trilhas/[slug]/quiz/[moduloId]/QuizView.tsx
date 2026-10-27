'use client';

import Link from 'next/link';
import { useState } from 'react';
import { errorText, send } from '../../../../../../lib/api';
import {
  Alert,
  Empty,
  PageHeader,
  Panel,
  Resource,
  useResource,
} from '../../../../../components/ui';

type Quiz = {
  id: string;
  titulo: string;
  status: string;
  questoes: Array<{ id: string; ordem: number; enunciado: string; alternativas: string[] }> | null;
};
type Result = {
  nota: number | string | null;
  resultado: Array<{ questao_id: string; correta: boolean; resposta_correta: number | null }>;
};

export function QuizView({
  moduloId,
  slug,
  canAnswer,
}: Readonly<{ moduloId: string; slug: string; canAnswer: boolean }>) {
  const [quiz] = useResource<Quiz>(`/academy/quizzes/${moduloId}`);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  async function submit(quizId: string) {
    setError('');
    try {
      setResult(
        await send<Result>('POST', `/academy/quizzes/${quizId}/attempts`, { respostas: answers }),
      );
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  return (
    <div className="ui-page">
      <Link className="back-link" href={`/academia/trilhas/${slug}`}>
        ← Voltar para a trilha
      </Link>
      <Resource value={quiz}>
        {(data) => {
          const questions = (data.questoes ?? []).filter((question) => question.id);
          return (
            <>
              <PageHeader eyebrow="Questionário" title={data.titulo} />
              {data.status !== 'publicado' ? (
                <Alert kind="info">Questionário ainda em revisão pela equipe.</Alert>
              ) : null}
              {error ? <Alert kind="error">{error}</Alert> : null}
              {result ? (
                <Alert kind={Number(result.nota ?? 0) >= 70 ? 'success' : 'info'}>
                  {result.nota === null
                    ? 'Respostas enviadas.'
                    : `Você acertou ${Math.round(Number(result.nota))}% das questões. Pode refazer quando quiser.`}
                </Alert>
              ) : null}
              {questions.length === 0 ? (
                <Panel title="Sem questões">
                  <Empty>Este questionário ainda não tem perguntas.</Empty>
                </Panel>
              ) : (
                questions.map((question) => {
                  const feedback = result?.resultado.find(
                    (item) => item.questao_id === question.id,
                  );
                  return (
                    <div className="cs-question" key={question.id}>
                      <strong>
                        {question.ordem}. {question.enunciado}
                      </strong>
                      {question.alternativas.map((option, index) => (
                        <label className="ui-check" key={option}>
                          <input
                            type="radio"
                            name={question.id}
                            disabled={!canAnswer}
                            checked={answers[question.id] === index}
                            onChange={() =>
                              setAnswers((current) => ({ ...current, [question.id]: index }))
                            }
                          />
                          {option}
                          {feedback && feedback.resposta_correta === index ? (
                            <span className="cs-ok">✓ resposta certa</span>
                          ) : null}
                          {feedback && !feedback.correta && answers[question.id] === index ? (
                            <span className="cs-bad">✗</span>
                          ) : null}
                        </label>
                      ))}
                    </div>
                  );
                })
              )}
              {canAnswer && questions.length ? (
                <button
                  className="ui-btn"
                  disabled={questions.some((question) => answers[question.id] === undefined)}
                  onClick={() => void submit(data.id)}
                >
                  Enviar respostas
                </button>
              ) : (
                <p className="cs-hint">
                  As respostas são corrigidas e salvas só para contas de aluno.
                </p>
              )}
            </>
          );
        }}
      </Resource>
    </div>
  );
}
