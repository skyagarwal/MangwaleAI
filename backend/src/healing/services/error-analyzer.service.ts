/**
 * Error Analyzer Service
 * 
 * Uses LLM to analyze errors and suggest repairs.
 * Leverages vLLM for fast inference.
 */

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { LogEntry } from './log-collector.service';

export interface ErrorAnalysis {
  errorId: string;
  category: 'code_bug' | 'config_issue' | 'data_issue' | 'nlu_training' | 'flow_logic' | 'infrastructure' | 'unknown';
  severity: 'critical' | 'high' | 'medium' | 'low';
  rootCause: string;
  suggestedFix: string;
  autoFixable: boolean;
  codeChange?: {
    file: string;
    oldCode: string;
    newCode: string;
    explanation: string;
  };
  configChange?: {
    key: string;
    oldValue: unknown;
    newValue: unknown;
  };
  nluTraining?: {
    text: string;
    suggestedIntent: string;
    confidence: number;
  };
  confidence: number;
}

@Injectable()
export class ErrorAnalyzerService {
  private readonly logger = new Logger(ErrorAnalyzerService.name);
  private readonly vllmEndpoint: string;
  private readonly modelName: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    // Use VLLM_BASE_URL (consistent with other services) with fallback to VLLM_ENDPOINT
    const baseUrl =
      this.config.get('VLLM_BASE_URL') ||
      this.config.get('VLLM_ENDPOINT', 'http://localhost:8002');
    this.vllmEndpoint = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
    this.modelName = this.config.get('VLLM_MODEL', 'Qwen/Qwen2.5-7B-Instruct-AWQ');
    this.logger.log(`ErrorAnalyzer using vLLM at: ${this.vllmEndpoint}`);
  }

  /**
   * Analyze a batch of errors using LLM
   */
  async analyzeErrors(errors: LogEntry[]): Promise<ErrorAnalysis[]> {
    const analyses: ErrorAnalysis[] = [];

    for (const error of errors) {
      try {
        const analysis = await this.analyzeError(error);
        if (analysis) {
          analyses.push(analysis);
        }
      } catch (err) {
        this.logger.error(`Failed to analyze error: ${error.message}`, err);
      }
    }

    return analyses;
  }

  /**
   * Analyze a single error
   */
  private async analyzeError(error: LogEntry): Promise<ErrorAnalysis | null> {
    const prompt = this.buildAnalysisPrompt(error);

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.vllmEndpoint}/chat/completions`, {
          model: this.modelName,
          messages: [
            {
              role: 'system',
              content: `You are an expert software engineer specialized in debugging and fixing errors in a Node.js/NestJS backend, Next.js frontend, and Python NLU service.

Your job is to analyze errors and provide actionable fixes. Be specific and provide exact code changes when possible.

For NLU errors (low confidence, wrong intent), suggest training data additions.
For flow errors, suggest state machine fixes.
For code errors, suggest exact code patches.

Respond in JSON format with this structure:
{
  "category": "code_bug|config_issue|data_issue|nlu_training|flow_logic|infrastructure|unknown",
  "severity": "critical|high|medium|low",
  "rootCause": "Brief explanation of the root cause",
  "suggestedFix": "Human-readable fix description",
  "autoFixable": true/false,
  "codeChange": { "file": "path", "oldCode": "...", "newCode": "..." },
  "configChange": { "key": "...", "oldValue": ..., "newValue": ... },
  "nluTraining": { "text": "...", "suggestedIntent": "...", "confidence": 0.9 },
  "confidence": 0.0-1.0
}`,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      );

      const content = response.data.choices[0]?.message?.content;
      if (!content) return null;

      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const analysis = JSON.parse(jsonMatch[0]);
      
      return {
        errorId: error.id || `${error.source}-${error.timestamp.getTime()}`,
        category: analysis.category || 'unknown',
        severity: analysis.severity || 'medium',
        rootCause: analysis.rootCause || 'Unknown',
        suggestedFix: analysis.suggestedFix || 'No fix suggested',
        autoFixable: analysis.autoFixable || false,
        codeChange: analysis.codeChange,
        configChange: analysis.configChange,
        nluTraining: analysis.nluTraining,
        confidence: analysis.confidence || 0.5,
      };
    } catch (err) {
      this.logger.error('LLM analysis failed', err);
      return null;
    }
  }

  /**
   * Build prompt for error analysis
   */
  private buildAnalysisPrompt(error: LogEntry): string {
    let prompt = `Analyze this ${error.source} error:\n\n`;
    prompt += `ERROR: ${error.message}\n`;
    
    if (error.stack) {
      prompt += `\nSTACK TRACE:\n${error.stack}\n`;
    }
    
    if (error.context) {
      prompt += `\nCONTEXT:\n${JSON.stringify(error.context, null, 2)}\n`;
    }

    prompt += `\nTIMESTAMP: ${error.timestamp.toISOString()}\n`;
    prompt += `\nProvide your analysis in JSON format.`;

    return prompt;
  }

  /**
   * Analyze NLU-specific errors
   */
  async analyzeNluError(
    text: string,
    predictedIntent: string,
    confidence: number,
    actualIntent?: string,
  ): Promise<{
    suggestedIntent: string;
    trainingExamples: string[];
    confidence: number;
  } | null> {
    const prompt = `A user said: "${text}"

The NLU model predicted intent: "${predictedIntent}" with confidence ${confidence.toFixed(2)}
${actualIntent ? `The correct intent should be: "${actualIntent}"` : ''}

Analyze this and provide:
1. What intent should this be classified as?
2. 5 similar training examples that could help improve classification
3. Your confidence in this analysis

Respond in JSON:
{
  "suggestedIntent": "intent_name",
  "trainingExamples": ["example 1", "example 2", ...],
  "confidence": 0.0-1.0
}`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.vllmEndpoint}/chat/completions`, {
          model: this.modelName,
          messages: [
            {
              role: 'system',
              content: 'You are an NLU training expert. Analyze misclassified intents and suggest corrections.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
      );

      const content = response.data.choices[0]?.message?.content;
      if (!content) return null;

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      return JSON.parse(jsonMatch[0]);
    } catch (err) {
      this.logger.error('NLU analysis failed', err);
      return null;
    }
  }
}
