import { health } from '@licitecomigo/shared';

export function getHealth() {
  return health('bid-engine');
}

if (process.env.NODE_ENV !== 'test') {
  console.info(JSON.stringify(getHealth()));
}
