import { health } from '@licitecomigo/shared';

export function getHealth() {
  return health('realtime-gw');
}

if (process.env.NODE_ENV !== 'test') {
  console.info(JSON.stringify(getHealth()));
}
