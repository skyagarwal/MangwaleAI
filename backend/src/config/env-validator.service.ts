import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Environment Validator Service
 * 
 * Validates that all required environment variables are present on startup.
 * Fails fast with descriptive error messages.
 */
@Injectable()
export class EnvValidatorService implements OnModuleInit {
  private readonly logger = new Logger(EnvValidatorService.name);

  // Critical environment variables required for the application to function
  private readonly requiredVars: { key: string; description: string }[] = [
    { key: 'DATABASE_URL', description: 'PostgreSQL connection string' },
    { key: 'REDIS_HOST', description: 'Redis host for sessions/cache' },
    { key: 'PHP_BACKEND_URL', description: 'Laravel backend API URL' },
    
    // AI Services
    { key: 'NLU_PRIMARY_ENDPOINT', description: 'Mercury NLU service (IndicBERT)' },
    { key: 'VLLM_URL', description: 'vLLM inference server (Qwen2.5-7B)' },
    { key: 'DEFAULT_LLM_PROVIDER', description: 'LLM provider (vllm)' },
    
    // Search Infrastructure
    { key: 'SEARCH_API_URL', description: 'Search API service' },
    { key: 'EMBEDDING_SERVICE_URL', description: 'Text embedding service' },
    
    // Voice Services (Mercury)
    { key: 'ASR_SERVICE_URL', description: 'Speech recognition (Whisper)' },
    { key: 'TTS_SERVICE_URL', description: 'Text-to-speech service' },
    { key: 'NERVE_SYSTEM_URL', description: 'AI voice call automation' },
    
    // Telephony
    { key: 'EXOTEL_SERVICE_URL', description: 'Exotel telephony service' },
    
    // Training & Learning
    { key: 'TRAINING_SERVER_URL', description: 'Python NLU training server' },
    
    // Additional Services
    { key: 'SCRAPER_SERVICE_URL', description: 'Web scraper service' },
    
    // System
    { key: 'NODE_ENV', description: 'Node environment (development/production)' },
  ];

  // Optional but recommended variables
  private readonly optionalVars: { key: string; description: string }[] = [
    { key: 'NLU_FALLBACK_ENDPOINT', description: 'Fallback NLU service' },
    { key: 'VOICE_ORCHESTRATOR_URL', description: 'Voice orchestrator service' },
    { key: 'VLLM_CHAT_ENDPOINT', description: 'vLLM chat completions endpoint' },
    { key: 'NER_SERVICE_URL', description: 'NER entity extraction service' },
    { key: 'TRACKING_API_URL', description: 'Order tracking API' },
    { key: 'WHATSAPP_SERVICE_URL', description: 'WhatsApp messaging service' },
    { key: 'BASE_URL', description: 'Application base URL' },
    { key: 'OPENSEARCH_URL', description: 'OpenSearch for admin/bulk indexing' },
  ];

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.logger.log('🔍 Validating environment configuration...');

    const strictValidation =
      this.config.get<string>('ENV_VALIDATION_STRICT') === 'true' ||
      this.config.get<string>('NODE_ENV') === 'production';
    
    const missing: string[] = [];
    const missingOptional: string[] = [];

    // Check required variables
    for (const { key, description } of this.requiredVars) {
      const value = this.config.get<string>(key);
      if (!value) {
        missing.push(`  ❌ ${key}: ${description}`);
      } else {
        this.logger.debug(`  ✅ ${key}: set (${description})`);
      }
    }

    // Check optional variables
    for (const { key, description } of this.optionalVars) {
      const value = this.config.get<string>(key);
      if (!value) {
        missingOptional.push(`  ⚠️  ${key}: ${description} (optional)`);
      }
    }

    // Report results
    if (missing.length > 0) {
      this.logger.error('\n❌ MISSING REQUIRED ENVIRONMENT VARIABLES:\n' + missing.join('\n'));
      this.logger.error('\n📝 Please check backend/.env file');

      if (strictValidation) {
        throw new Error(
          `Missing required environment variables:\n${missing.join('\n')}`,
        );
      }

      this.logger.warn(
        'Continuing startup because strict env validation is disabled (set ENV_VALIDATION_STRICT=true to fail fast).',
      );
    }

    if (missingOptional.length > 0) {
      this.logger.warn('\n⚠️  MISSING OPTIONAL VARIABLES:\n' + missingOptional.join('\n'));
      this.logger.warn('These services may have degraded functionality');
    }

    this.logger.log('✅ All required environment variables present');
    this.logServiceEndpoints();
  }

  /**
   * Log configured service endpoints for debugging
   */
  private logServiceEndpoints() {
    this.logger.log('\n📡 Configured Service Endpoints:');
    this.logger.log(`  NLU (Mercury): ${this.config.get('NLU_URL_MERCURY')}`);
    this.logger.log(`  NLU (Jupiter): ${this.config.get('NLU_URL')}`);
    this.logger.log(`  NLU (Primary): ${this.config.get('NLU_PRIMARY_ENDPOINT')}`);
    this.logger.log(`  vLLM: ${this.config.get('VLLM_URL')}`);
    this.logger.log(`  Search API: ${this.config.get('SEARCH_API_URL')}`);
    // OpenSearch URL is optional now (only for admin operations)
    if (this.config.get('OPENSEARCH_URL')) {
      this.logger.log(`  OpenSearch: ${this.config.get('OPENSEARCH_URL')} (optional - admin only)`);
    }
    this.logger.log(`  Embedding: ${this.config.get('EMBEDDING_SERVICE_URL')}`);
    this.logger.log(`  ASR: ${this.config.get('ASR_SERVICE_URL')}`);
    this.logger.log(`  TTS: ${this.config.get('TTS_SERVICE_URL')}`);
    this.logger.log(`  Nerve: ${this.config.get('NERVE_SYSTEM_URL')}`);
    this.logger.log(`  Exotel: ${this.config.get('EXOTEL_SERVICE_URL')}`);
    this.logger.log(`  PHP Backend: ${this.config.get('PHP_BACKEND_URL')}`);
    this.logger.log(`  Training Server: ${this.config.get('TRAINING_SERVER_URL')}`);
    this.logger.log(`  WhatsApp: ${this.config.get('WHATSAPP_SERVICE_URL')}`);
  }

  /**
   * Mask sensitive values in logs
   */
  private maskSensitive(key: string, value: string): string {
    if (key === 'DATABASE_URL') {
      // Avoid logging credentials in connection strings
      // Example: postgresql://user:pass@host:5432/db -> postgresql://user:***@host:5432/db
      return value.replace(/:\/\/([^:@/]+):([^@/]+)@/i, '://$1:***@');
    }

    const sensitiveKeys = ['PASSWORD', 'SECRET', 'KEY', 'TOKEN', 'API_KEY'];
    
    if (sensitiveKeys.some(k => key.toUpperCase().includes(k))) {
      return '***REDACTED***';
    }
    
    return value;
  }
}
