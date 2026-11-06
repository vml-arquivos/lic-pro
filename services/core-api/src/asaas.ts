import type { RuntimeConfig } from './config.js';

/** Cliente mínimo da API do Asaas (v3). Só o que o produto usa: cliente, cobrança e assinatura. */

export class AsaasError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type AsaasPayment = {
  id: string;
  status: string;
  value: number;
  dueDate?: string;
  paymentDate?: string | null;
  invoiceUrl?: string;
  subscription?: string | null;
  externalReference?: string | null;
};

export type AsaasClient = {
  createCustomer(input: {
    name: string;
    email: string;
    cpfCnpj: string;
    externalReference?: string;
  }): Promise<{ id: string }>;
  createPayment(input: {
    customer: string;
    valueCents: number;
    dueDate: string;
    description: string;
    externalReference: string;
  }): Promise<AsaasPayment>;
  createSubscription(input: {
    customer: string;
    valueCents: number;
    nextDueDate: string;
    cycle: 'MONTHLY' | 'YEARLY';
    description: string;
    externalReference: string;
  }): Promise<{ id: string }>;
  listSubscriptionPayments(subscriptionId: string): Promise<AsaasPayment[]>;
  getPayment(paymentId: string): Promise<AsaasPayment>;
  cancelSubscription(subscriptionId: string): Promise<void>;
};

type Fetch = typeof fetch;

export function createAsaasClient(config: RuntimeConfig, fetchImpl: Fetch = fetch): AsaasClient {
  if (!config.asaasApiKey)
    throw new AsaasError(503, 'billing_not_configured', 'Cobrança não configurada.');
  const apiKey = config.asaasApiKey;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let response: Response;
    try {
      const init: RequestInit = {
        method,
        headers: {
          access_token: apiKey,
          'content-type': 'application/json',
          'user-agent': 'LiciteComigo/1.0',
        },
        signal: controller.signal,
      };
      if (body !== undefined) init.body = JSON.stringify(body);
      response = await fetchImpl(`${config.asaasBaseUrl}${path}`, init);
    } catch {
      throw new AsaasError(502, 'asaas_unreachable', 'O serviço de pagamento não respondeu.');
    } finally {
      clearTimeout(timer);
    }
    const text = await response.text();
    let payload: unknown = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }
    if (!response.ok) {
      const errors = (payload as { errors?: Array<{ description?: string; code?: string }> })
        .errors;
      const first = errors?.[0];
      throw new AsaasError(
        response.status >= 500 ? 502 : 400,
        first?.code ?? 'asaas_error',
        first?.description ?? 'O serviço de pagamento recusou a operação.',
      );
    }
    return payload as T;
  }

  const reais = (cents: number) => Math.round(cents) / 100;

  return {
    createCustomer: (input) =>
      call('POST', '/customers', {
        name: input.name,
        email: input.email,
        cpfCnpj: input.cpfCnpj,
        externalReference: input.externalReference,
        notificationDisabled: false,
      }),
    createPayment: (input) =>
      call('POST', '/payments', {
        customer: input.customer,
        billingType: 'UNDEFINED',
        value: reais(input.valueCents),
        dueDate: input.dueDate,
        description: input.description,
        externalReference: input.externalReference,
      }),
    createSubscription: (input) =>
      call('POST', '/subscriptions', {
        customer: input.customer,
        billingType: 'UNDEFINED',
        value: reais(input.valueCents),
        nextDueDate: input.nextDueDate,
        cycle: input.cycle,
        description: input.description,
        externalReference: input.externalReference,
      }),
    listSubscriptionPayments: async (subscriptionId) =>
      (
        await call<{ data?: AsaasPayment[] }>(
          'GET',
          `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`,
        )
      ).data ?? [],
    getPayment: (paymentId) => call('GET', `/payments/${encodeURIComponent(paymentId)}`),
    cancelSubscription: async (subscriptionId) => {
      await call('DELETE', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
    },
  };
}

/** Datas do Asaas são AAAA-MM-DD no horário de Brasília. */
export function asaasDate(date: Date = new Date(), addDays = 0): string {
  const shifted = new Date(date.getTime() + addDays * 86_400_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(shifted);
  return parts;
}
