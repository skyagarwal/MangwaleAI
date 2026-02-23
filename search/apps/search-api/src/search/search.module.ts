import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { StatsController } from './stats.controller';
import { MetricsController } from './metrics.controller';
import { SearchService } from './search.service';
import { ModuleService } from './module.service';
import { AnalyticsService } from '../modules/analytics.service';
import { RankingService } from '../modules/ranking.service';
import { ExperimentsService } from '../modules/experiments.service';
import { SearchPersonalizationService } from '../modules/personalization.service';
import { EmbeddingService } from '../modules/embedding.service';
import { SearchCacheService } from '../modules/cache.service';
import { ZoneService } from '../modules/zone.service';
import { ImageService } from '../modules/image.service';
import { QueryParserService } from './query-parser.service';
// Week 3: Query Understanding
import { QueryUnderstandingService } from '../modules/query-understanding.service';
import { SpellCheckerService } from '../modules/spell-checker.service';
import { SynonymService } from '../modules/synonym.service';
import { IntentClassifierService } from '../modules/intent-classifier.service';
import { TransliterationService } from '../modules/transliteration.service';
// Week 4: Faceted Search
import { FacetsService } from '../modules/facets.service';
// Week 5: Conversational Search
import { ConversationalSearchService } from '../modules/conversational-search.service';
// Week 6: Visual Search
import { VisualSearchService } from '../modules/visual-search.service';
// Week 7: Multimodal
import { MultimodalSearchService } from '../modules/multimodal-search.service';

@Module({
  controllers: [SearchController, StatsController, MetricsController],
  providers: [
    SearchService, 
    ModuleService, 
    AnalyticsService, 
    RankingService, 
    ExperimentsService, 
    SearchPersonalizationService,
    EmbeddingService, 
    SearchCacheService, 
    ZoneService, 
    ImageService, 
    QueryParserService,
    // Week 3
    QueryUnderstandingService,
    SpellCheckerService,
    SynonymService,
    IntentClassifierService,
    TransliterationService,
    // Week 4
    FacetsService,
    // Week 5
    ConversationalSearchService,
    // Week 6
    VisualSearchService,
    // Week 7
    MultimodalSearchService
  ],
  exports: [ImageService, SearchService],
})
export class SearchModule {}
