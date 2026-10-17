export const PRODUCT_NAME = 'Licite Comigo';

export type ServiceHealth = {
  service: string;
  status: 'ok';
  product: typeof PRODUCT_NAME;
};

export function health(service: string): ServiceHealth {
  return { service, status: 'ok', product: PRODUCT_NAME };
}
