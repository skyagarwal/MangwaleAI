import { Module, forwardRef } from '@nestjs/common';
import { FlowEngineService } from './flow-engine.service';
import { FlowContextService } from './flow-context.service';
import { StateMachineEngine } from './state-machine.engine';
import { ExecutorRegistryService } from './executor-registry.service';
// Type alias for cleaner imports
const ExecutorRegistry = ExecutorRegistryService;

// Executors
import { LlmExecutor } from './executors/llm.executor';
import { NluExecutor } from './executors/nlu.executor';
import { SearchExecutor } from './executors/search.executor';
import { AddressExecutor } from './executors/address.executor';
import { DistanceExecutor } from './executors/distance.executor';
import { ZoneExecutor } from './executors/zone.executor';
import { PricingExecutor } from './executors/pricing.executor';
import { OrderExecutor } from './executors/order.executor';
import { ResponseExecutor } from './executors/response.executor';
import { GameExecutor } from './executors/game.executor';
import { ParcelExecutor } from './executors/parcel.executor';
import { PreferenceExecutor } from './executors/preference.executor';
import { AuthExecutor } from './executors/auth.executor';
// Game executors disabled - Prisma schema mismatch
// import { GameScorerExecutor } from './executors/game-scorer.executor';
// import { RewardPointsExecutor } from './executors/reward-points.executor';
import { FlowInitializerService } from './services/flow-initializer.service';
import { YamlFlowLoaderService } from './services/yaml-flow-loader.service';
import { FlowVersionManagerService } from './services/flow-version-manager.service';
import { FlowBuilderController } from './controllers/flow-builder.controller';
import { FlowsController } from './flows.controller';

// Dependencies
import { DatabaseModule } from '../database/database.module';
import { SessionModule } from '../session/session.module';
import { LlmModule } from '../llm/llm.module';
import { NluModule } from '../nlu/nlu.module';
import { SearchModule } from '../search/search.module';
import { PhpIntegrationModule } from '../php-integration/php-integration.module';
import { AgentsModule } from '../agents/agents.module';
import { GamificationModule } from '../gamification/gamification.module';
import { PersonalizationModule } from '../personalization/personalization.module';

@Module({
  imports: [
    DatabaseModule,
    SessionModule,
    LlmModule,
    NluModule,
    SearchModule,
    PhpIntegrationModule,
    GamificationModule,
    PersonalizationModule,
    forwardRef(() => AgentsModule), // Use forwardRef to avoid circular dependency
  ],
  controllers: [FlowBuilderController, FlowsController],
  providers: [
    // Core services
    FlowEngineService,
    FlowContextService,
    StateMachineEngine,
    ExecutorRegistryService,
    FlowInitializerService, // Auto-load flows on startup
    YamlFlowLoaderService, // Load flows from YAML files
    FlowVersionManagerService, // A/B testing and version control

    // Executors
    LlmExecutor,
    NluExecutor,
    SearchExecutor,
    AddressExecutor,
    DistanceExecutor,
    ZoneExecutor,
    PricingExecutor,
    OrderExecutor,
    ResponseExecutor,
    GameExecutor,
    ParcelExecutor,
    PreferenceExecutor,
    AuthExecutor,
    // GameScorerExecutor, // Disabled - Prisma schema mismatch
    // RewardPointsExecutor, // Disabled - Prisma schema mismatch
  ],
  exports: [
    FlowEngineService,
    FlowContextService,
    ExecutorRegistryService,
    YamlFlowLoaderService,
    FlowVersionManagerService,
  ],
})
export class FlowEngineModule {
  constructor(
    private readonly executorRegistry: ExecutorRegistryService,
    // Inject all executors
    private readonly llmExecutor: LlmExecutor,
    private readonly nluExecutor: NluExecutor,
    private readonly searchExecutor: SearchExecutor,
    private readonly addressExecutor: AddressExecutor,
    private readonly distanceExecutor: DistanceExecutor,
    private readonly zoneExecutor: ZoneExecutor,
    private readonly pricingExecutor: PricingExecutor,
    private readonly orderExecutor: OrderExecutor,
    private readonly responseExecutor: ResponseExecutor,
    private readonly gameExecutor: GameExecutor,
    private readonly parcelExecutor: ParcelExecutor,
    private readonly preferenceExecutor: PreferenceExecutor,
    private readonly authExecutor: AuthExecutor,
    // private readonly gameScorerExecutor: GameScorerExecutor, // Disabled
    // private readonly rewardPointsExecutor: RewardPointsExecutor, // Disabled
  ) {
    // Register all executors
    this.executorRegistry.register(llmExecutor);
    this.executorRegistry.register(nluExecutor);
    this.executorRegistry.register(searchExecutor);
    this.executorRegistry.register(addressExecutor);
    this.executorRegistry.register(distanceExecutor);
    this.executorRegistry.register(zoneExecutor);
    this.executorRegistry.register(pricingExecutor);
    this.executorRegistry.register(orderExecutor);
    this.executorRegistry.register(responseExecutor);
    this.executorRegistry.register(gameExecutor);
    this.executorRegistry.register(parcelExecutor);
    this.executorRegistry.register(preferenceExecutor);
    this.executorRegistry.register(authExecutor);
    // this.executorRegistry.register(gameScorerExecutor); // Disabled
    // this.executorRegistry.register(rewardPointsExecutor); // Disabled
  }
}
