'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError, send } from '../../lib/api';
import { brl } from '../../lib/money';
import { Alert } from '../components/ui';

type Compra = {
  status: 'pendente' | 'paga' | 'vencida' | 'reembolsada' | 'cancelada';
  plano: string;
  email: string;
  valor_centavos: number;
  link_pagamento: string | null;
  resultado: string | null;
  acesso_url: string | null;
};

export function CompraStatus() {
  const [compra, setCompra] = useState<Compra | null>(null);
  const [error, setError] = useState('');
  const [claim, setClaim] = useState('');

  useEffect(() => {
    setClaim(new URLSearchParams(window.location.search).get('c') ?? '');
  }, []);

  useEffect(() => {
    if (!claim) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const data = await send<Compra>('POST', '/public/compra', { claim });
        if (!active) return;
        setCompra(data);
        setError('');
        // Enquanto não paga, confere de novo a cada 5 s.
        if (data.status === 'pendente' || (data.status === 'paga' && !data.resultado)) {
          timer = setTimeout(() => void load(), 5000);
        }
      } catch (cause) {
        if (!active) return;
        setError(
          cause instanceof ApiError && cause.status === 404
            ? 'Não encontramos esta compra. Confira o link que você recebeu.'
            : 'Não foi possível consultar agora. Tentaremos de novo.',
        );
        timer = setTimeout(() => void load(), 8000);
      }
    }
    void load();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [claim]);

  if (!claim) {
    return (
      <section className="shop-closed">
        <h1>Compra não encontrada</h1>
        <p>Abra o link completo que apareceu depois do pagamento.</p>
        <Link className="ui-btn" href="/curso">
          Ver o curso
        </Link>
      </section>
    );
  }
  if (error && !compra) {
    return (
      <section className="shop-closed">
        <h1>Sua compra</h1>
        <Alert kind="error">{error}</Alert>
      </section>
    );
  }
  if (!compra) return <p className="ui-loading">Carregando…</p>;

  return (
    <section className="shop-status">
      <p className="eyebrow">{compra.plano}</p>
      {compra.status === 'paga' ? (
        <Paga compra={compra} />
      ) : compra.status === 'pendente' || compra.status === 'vencida' ? (
        <>
          <h1>Falta o pagamento</h1>
          <p>
            Valor: <strong>{brl(compra.valor_centavos)}</strong>. Pague com Pix, boleto ou cartão.
            Esta página confirma sozinha assim que o pagamento cair (Pix costuma levar segundos).
          </p>
          {compra.link_pagamento ? (
            <a className="ui-btn" href={compra.link_pagamento} target="_blank" rel="noreferrer">
              Pagar agora
            </a>
          ) : null}
          <small className="plan-note">
            Guarde esta página: ela é o seu acompanhamento. Confirmação enviada para {compra.email}.
          </small>
        </>
      ) : (
        <>
          <h1>Compra {compra.status === 'reembolsada' ? 'reembolsada' : 'cancelada'}</h1>
          <p>Se isso não era esperado, fale com a equipe.</p>
          <Link className="ui-btn" href="/curso">
            Ver o curso
          </Link>
        </>
      )}
    </section>
  );
}

function Paga({ compra }: Readonly<{ compra: Compra }>) {
  if (compra.acesso_url) {
    return (
      <>
        <h1>Pagamento confirmado</h1>
        <p>
          Crie sua senha para entrar no curso. O link vale por 7 dias e só pode ser usado uma vez.
        </p>
        <a className="ui-btn" href={compra.acesso_url}>
          Criar minha senha e entrar
        </a>
      </>
    );
  }
  if (compra.resultado === 'conta_criada' || compra.resultado === 'matriculado') {
    return (
      <>
        <h1>Seu acesso está liberado</h1>
        <p>
          {compra.resultado === 'matriculado'
            ? 'Você já tinha conta: o curso foi adicionado a ela.'
            : 'Sua conta já foi criada.'}{' '}
          Entre com o seu e-mail e senha.
        </p>
        <Link className="ui-btn" href="/login">
          Entrar
        </Link>
      </>
    );
  }
  if (compra.resultado === 'convite_expirado') {
    return (
      <>
        <h1>Pagamento confirmado</h1>
        <p>O link de acesso expirou. Fale com a equipe para receber um novo.</p>
      </>
    );
  }
  if (compra.resultado === 'revisar') {
    return (
      <>
        <h1>Pagamento confirmado</h1>
        <p>
          Seu e-mail já está em uso por outro tipo de conta. A equipe vai concluir o seu acesso e
          retornar.
        </p>
      </>
    );
  }
  return (
    <>
      <h1>Pagamento confirmado</h1>
      <p>Estamos liberando o seu acesso. Esta página atualiza sozinha.</p>
    </>
  );
}
