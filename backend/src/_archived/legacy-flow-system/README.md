# 📦 Archived Legacy Flow System

**Archive Date**: December 28, 2025  
**Reason**: Architecture refactoring to unified flow engine

## Contents

This directory contains archived code from the legacy flow system that has been replaced by the modern FlowEngineService.

### Archived Components

1. **legacy-flow-execution.ts** - The legacy `executeFlow()` and `executeFlowStep()` methods from AgentOrchestratorService
2. **legacy-flow-lookup.ts** - The `findFlowForIntent()` method with keyword-based flow matching
3. **legacy-conversation-steps.ts** - Legacy switch-case auth steps from ConversationService

### Why Archived (Not Deleted)

- Rollback capability during migration
- Reference for understanding legacy behavior
- Migration mapping documentation

### Migration Status

| Component | Legacy | Modern Replacement | Status |
|-----------|--------|-------------------|--------|
| Flow Execution | `executeFlow()` | `FlowEngineService.startFlow()` | ✅ Complete |
| Flow Lookup | `findFlowForIntent()` | `FlowEngineService.findFlowByIntent()` | ✅ Complete |
| Auth Steps | switch-case | `auth.flow.ts` | ⏳ In Progress |
| Parcel Flow | hardcoded | `parcel-delivery.flow.ts` | ✅ Complete |

### Restoration Instructions

If rollback is needed:

```bash
# 1. Copy archived code back
cp src/_archived/legacy-flow-system/legacy-flow-execution.ts src/agents/services/

# 2. Re-enable in agent-orchestrator.service.ts
# Uncomment lines 807-810

# 3. Test all channels
npm run test:e2e
```

### Contact

For questions about this migration, see:
- ARCHITECTURE_REFACTOR_TODO.md
- DEEP_ARCHITECTURE_ANALYSIS.md
