/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@licitecomigo/ui'],
  // Código só no servidor: sem mapas de código-fonte no navegador, sem aviso de qual
  // tecnologia roda e sem mensagens de console em produção (erros ficam).
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  compiler: { removeConsole: { exclude: ['error'] } },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
      // Nenhum arquivo de mapa de código é servido, mesmo que algum seja gerado.
      {
        source: '/:path*.map',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex' }],
      },
    ];
  },
  async redirects() {
    return [{ source: '/:path*.map', destination: '/404', permanent: false }];
  },
};

export default nextConfig;
