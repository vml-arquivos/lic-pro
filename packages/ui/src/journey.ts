export type JourneyProfile = 'iniciante' | 'mentorado' | 'profissional';
export type JourneyMode = 'guided' | 'professional';

export function getJourneyMode(profile: JourneyProfile): JourneyMode {
  return profile === 'profissional' ? 'professional' : 'guided';
}

export function getJourneyCopy(profile: JourneyProfile): {
  mode: JourneyMode;
  label: string;
  nextStep: string;
  showGlossary: boolean;
  showRiskWarnings: boolean;
} {
  if (profile === 'profissional') {
    return {
      mode: 'professional',
      label: 'Modo profissional',
      nextStep: 'Use filtros avançados e atalhos para seguir sua análise.',
      showGlossary: false,
      showRiskWarnings: false,
    };
  }
  if (profile === 'mentorado') {
    return {
      mode: 'guided',
      label: 'Modo guiado para mentorados',
      nextStep: 'Revise a próxima aula e leve suas dúvidas para o mentor.',
      showGlossary: true,
      showRiskWarnings: true,
    };
  }
  return {
    mode: 'guided',
    label: 'Modo guiado para iniciantes',
    nextStep: 'Comece pela próxima aula e avance um passo de cada vez.',
    showGlossary: true,
    showRiskWarnings: true,
  };
}
