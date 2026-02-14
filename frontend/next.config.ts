import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3200';

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.mangwale.com',
      },
      {
        protocol: 'https',
        hostname: '**.mangwale.ai',
      },
      {
        protocol: 'https',
        hostname: 'storage.mangwale.ai',
      },
      {
        protocol: 'https',
        hostname: 'mangwale-ai.s3.ap-south-1.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'mangwale.s3.ap-south-1.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 's3.ap-south-1.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'developers.google.com',
      },
      {
        protocol: 'https',
        hostname: 'maps.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      }
    ],
    // unoptimized: false — Next.js image optimization enabled
  },
  
  // Allow cross-origin requests from our domain structure
  allowedDevOrigins: [
    'test.mangwale.ai',
    'chat.mangwale.ai',
    'admin.mangwale.ai',
    '192.168.0.156',
    '192.168.0.156:3005',
    'localhost',
    'localhost:3005',
  ],
  
  // Domain-based routing with rewrites
  async rewrites() {
    return {
      // beforeFiles runs before Next.js checks for page/API route files
      // We DON'T put API rewrites here - we want local API routes to be checked first
      beforeFiles: [
        // chat.mangwale.ai - Root shows chat interface
        {
          source: '/',
          destination: '/chat',
          has: [
            {
              type: 'host',
              value: 'chat.mangwale.ai',
            },
          ],
        },
        // admin.mangwale.ai - Root redirects to admin dashboard
        {
          source: '/',
          destination: '/admin',
          has: [
            {
              type: 'host',
              value: 'admin.mangwale.ai',
            },
          ],
        },
      ],
      // afterFiles runs AFTER Next.js checks for page/API route files
      afterFiles: [
        // NOTE: WebSocket (/socket.io) is handled DIRECTLY by Traefik with higher priority
        // Do NOT proxy WebSocket through Next.js - it doesn't support WebSocket upgrades properly
        // Traefik route: chat-ws (priority 100) routes /socket.io to backend
        
        // Proxy specific API paths to backend - EXCLUDING TTS and ASR which have local handlers
        // Auth routes
        {
          source: '/api/auth/:path*',
          destination: `${backendUrl}/api/auth/:path*`,
        },
        // Chat routes
        {
          source: '/api/chat/:path*',
          destination: `${backendUrl}/api/chat/:path*`,
        },
        // Orders routes
        {
          source: '/api/orders/:path*',
          destination: `${backendUrl}/api/orders/:path*`,
        },
        // Menu routes
        {
          source: '/api/menu/:path*',
          destination: `${backendUrl}/api/menu/:path*`,
        },
        // Restaurants routes
        {
          source: '/api/restaurants/:path*',
          destination: `${backendUrl}/api/restaurants/:path*`,
        },
        // Addresses routes
        {
          source: '/api/addresses/:path*',
          destination: `${backendUrl}/api/addresses/:path*`,
        },
        // Wallet routes
        {
          source: '/api/wallet/:path*',
          destination: `${backendUrl}/api/wallet/:path*`,
        },
        // Zones routes
        {
          source: '/api/zones/:path*',
          destination: `${backendUrl}/api/zones/:path*`,
        },
        // Admin routes
        {
          source: '/api/admin/:path*',
          destination: `${backendUrl}/api/admin/:path*`,
        },
        // Location routes
        {
          source: '/api/location/:path*',
          destination: `${backendUrl}/api/location/:path*`,
        },
        // Profile routes
        {
          source: '/api/profile/:path*',
          destination: `${backendUrl}/api/profile/:path*`,
        },
        // Health routes
        {
          source: '/api/health/:path*',
          destination: `${backendUrl}/api/health/:path*`,
        },
        // Users routes
        {
          source: '/api/users/:path*',
          destination: `${backendUrl}/api/users/:path*`,
        },
        // Payments routes
        {
          source: '/api/payments/:path*',
          destination: `${backendUrl}/api/payments/:path*`,
        },
        // Notifications routes
        {
          source: '/api/notifications/:path*',
          destination: `${backendUrl}/api/notifications/:path*`,
        },
        // Coupons routes
        {
          source: '/api/coupons/:path*',
          destination: `${backendUrl}/api/coupons/:path*`,
        },
        // Files routes
        {
          source: '/api/files/:path*',
          destination: `${backendUrl}/api/files/:path*`,
        },
        // Catch-all for other API routes EXCEPT /api/tts and /api/asr (local handlers)
        // Voice routes go to backend
        {
          source: '/api/voice/:path*',
          destination: `${backendUrl}/api/voice/:path*`,
        },
        // Analytics routes
        {
          source: '/api/analytics/:path*',
          destination: `${backendUrl}/analytics/:path*`,
        },
        // Stats routes
        {
          source: '/api/stats/:path*',
          destination: `${backendUrl}/stats/:path*`,
        },
        // Broadcast routes
        {
          source: '/api/broadcast/:path*',
          destination: `${backendUrl}/api/broadcast/:path*`,
        },
      ],
      fallback: [],
    };
  },
  
  // Ensure proper CORS for API routes
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
        ],
      },
    ];
  },
};

export default nextConfig;
