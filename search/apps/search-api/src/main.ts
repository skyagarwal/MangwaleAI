import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { setupSwagger } from './config/swagger.config';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
  });
  
  const config = app.get(ConfigService);
  const port = parseInt(config.get<string>('PORT') || '3100', 10);

  // ========================================
  // 🔒 SECURITY CONFIGURATION
  // ========================================
  
  // 1. Helmet - Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdnjs.cloudflare.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow Swagger UI
  }));

  // 2. CORS - Configure allowed origins
  const allowedOrigins = config.get<string>('ALLOWED_ORIGINS')?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3100',
    'http://localhost:4000',
    'https://opensearch.mangwale.ai',
    'https://mangwale.ai',
  ];
  
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
    credentials: true,
    maxAge: 3600, // Cache preflight for 1 hour
  });

  // 3. Global validation pipe with sanitization
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown properties
      forbidNonWhitelisted: false, // Don't throw on unknown properties
      transform: true, // Transform payload to DTO instance
      transformOptions: {
        enableImplicitConversion: true,
      },
      disableErrorMessages: config.get<string>('NODE_ENV') === 'production', // Hide details in prod
    }),
  );

  // 4. Setup comprehensive Swagger documentation
  setupSwagger(app);

  // ========================================
  // 🚀 START SERVER
  // ========================================
  
  await app.listen(port);
  
  const baseUrl = process.env.API_BASE_URL || `http://localhost:${port}`;
  const isAuthEnabled = config.get<string>('ENABLE_AUTH') === 'true';
  
  console.log('');
  console.log('========================================');
  console.log('🔍 Module-Aware Search API');
  console.log('========================================');
  console.log(`🚀 Server:        ${baseUrl}`);
  console.log(`📚 API Docs:      ${baseUrl}/api-docs`);
  console.log(`📄 OpenAPI:       ${baseUrl}/api-docs-json`);
  console.log(`🏥 Health:        ${baseUrl}/health`);
  console.log('');
  console.log('🔒 Security:');
  console.log(`   - Helmet:      ✅ Enabled`);
  console.log(`   - CORS:        ✅ ${allowedOrigins.length} origins`);
  console.log(`   - Validation:  ✅ Enabled`);
  console.log(`   - Auth:        ${isAuthEnabled ? '✅ Enabled' : '⚠️  Disabled (dev mode)'}`);
  console.log(`   - Rate Limit:  ✅ 100 req/min (public)`);
  console.log(`   - Audit Log:   ✅ Enabled`);
  console.log('');
  console.log('📦 Modules:');
  console.log('   - V2 Search:   ✅ Classic endpoints');
  console.log('   - V3 NLU:      ✅ AI-powered search');
  console.log('   - Admin:       ✅ Management API');
  console.log('   - Analytics:   ✅ Insights & trends');
  console.log('========================================');
  console.log('');
}

bootstrap();
