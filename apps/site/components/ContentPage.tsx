import Link from 'next/link';

export function ContentPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <article className="content-page section-wrap">
      <Link className="back-link" href="/">
        ← Início
      </Link>
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="content-intro">{intro}</p>
      <div className="content-body">{children}</div>
    </article>
  );
}
