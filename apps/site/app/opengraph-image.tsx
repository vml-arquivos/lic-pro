import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Licite Comigo — organize licitações públicas';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        background: '#f4f7f8',
        color: '#10273b',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        justifyContent: 'space-between',
        padding: '72px',
        width: '100%',
      }}
    >
      <div style={{ alignItems: 'center', display: 'flex', gap: '18px' }}>
        <div
          style={{
            alignItems: 'center',
            background: '#10273b',
            borderRadius: '14px',
            color: '#ffffff',
            display: 'flex',
            fontSize: '30px',
            fontWeight: 800,
            height: '64px',
            justifyContent: 'center',
            width: '64px',
          }}
        >
          LC
        </div>
        <span style={{ fontSize: '30px', fontWeight: 800 }}>Licite Comigo</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '900px' }}>
        <span style={{ color: '#0f937f', fontSize: '24px', fontWeight: 800 }}>
          LICITAÇÕES PÚBLICAS
        </span>
        <span style={{ fontSize: '64px', fontWeight: 800, lineHeight: 1.08 }}>
          Encontre oportunidades. Confira o edital. Organize o próximo passo.
        </span>
      </div>
      <div style={{ color: '#0f937f', fontSize: '24px', fontWeight: 600 }}>
        Radar · Empresas · Academia · Ana
      </div>
    </div>,
    { ...size },
  );
}
