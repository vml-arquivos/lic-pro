import { describe, expect, it } from 'vitest';
import { getJourneyCopy, getJourneyMode } from '../src/journey.js';

describe('journey adaptation', () => {
  it('uses guided mode for beginners and mentees', () => {
    expect(getJourneyMode('iniciante')).toBe('guided');
    expect(getJourneyMode('mentorado')).toBe('guided');
    expect(getJourneyCopy('iniciante').showGlossary).toBe(true);
  });

  it('uses dense professional mode without default teaching copy', () => {
    const copy = getJourneyCopy('profissional');
    expect(copy.mode).toBe('professional');
    expect(copy.showGlossary).toBe(false);
    expect(copy.showRiskWarnings).toBe(false);
  });
});
