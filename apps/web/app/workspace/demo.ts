import { notFound } from 'next/navigation';

export const demoMode = process.env.DEMO_MODE === 'true';

export function requireDemoMode(): void {
  if (!demoMode) notFound();
}
