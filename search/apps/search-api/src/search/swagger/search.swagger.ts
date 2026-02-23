/**
 * Swagger DTOs for Module-Aware Search API
 * Simplified version - can be expanded as needed
 */
export class SearchQueryDto {
  q?: string;
  module_id?: number;
  module_ids?: string;
  module_type?: string;
  category_id?: number;
  lat?: number;
  lon?: number;
  zone_id?: number;
  semantic?: boolean;
  veg?: boolean;
  price_min?: number;
  price_max?: number;
  rating_min?: number;
  page?: number;
  size?: number;
  sort?: string;
}
