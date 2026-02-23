import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface Facet {
  field: string;
  label: string;
  type: 'range' | 'terms' | 'boolean';
  values: FacetValue[];
}

export interface FacetValue {
  value: string | number;
  label: string;
  count: number;
  selected: boolean;
}

export interface FacetConfiguration {
  priceRanges: number[];
  ratingSteps: number;
  maxCategories: number;
  maxStores: number;
}

@Injectable()
export class FacetsService {
  private readonly logger = new Logger(FacetsService.name);
  private readonly enabled: boolean;

  private readonly defaultConfig: FacetConfiguration = {
    priceRanges: [0, 100, 200, 500, 1000, 2000],
    ratingSteps: 1,
    maxCategories: 10,
    maxStores: 15
  };

  constructor(private readonly config: ConfigService) {
    this.enabled = config.get<string>('ENABLE_FACETS') !== 'false';
  }

  /**
   * Generate dynamic facets from search results
   */
  generateFacets(
    results: any[],
    aggregations: any,
    currentFilters: Record<string, any> = {},
    moduleId: number = 4
  ): Facet[] {
    if (!this.enabled || results.length === 0) {
      return [];
    }

    const facets: Facet[] = [];

    // Price Range Facet
    facets.push(this.generatePriceFacet(aggregations, currentFilters));

    // Rating Facet
    facets.push(this.generateRatingFacet(aggregations, currentFilters));

    // Dietary Facet (for food module)
    if (moduleId === 4) {
      facets.push(this.generateDietaryFacet(aggregations, currentFilters));
    }

    // Category Facet
    facets.push(this.generateCategoryFacet(aggregations, currentFilters));

    // Store Facet
    facets.push(this.generateStoreFacet(aggregations, currentFilters));

    // Availability Facet
    facets.push(this.generateAvailabilityFacet(aggregations, currentFilters));

    return facets.filter(f => f.values.length > 0);
  }

  private generatePriceFacet(aggs: any, filters: Record<string, any>): Facet {
    const priceAgg = aggs?.price_ranges?.buckets || [];
    const ranges = this.defaultConfig.priceRanges;
    
    const values: FacetValue[] = [];
    for (let i = 0; i < ranges.length - 1; i++) {
      const min = ranges[i];
      const max = ranges[i + 1];
      const bucket = priceAgg.find((b: any) => b.key === `${min}-${max}`);
      const count = bucket?.doc_count || 0;

      if (count > 0) {
        values.push({
          value: `${min}-${max}`,
          label: `₹${min} - ₹${max}`,
          count,
          selected: filters.price_min === min && filters.price_max === max
        });
      }
    }

    // Add "Above X" range
    const lastRange = ranges[ranges.length - 1];
    const aboveBucket = priceAgg.find((b: any) => b.key === `${lastRange}+`);
    if (aboveBucket?.doc_count > 0) {
      values.push({
        value: `${lastRange}+`,
        label: `Above ₹${lastRange}`,
        count: aboveBucket.doc_count,
        selected: filters.price_min >= lastRange
      });
    }

    return {
      field: 'price',
      label: 'Price Range',
      type: 'range',
      values
    };
  }

  private generateRatingFacet(aggs: any, filters: Record<string, any>): Facet {
    const ratingAgg = aggs?.ratings?.buckets || [];
    
    const values: FacetValue[] = [5, 4, 3, 2].map(rating => {
      const bucket = ratingAgg.find((b: any) => Math.floor(b.key) >= rating);
      const count = bucket?.doc_count || 0;

      return {
        value: rating,
        label: `${rating}★ & above`,
        count,
        selected: filters.rating_min === rating
      };
    }).filter(v => v.count > 0);

    return {
      field: 'rating',
      label: 'Customer Rating',
      type: 'terms',
      values
    };
  }

  private generateDietaryFacet(aggs: any, filters: Record<string, any>): Facet {
    const vegAgg = aggs?.veg_filter?.buckets || [];
    
    const values: FacetValue[] = [
      {
        value: '1',
        label: '🟢 Vegetarian',
        count: vegAgg.find((b: any) => b.key === 1 || b.key === '1')?.doc_count || 0,
        selected: filters.veg === '1'
      },
      {
        value: '0',
        label: '🔴 Non-Vegetarian',
        count: vegAgg.find((b: any) => b.key === 0 || b.key === '0')?.doc_count || 0,
        selected: filters.veg === '0'
      }
    ].filter(v => v.count > 0);

    return {
      field: 'veg',
      label: 'Dietary Preference',
      type: 'boolean',
      values
    };
  }

  private generateCategoryFacet(aggs: any, filters: Record<string, any>): Facet {
    const categoryAgg = aggs?.categories?.buckets || [];
    
    const values: FacetValue[] = categoryAgg
      .slice(0, this.defaultConfig.maxCategories)
      .map((bucket: any) => ({
        value: bucket.key,
        label: bucket.key_as_string || bucket.key,
        count: bucket.doc_count,
        selected: filters.category_id === bucket.key
      }));

    return {
      field: 'category_id',
      label: 'Category',
      type: 'terms',
      values
    };
  }

  private generateStoreFacet(aggs: any, filters: Record<string, any>): Facet {
    const storeAgg = aggs?.stores?.buckets || [];
    
    const values: FacetValue[] = storeAgg
      .slice(0, this.defaultConfig.maxStores)
      .map((bucket: any) => ({
        value: bucket.key,
        label: bucket.key_as_string || bucket.key,
        count: bucket.doc_count,
        selected: filters.store_id === bucket.key
      }));

    return {
      field: 'store_id',
      label: 'Store',
      type: 'terms',
      values
    };
  }

  private generateAvailabilityFacet(aggs: any, filters: Record<string, any>): Facet {
    const availableCount = aggs?.available_now?.doc_count || 0;
    
    const values: FacetValue[] = availableCount > 0 ? [{
      value: 'true',
      label: 'Available Now',
      count: availableCount,
      selected: filters.available === 'true'
    }] : [];

    return {
      field: 'available',
      label: 'Availability',
      type: 'boolean',
      values
    };
  }

  /**
   * Build OpenSearch aggregations query
   */
  buildAggregationsQuery(moduleId: number = 4): Record<string, any> {
    const ranges = this.defaultConfig.priceRanges;
    const priceRanges = [];
    
    for (let i = 0; i < ranges.length - 1; i++) {
      priceRanges.push({
        key: `${ranges[i]}-${ranges[i + 1]}`,
        from: ranges[i],
        to: ranges[i + 1]
      });
    }
    priceRanges.push({
      key: `${ranges[ranges.length - 1]}+`,
      from: ranges[ranges.length - 1]
    });

    return {
      price_ranges: {
        range: {
          field: 'price',
          ranges: priceRanges
        }
      },
      ratings: {
        histogram: {
          field: 'rating',
          interval: this.defaultConfig.ratingSteps,
          min_doc_count: 1
        }
      },
      ...(moduleId === 4 ? {
        veg_filter: {
          terms: {
            field: 'veg',
            size: 2
          }
        }
      } : {}),
      categories: {
        terms: {
          field: 'category_id',
          size: this.defaultConfig.maxCategories
        }
      },
      stores: {
        terms: {
          field: 'store_id',
          size: this.defaultConfig.maxStores
        }
      },
      available_now: {
        filter: {
          term: { is_available: true }
        }
      }
    };
  }

  /**
   * Parse user-selected facets into filters
   */
  parseFacetFilters(facetParams: Record<string, any>): Record<string, any> {
    const filters: Record<string, any> = {};

    // Parse price range
    if (facetParams.price) {
      const match = facetParams.price.match(/^(\d+)-(\d+)$/);
      if (match) {
        filters.price_min = parseInt(match[1]);
        filters.price_max = parseInt(match[2]);
      } else if (facetParams.price.endsWith('+')) {
        filters.price_min = parseInt(facetParams.price);
      }
    }

    // Parse rating
    if (facetParams.rating) {
      filters.rating_min = parseInt(facetParams.rating);
    }

    // Parse dietary
    if (facetParams.veg) {
      filters.veg = facetParams.veg;
    }

    // Parse category
    if (facetParams.category_id) {
      filters.category_id = parseInt(facetParams.category_id);
    }

    // Parse store
    if (facetParams.store_id) {
      filters.store_id = parseInt(facetParams.store_id);
    }

    // Parse availability
    if (facetParams.available === 'true') {
      filters.is_available = true;
    }

    return filters;
  }
}
