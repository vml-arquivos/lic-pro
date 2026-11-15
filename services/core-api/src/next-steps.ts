/** Próximos passos sugeridos para a empresa, por regras fixas (sem IA). */
export type StepInput = {
  tem_empresa: boolean;
  buscas_ativas: number;
  documentos_total: number;
  documentos_vencidos: number;
  documentos_vencendo: number;
  documento_proximo?: { nome: string; dias: number } | null;
  salvas_paradas: number;
  habilitacao_sem_checklist: number;
  prazos_ate_3_dias: number;
  tarefas_atrasadas: number;
  pipeline_total: number;
};
export type Step = { codigo: string; texto: string; href: string };

export function nextSteps(input: StepInput): Step[] {
  const steps: Step[] = [];
  if (!input.tem_empresa)
    steps.push({
      codigo: 'empresa',
      texto: 'Cadastre os dados da sua empresa.',
      href: '/empresas',
    });
  if (input.documentos_vencidos > 0)
    steps.push({
      codigo: 'docs_vencidos',
      texto: `${input.documentos_vencidos} documento(s) com validade vencida. Renove e atualize a data.`,
      href: '/documentos',
    });
  if (input.prazos_ate_3_dias > 0)
    steps.push({
      codigo: 'prazos',
      texto: `${input.prazos_ate_3_dias} prazo(s) nos próximos 3 dias.`,
      href: '/agenda',
    });
  if (input.tarefas_atrasadas > 0)
    steps.push({
      codigo: 'tarefas',
      texto: `${input.tarefas_atrasadas} tarefa(s) atrasada(s).`,
      href: '/agenda',
    });
  if (input.documentos_vencendo > 0)
    steps.push({
      codigo: 'docs_vencendo',
      texto: input.documento_proximo
        ? `${input.documento_proximo.nome} vence em ${input.documento_proximo.dias} dia(s).`
        : `${input.documentos_vencendo} documento(s) vencem em até 30 dias.`,
      href: '/documentos',
    });
  if (input.habilitacao_sem_checklist > 0)
    steps.push({
      codigo: 'checklist',
      texto: `${input.habilitacao_sem_checklist} oportunidade(s) em habilitação sem checklist.`,
      href: '/oportunidades',
    });
  if (input.salvas_paradas > 0)
    steps.push({
      codigo: 'salvas',
      texto: `${input.salvas_paradas} oportunidade(s) salva(s) há mais de 7 dias sem análise. Decida se vale seguir.`,
      href: '/oportunidades',
    });
  if (input.documentos_total === 0)
    steps.push({
      codigo: 'docs_vazio',
      texto: 'Cadastre seus documentos e as validades para ser avisado antes de vencer.',
      href: '/documentos',
    });
  if (input.buscas_ativas === 0)
    steps.push({
      codigo: 'busca',
      texto: 'Salve uma busca no Radar para receber avisos de oportunidades novas.',
      href: '/radar',
    });
  if (input.pipeline_total === 0 && input.buscas_ativas > 0)
    steps.push({
      codigo: 'pipeline',
      texto: 'Favorite uma oportunidade no Radar e salve no pipeline para acompanhar.',
      href: '/radar',
    });
  return steps.slice(0, 6);
}
