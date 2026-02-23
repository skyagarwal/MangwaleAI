import { Test, TestingModule } from '@nestjs/testing';
import { QueryParserService } from './query-parser.service';

describe('QueryParserService - Unit Tests', () => {
  let service: QueryParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QueryParserService],
    }).compile();

    service = module.get<QueryParserService>(QueryParserService);
  });

  describe('Intent Detection', () => {
    describe('"item from store" Pattern', () => {
      it('should parse "butter chicken from Inayat Cafe"', () => {
        const result = service.parse('butter chicken from Inayat Cafe');
        expect(result).toEqual({
          intent: 'specific_item_specific_store',
          raw: 'butter chicken from Inayat Cafe',
          itemQuery: 'butter chicken',
          storeQuery: 'Inayat Cafe',
        });
      });

      it('should parse "paneer tikka from Paradise Restaurant"', () => {
        const result = service.parse('paneer tikka from Paradise Restaurant');
        expect(result.intent).toBe('specific_item_specific_store');
        expect(result.itemQuery).toBe('paneer tikka');
        expect(result.storeQuery).toBe('Paradise Restaurant');
      });

      it('should handle multi-word items and stores', () => {
        const result = service.parse('tandoori chicken tikka from Taj Mahal Restaurant');
        expect(result.intent).toBe('specific_item_specific_store');
        expect(result.itemQuery).toBe('tandoori chicken tikka');
        expect(result.storeQuery).toBe('Taj Mahal Restaurant');
      });
    });

    describe('"item at store" Pattern', () => {
      it('should parse "pizza at Dominos"', () => {
        const result = service.parse('pizza at Dominos');
        expect(result).toEqual({
          intent: 'specific_item_specific_store',
          raw: 'pizza at Dominos',
          itemQuery: 'pizza',
          storeQuery: 'Dominos',
        });
      });

      it('should parse "biryani at Paradise"', () => {
        const result = service.parse('biryani at Paradise');
        expect(result.intent).toBe('specific_item_specific_store');
        expect(result.itemQuery).toBe('biryani');
      });
    });

    describe('"item in store" Pattern', () => {
      it('should parse "samosa in Inayat"', () => {
        const result = service.parse('samosa in Inayat');
        expect(result.intent).toBe('specific_item_specific_store');
        expect(result.itemQuery).toBe('samosa');
        expect(result.storeQuery).toBe('Inayat');
      });
    });

    describe('"item from store restaurant/cafe" Pattern', () => {
      it('should parse "chicken tikka from Inayat restaurant"', () => {
        const result = service.parse('chicken tikka from Inayat restaurant');
        expect(result.intent).toBe('specific_item_specific_store');
        expect(result.itemQuery).toBe('chicken tikka');
        expect(result.storeQuery).toBe('Inayat');
      });

      it('should parse "coffee from Cafe Coffee Day cafe"', () => {
        const result = service.parse('coffee from Cafe Coffee Day cafe');
        expect(result.intent).toBe('specific_item_specific_store');
      });
    });

    describe('Store-First Intent', () => {
      it('should detect "Inayat Cafe" as store-first', () => {
        const result = service.parse('Inayat Cafe');
        expect(result.intent).toBe('store_first');
        expect(result.storeQuery).toBe('Inayat Cafe');
      });

      it('should detect "Paradise restaurant" as store-first', () => {
        const result = service.parse('Paradise restaurant');
        expect(result.intent).toBe('store_first');
      });

      it('should detect "Taj hotel menu" as store-first', () => {
        const result = service.parse('Taj hotel menu');
        expect(result.intent).toBe('store_first');
      });

      it('should detect short queries as store-first', () => {
        const result = service.parse('Inayat');
        expect(result.intent).toBe('store_first');
      });

      it('should detect "what does Inayat have" style queries', () => {
        const result = service.parse('Taj menu');
        expect(result.intent).toBe('store_first');
      });
    });

    describe('Generic Intent', () => {
      it('should treat "butter chicken" as generic', () => {
        const result = service.parse('butter chicken');
        expect(result.intent).toBe('generic');
        expect(result.raw).toBe('butter chicken');
      });

      it('should treat long complex queries as generic', () => {
        const result = service.parse('I want spicy butter chicken with extra cheese and paneer');
        expect(result.intent).toBe('generic');
      });

      it('should treat queries with multiple "from" as generic', () => {
        const result = service.parse('get butter from chicken from paneer');
        expect(result.intent).toBe('generic');
      });

      it('should treat "pizza and paneer" as generic', () => {
        const result = service.parse('pizza and paneer');
        expect(result.intent).toBe('generic');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      const result = service.parse('');
      expect(result.intent).toBe('generic');
      expect(result.raw).toBe('');
    });

    it('should handle null/undefined as empty', () => {
      const result = service.parse(null as any);
      expect(result.intent).toBe('generic');
    });

    it('should handle whitespace-only input', () => {
      const result = service.parse('   ');
      expect(result.intent).toBe('generic');
    });

    it('should handle special characters', () => {
      const result = service.parse('butter chicken from Inayat & Co.');
      expect(result.intent).toBe('specific_item_specific_store');
    });

    it('should handle unicode characters', () => {
      const result = service.parse('चिकन from इनायत');
      expect(result.intent).toBe('specific_item_specific_store');
    });

    it('should handle accented characters', () => {
      const result = service.parse('café from René\'s café');
      expect(result.intent).toBe('specific_item_specific_store');
    });
  });

  describe('Case Insensitivity', () => {
    it('should be case-insensitive for patterns', () => {
      const lower = service.parse('butter chicken from inayat');
      const upper = service.parse('BUTTER CHICKEN FROM INAYAT');
      const mixed = service.parse('Butter Chicken From Inayat');

      expect(lower.intent).toBe(upper.intent);
      expect(lower.intent).toBe(mixed.intent);
      expect(lower.intent).toBe('specific_item_specific_store');
    });

    it('should be case-insensitive for keywords', () => {
      const lower = service.parse('pizza at dominos');
      const upper = service.parse('PIZZA AT DOMINOS');

      expect(lower.intent).toBe(upper.intent);
      expect(lower.intent).toBe('specific_item_specific_store');
    });

    it('should preserve original case in output', () => {
      const result = service.parse('Butter Chicken from Inayat Cafe');
      expect(result.itemQuery).toBe('Butter Chicken');
      expect(result.storeQuery).toBe('Inayat Cafe');
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle pattern at the very end', () => {
      const result = service.parse('something from Inayat');
      expect(result.intent).toBe('specific_item_specific_store');
    });

    it('should handle pattern at the very start', () => {
      const result = service.parse('from Inayat pizza');
      expect(result.intent).toBe('specific_item_specific_store');
    });

    it('should match first occurrence of pattern', () => {
      const result = service.parse('chicken from Inayat from Paradise');
      expect(result.itemQuery).toBe('chicken');
      expect(result.storeQuery).toBe('Inayat from Paradise');
    });

    it('should handle very long store names', () => {
      const longStore = 'A'.repeat(200);
      const result = service.parse(`pizza from ${longStore}`);
      expect(result.intent).toBe('specific_item_specific_store');
      expect(result.storeQuery).toBe(longStore);
    });

    it('should handle very long item names', () => {
      const longItem = 'super special '.repeat(20);
      const result = service.parse(`${longItem} from Inayat`);
      expect(result.intent).toBe('specific_item_specific_store');
    });
  });

  describe('Real-World Examples', () => {
    const testCases = [
      {
        input: 'butter chicken from Inayat Cafe',
        intent: 'specific_item_specific_store',
        item: 'butter chicken',
        store: 'Inayat Cafe',
      },
      {
        input: 'biryani at Paradise Restaurant',
        intent: 'specific_item_specific_store',
        item: 'biryani',
        store: 'Paradise Restaurant',
      },
      {
        input: 'samosa in Taj',
        intent: 'specific_item_specific_store',
        item: 'samosa',
        store: 'Taj',
      },
      {
        input: 'Inayat Cafe',
        intent: 'store_first',
      },
      {
        input: 'What does Paradise have',
        intent: 'generic',
      },
      {
        input: 'best butter chicken near me',
        intent: 'generic',
      },
      {
        input: 'dominos pizza',
        intent: 'generic',
      },
      {
        input: 'restaurant near me',
        intent: 'generic',
      },
    ];

    testCases.forEach(({ input, intent, item, store }) => {
      it(`should handle "${input}"`, () => {
        const result = service.parse(input);
        expect(result.intent).toBe(intent);
        if (item) expect(result.itemQuery).toBe(item);
        if (store) expect(result.storeQuery).toBe(store);
      });
    });
  });

  describe('Performance', () => {
    it('should parse 1000 queries in <500ms', () => {
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        service.parse('butter chicken from Inayat Cafe');
      }
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500);
    });

    it('should handle concurrent parsing', () => {
      const queries = Array(100).fill('butter chicken from Inayat');
      const results = queries.map(q => service.parse(q));
      expect(results).toHaveLength(100);
      expect(results.every(r => r.intent === 'specific_item_specific_store')).toBe(true);
    });
  });
});
