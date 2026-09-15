import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
  // Baileys (WhatsApp automation) and its logger use dynamic requires /
  // optional native bindings that break when webpack tries to bundle them
  // for the server. Keep them as real Node `require`s instead.
  serverExternalPackages: ['@whiskeysockets/baileys', 'pino'],
};

export default nextConfig;
