'use client';

import { useEffect, useState } from 'react';
import { api, send } from '../../lib/api';
import { Kpi } from '../components/ui';

type Painel = {
  desde: string;
  perfil_configurado: boolean;
  cards: {
    abertas: number;
    novas: number;
    encerram_hoje: number;
    encerram_3_dias: number;
    alteradas: number;
    favoritas: number;
    grande_vulto: number;
    compativeis: number | null;
  };
};

type CardDef = {
  key: keyof Painel['cards'];
  label: string;
  hint: string;
  tone?: 'warn' | 'ok';
  filter: (since: string) => Record<string, string>;
};

const CARDS: CardDef[] = [
  {
    key: 'novas',
    label: 'Novas desde a última visita',
    hint: 'Publicadas depois do seu último acesso',
    tone: 'ok',
    filter: (since) => ({ periodo_tipo: 'publicacao', periodo_de: since }),
  },
  {
    key: 'encerram_hoje',
    label: 'Encerram hoje',
    hint: 'Propostas ainda abertas',
    tone: 'warn',
    filter: () => ({ situacao_prazo: 'vencendo_hoje', ordem: 'encerram' }),
  },
  {
    key: 'encerram_3_dias',
    label: 'Encerram em 3 dias',
    hint: 'Hora de decidir',
    tone: 'warn',
    filter: () => ({ situacao_prazo: 'vencendo_3', ordem: 'encerram' }),
  },
  {
    key: 'alteradas',
    label: 'Alteradas',
    hint: 'Mudaram depois da sua última visita',
    filter: (since) => ({ alterados_desde: since }),
  },
  {
    key: 'compativeis',
    label: 'Muito compatíveis',
    hint: 'Nota de 70% ou mais, com propostas abertas',
    tone: 'ok',
    filter: () => ({ compat_min: '70', situacao_prazo: 'abertas', ordem: 'compat' }),
  },
  {
    key: 'grande_vulto',
    label: 'Grande vulto',
    hint: 'Acima de R$ 200 milhões, em aberto',
    filter: () => ({ grande_vulto: 'true', situacao_prazo: 'abertas' }),
  },
  {
    key: 'favoritas',
    label: 'Favoritas',
    hint: 'As que você marcou',
    filter: () => ({ estado: 'favoritas' }),
  },
  {
    key: 'abertas',
    label: 'Com propostas abertas',
    hint: 'No seu escopo de nichos',
    filter: () => ({ situacao_prazo: 'abertas' }),
  },
];

export function RadarPainel({
  onPick,
  refreshKey,
  onProfile,
}: Readonly<{
  onPick: (filters: Record<string, string>) => void;
  refreshKey: number;
  onProfile: (configured: boolean) => void;
}>) {
  const [data, setData] = useState<Painel | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void api<Painel>('/radar/painel')
      .then((result) => {
        if (!alive) return;
        setData(result);
        onProfile(result.perfil_configurado);
        // Registra a visita depois de ler o painel; o servidor ignora visitas seguidas.
        void send('POST', '/radar/visita').catch(() => undefined);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
    // onProfile é estável o bastante; só recarrega quando o perfil muda.
  }, [refreshKey]);

  if (failed) return null;
  if (!data) return <p className="ui-loading">Carregando o resumo do Radar…</p>;
  return (
    <section aria-label="Resumo do Radar" className="rd-painel">
      <div className="ui-kpis">
        {CARDS.filter((card) => data.cards[card.key] !== null).map((card) => (
          <button
            type="button"
            key={card.key}
            className="rd-kpi-button"
            onClick={() => onPick(card.filter(data.desde))}
            aria-label={`${card.label}: ${data.cards[card.key]}. Ver editais.`}
          >
            <Kpi
              label={card.label}
              value={data.cards[card.key]}
              hint={card.hint}
              tone={card.tone}
            />
          </button>
        ))}
      </div>
    </section>
  );
}
