import { Icon } from './Icon';

const POINTS = [
  ['search', 'Editais do governo no Radar'],
  ['bell', 'Alertas e prazos sob controle'],
  ['cap', 'Academia e mentoria'],
  ['spark', 'Ana, com fontes e limites claros'],
] as const;

/** Painel de apresentação da tela de entrada. */
export function AuthAside() {
  return (
    <aside className="auth-aside" aria-label="Sobre o Licite Comigo">
      <p className="hub-eyebrow" style={{ color: 'rgba(255,255,255,0.8)' }}>
        Rede de especialistas
      </p>
      <h2>Uma mentora. Inteligência conectada.</h2>
      <p>
        Radar de licitações, prazos, documentos e curso reunidos em um só lugar, com a Ana como
        núcleo que organiza tudo para você.
      </p>
      <ul>
        {POINTS.map(([icon, text]) => (
          <li key={text}>
            <span className="aside-ico">
              <Icon name={icon} size={15} />
            </span>
            {text}
          </li>
        ))}
      </ul>
    </aside>
  );
}
