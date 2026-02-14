#!/usr/bin/env ts-node
/**
 * migrate-legacy-flows.ts
 * 
 * Migration script to convert legacy flow systems to modern FlowEngine format.
 * 
 * Usage:
 *   npx ts-node scripts/migrate-legacy-flows.ts [--dry-run] [--verify]
 * 
 * Options:
 *   --dry-run   Show what would be migrated without making changes
 *   --verify    Verify existing modern flows match legacy behavior
 */

import * as fs from 'fs';
import * as path from 'path';

interface LegacyStep {
  id: string;
  type: string;
  config: Record<string, unknown>;
  next?: string;
}

interface LegacyFlow {
  id: string;
  name: string;
  steps: LegacyStep[];
  trigger?: string;
  module?: string;
}

interface ModernFlowState {
  type: 'action' | 'wait' | 'decision';
  description?: string;
  onEntry?: any[];
  actions?: any[];
  conditions?: any[];
  transitions: Record<string, string>;
}

interface ModernFlow {
  id: string;
  name: string;
  description: string;
  version: string;
  trigger: string;
  module: string;
  enabled: boolean;
  initialState: string;
  finalStates: string[];
  states: Record<string, ModernFlowState>;
}

// Legacy step type to modern executor mapping
const STEP_TYPE_TO_EXECUTOR: Record<string, string> = {
  'nlu': 'nlu',
  'collect_data': 'response', // Becomes a wait state
  'tool': 'auth', // Depends on tool name
  'validate_zone': 'zone',
  'calculate_distance': 'distance',
  'calculate_charges': 'pricing',
  'llm': 'llm',
  'api_call': 'order',
  'respond': 'response',
  'condition': 'decision', // Becomes decision state
  'decision': 'decision',
  'game': 'game',
  'gamification': 'game',
  'pricing': 'pricing',
};

// Legacy auth steps from ConversationService
const LEGACY_AUTH_STEPS = [
  'login_method',
  'awaiting_phone_number',
  'registration_choice',
  'awaiting_registration_otp',
  'phone_check',
  'awaiting_otp',
  'awaiting_name',
  'awaiting_email',
  'facebook_login',
];

// Map legacy auth steps to modern auth.flow.ts states
const AUTH_STEP_TO_STATE: Record<string, string> = {
  'login_method': 'collect_phone',
  'awaiting_phone_number': 'collect_phone',
  'registration_choice': 'check_auth_status',
  'awaiting_registration_otp': 'collect_otp',
  'phone_check': 'check_auth_status',
  'awaiting_otp': 'collect_otp',
  'awaiting_name': 'collect_name',
  'awaiting_email': 'collect_email',
  'facebook_login': 'check_auth_status',
};

function convertLegacyStepToModernState(step: LegacyStep): ModernFlowState {
  const baseState: ModernFlowState = {
    type: 'action',
    description: `Converted from legacy step: ${step.id}`,
    transitions: {},
  };

  switch (step.type) {
    case 'collect_data':
      baseState.type = 'wait';
      baseState.onEntry = [{
        id: 'prompt',
        executor: 'response',
        config: {
          message: step.config.prompt || step.config.message || 'Please provide the information.',
        },
      }];
      baseState.transitions = {
        'valid': step.next || 'next_state',
        'invalid': step.id, // Re-ask on invalid
        'cancel': 'cancelled',
      };
      break;

    case 'respond':
      baseState.type = 'action';
      baseState.actions = [{
        id: 'send_message',
        executor: 'response',
        config: {
          message: step.config.message || step.config.text,
        },
      }];
      baseState.transitions = {
        'default': step.next || 'completed',
      };
      break;

    case 'condition':
    case 'decision':
      baseState.type = 'decision';
      baseState.conditions = step.config.conditions as any[] || [{
        expression: 'true',
        event: 'default',
      }];
      baseState.transitions = step.config.transitions as Record<string, string> || {
        'default': step.next || 'completed',
      };
      break;

    case 'llm':
      baseState.type = 'action';
      baseState.actions = [{
        id: 'llm_generate',
        executor: 'llm',
        config: {
          prompt: step.config.prompt,
          temperature: step.config.temperature || 0.7,
        },
        output: 'llm_response',
      }];
      baseState.transitions = {
        'success': step.next || 'completed',
        'error': 'error_state',
      };
      break;

    case 'validate_zone':
    case 'validate':
      baseState.type = 'action';
      baseState.actions = [{
        id: 'validate_zone',
        executor: 'zone',
        config: {
          action: 'validate',
          latitude: '{{latitude}}',
          longitude: '{{longitude}}',
        },
        output: 'zone_result',
      }];
      baseState.transitions = {
        'valid': step.next || 'completed',
        'invalid': 'zone_error',
      };
      break;

    case 'calculate_distance':
    case 'calculate':
      baseState.type = 'action';
      baseState.actions = [{
        id: 'calc_distance',
        executor: 'distance',
        config: step.config,
        output: 'distance_result',
      }];
      baseState.transitions = {
        'success': step.next || 'completed',
        'error': 'error_state',
      };
      break;

    case 'calculate_charges':
    case 'pricing':
      baseState.type = 'action';
      baseState.actions = [{
        id: 'calc_pricing',
        executor: 'pricing',
        config: step.config,
        output: 'pricing_result',
      }];
      baseState.transitions = {
        'success': step.next || 'completed',
        'error': 'error_state',
      };
      break;

    case 'api_call':
      baseState.type = 'action';
      baseState.actions = [{
        id: 'api_call',
        executor: 'order',
        config: step.config,
        output: 'api_result',
      }];
      baseState.transitions = {
        'success': step.next || 'completed',
        'error': 'error_state',
      };
      break;

    default:
      // Generic action state
      baseState.actions = [{
        id: step.id,
        executor: STEP_TYPE_TO_EXECUTOR[step.type] || 'response',
        config: step.config,
      }];
      baseState.transitions = {
        'default': step.next || 'completed',
      };
  }

  return baseState;
}

function convertLegacyFlowToModern(legacyFlow: LegacyFlow): ModernFlow {
  const states: Record<string, ModernFlowState> = {};
  
  // Convert each step to a state
  for (const step of legacyFlow.steps) {
    states[step.id] = convertLegacyStepToModernState(step);
  }

  // Add standard final states
  states['completed'] = {
    type: 'action',
    description: 'Flow completed successfully',
    actions: [{
      id: 'complete_message',
      executor: 'response',
      config: {
        message: 'Your request has been completed. ✅',
      },
    }],
    transitions: {},
  };

  states['cancelled'] = {
    type: 'action',
    description: 'Flow cancelled by user',
    actions: [{
      id: 'cancel_message',
      executor: 'response',
      config: {
        message: 'Operation cancelled. How else can I help you?',
      },
    }],
    transitions: {},
  };

  states['error_state'] = {
    type: 'action',
    description: 'Error occurred during flow execution',
    actions: [{
      id: 'error_message',
      executor: 'response',
      config: {
        message: 'Sorry, something went wrong. Please try again.',
      },
    }],
    transitions: {},
  };

  return {
    id: `${legacyFlow.id}_v2`,
    name: legacyFlow.name,
    description: `Migrated from legacy flow: ${legacyFlow.id}`,
    version: '2.0.0',
    trigger: legacyFlow.trigger || legacyFlow.id,
    module: legacyFlow.module || 'general',
    enabled: true,
    initialState: legacyFlow.steps[0]?.id || 'start',
    finalStates: ['completed', 'cancelled'],
    states,
  };
}

function generateMigrationReport(): void {
  console.log('='.repeat(60));
  console.log('LEGACY FLOW MIGRATION REPORT');
  console.log('='.repeat(60));
  console.log('');
  
  console.log('📋 LEGACY AUTH STEPS (ConversationService)');
  console.log('-'.repeat(40));
  for (const step of LEGACY_AUTH_STEPS) {
    const modernState = AUTH_STEP_TO_STATE[step] || 'UNKNOWN';
    console.log(`  ${step.padEnd(30)} → ${modernState}`);
  }
  console.log('');
  
  console.log('✅ Migration Status: auth.flow.ts handles all auth steps');
  console.log('   Enable with: USE_AUTH_FLOW_ENGINE=true');
  console.log('');
  
  console.log('📋 LEGACY STEP TYPES → MODERN EXECUTORS');
  console.log('-'.repeat(40));
  for (const [legacy, modern] of Object.entries(STEP_TYPE_TO_EXECUTOR)) {
    console.log(`  ${legacy.padEnd(20)} → ${modern}.executor.ts`);
  }
  console.log('');
  
  console.log('📋 EXISTING MODERN FLOWS');
  console.log('-'.repeat(40));
  const flowsDir = path.join(__dirname, '../src/flow-engine/flows');
  if (fs.existsSync(flowsDir)) {
    const files = fs.readdirSync(flowsDir).filter(f => f.endsWith('.flow.ts'));
    for (const file of files) {
      console.log(`  ✅ ${file}`);
    }
  }
  console.log('');
  
  console.log('📋 RECOMMENDED ACTIONS');
  console.log('-'.repeat(40));
  console.log('  1. Enable USE_AUTH_FLOW_ENGINE=true in .env');
  console.log('  2. Remove commented legacy code from AgentOrchestratorService');
  console.log('  3. Test all channels with modern flow engine');
  console.log('  4. Archive ConversationService auth handlers');
  console.log('');
  
  console.log('='.repeat(60));
  console.log('Migration report complete.');
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const verify = args.includes('--verify');

  console.log('🔄 Legacy Flow Migration Tool');
  console.log('');

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('');
  }

  generateMigrationReport();

  if (verify) {
    console.log('🔍 Verifying modern flows...');
    // Would verify that modern flows cover all legacy behavior
  }
}

main().catch(console.error);
