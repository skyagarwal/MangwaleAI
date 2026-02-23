import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SynonymGroup {
  canonical: string;
  synonyms: string[];
}

@Injectable()
export class SynonymService {
  private readonly logger = new Logger(SynonymService.name);
  private readonly enabled: boolean;
  private readonly synonymMap: Map<string, string>; // word -> canonical form
  private readonly expansionMap: Map<string, string[]>; // canonical -> all forms

  constructor(private readonly config: ConfigService) {
    this.enabled = config.get<string>('ENABLE_SYNONYMS') !== 'false';
    this.synonymMap = new Map();
    this.expansionMap = new Map();
    this.initializeSynonyms();
  }

  private initializeSynonyms() {
    const synonymGroups: SynonymGroup[] = [
      // ===== PROTEINS & MEATS =====
      {
        canonical: 'chicken',
        synonyms: ['murgi', 'murga', 'kukad', 'kombdi', 'murg', 'kukkar', 'chiken', 'chickan']
      },
      {
        canonical: 'mutton',
        synonyms: ['bakra', 'bakri', 'gosht', 'meat', 'lamb', 'goat', 'muttonn', 'khasi']
      },
      {
        canonical: 'egg',
        synonyms: ['anda', 'aanda', 'andaa', 'ande', 'eggs', 'omelette', 'omelet']
      },
      {
        canonical: 'fish',
        synonyms: ['machli', 'machhi', 'machi', 'macchi', 'bangda', 'pomfret', 'surmai', 'rawas']
      },
      {
        canonical: 'prawn',
        synonyms: ['prawns', 'shrimp', 'kolambi', 'jhinga', 'jheenga']
      },
      {
        canonical: 'paneer',
        synonyms: ['cottage cheese', 'panner', 'panir', 'pneer']
      },

      // ===== VEGETABLES (Hindi/Marathi) =====
      {
        canonical: 'potato',
        synonyms: ['aloo', 'alu', 'batata', 'aaloo', 'poteto']
      },
      {
        canonical: 'cauliflower',
        synonyms: ['gobi', 'gobhi', 'phool gobi', 'fulgobi']
      },
      {
        canonical: 'spinach',
        synonyms: ['palak', 'paalak', 'saag']
      },
      {
        canonical: 'peas',
        synonyms: ['matar', 'mattar', 'vatana', 'green peas']
      },
      {
        canonical: 'capsicum',
        synonyms: ['shimla mirch', 'bell pepper', 'green pepper']
      },
      {
        canonical: 'brinjal',
        synonyms: ['baingan', 'baigan', 'eggplant', 'vangi', 'vangyache']
      },
      {
        canonical: 'okra',
        synonyms: ['bhindi', 'bhendi', 'lady finger', 'ladyfinger']
      },
      {
        canonical: 'onion',
        synonyms: ['pyaz', 'pyaaz', 'kanda']
      },
      {
        canonical: 'tomato',
        synonyms: ['tamatar', 'tamato']
      },
      {
        canonical: 'dal',
        synonyms: ['daal', 'dhal', 'lentil', 'lentils', 'tadka dal', 'tadka daal']
      },

      // ===== DAIRY =====
      {
        canonical: 'yogurt',
        synonyms: ['curd', 'dahi', 'dahee', 'doi', 'raita']
      },
      {
        canonical: 'butter',
        synonyms: ['makhan', 'makkhan', 'white butter', 'loni']
      },
      {
        canonical: 'ghee',
        synonyms: ['clarified butter', 'ghi', 'gheev', 'tup']
      },
      {
        canonical: 'milk',
        synonyms: ['doodh', 'dudh', 'dudhi']
      },
      {
        canonical: 'lassi',
        synonyms: ['chaas', 'buttermilk', 'mattha', 'taak']
      },

      // ===== MAHARASHTRIAN DISHES =====
      {
        canonical: 'vada pav',
        synonyms: ['vadapav', 'wada pav', 'wadapav', 'vada paav', 'batata vada']
      },
      {
        canonical: 'misal pav',
        synonyms: ['misalpav', 'misal', 'missal pav', 'missalpav']
      },
      {
        canonical: 'pav bhaji',
        synonyms: ['pavbhaji', 'paav bhaji', 'pav bhaaji']
      },
      {
        canonical: 'poha',
        synonyms: ['pohay', 'pohe', 'flattened rice', 'chivda', 'kanda poha']
      },
      {
        canonical: 'sabudana',
        synonyms: ['sabudana khichdi', 'sago', 'sabudana vada']
      },
      {
        canonical: 'puran poli',
        synonyms: ['puranpoli', 'vedmi', 'holige']
      },
      {
        canonical: 'thalipeeth',
        synonyms: ['thali peeth', 'thalipith']
      },
      {
        canonical: 'bhakri',
        synonyms: ['bhakari', 'jowar bhakri', 'bajra bhakri']
      },
      {
        canonical: 'usal',
        synonyms: ['ussal', 'matki usal', 'sprouted moth curry']
      },
      {
        canonical: 'zunka',
        synonyms: ['jhunka', 'zunka bhakar']
      },
      {
        canonical: 'pitla',
        synonyms: ['pithla', 'besan pitla']
      },
      {
        canonical: 'shrikhand',
        synonyms: ['shreekhand', 'amrakhand', 'shrikhand puri']
      },
      {
        canonical: 'modak',
        synonyms: ['modaka', 'ukdiche modak', 'fried modak']
      },

      // ===== NORTH INDIAN DISHES =====
      {
        canonical: 'biryani',
        synonyms: ['biriyani', 'briyani', 'biryaani', 'biriani', 'biriyanai']
      },
      {
        canonical: 'tikka',
        synonyms: ['tika', 'tikaa']
      },
      {
        canonical: 'kebab',
        synonyms: ['kabab', 'kebob', 'kabob', 'seekh', 'seekh kebab']
      },
      {
        canonical: 'curry',
        synonyms: ['gravy', 'sabzi', 'sabji', 'shorba', 'bhaji']
      },
      {
        canonical: 'masala',
        synonyms: ['spice', 'spices', 'masaala']
      },
      {
        canonical: 'butter chicken',
        synonyms: ['murgh makhani', 'makhani chicken', 'butter chiken']
      },
      {
        canonical: 'dal makhani',
        synonyms: ['daal makhani', 'dal makhni', 'maa ki dal']
      },
      {
        canonical: 'chole',
        synonyms: ['chhole', 'chana masala', 'chole bhature', 'chana', 'channay']
      },
      {
        canonical: 'rajma',
        synonyms: ['kidney beans', 'rajmah', 'razma']
      },
      {
        canonical: 'korma',
        synonyms: ['kurma', 'qorma']
      },
      {
        canonical: 'pulao',
        synonyms: ['pulav', 'pilaf', 'pilau', 'veg pulao']
      },
      {
        canonical: 'kheer',
        synonyms: ['payasam', 'khir', 'rice pudding']
      },
      {
        canonical: 'gulab jamun',
        synonyms: ['gulabjamun', 'gulab jaman', 'jamun']
      },
      {
        canonical: 'jalebi',
        synonyms: ['jalebee', 'jilabi', 'imarti']
      },

      // ===== BREADS =====
      {
        canonical: 'roti',
        synonyms: ['chapati', 'chapatti', 'phulka', 'rotti', 'fulka']
      },
      {
        canonical: 'naan',
        synonyms: ['nan', 'kulcha', 'taftan', 'butter naan', 'garlic naan']
      },
      {
        canonical: 'paratha',
        synonyms: ['parantha', 'parotha', 'porotta', 'aloo paratha']
      },
      {
        canonical: 'puri',
        synonyms: ['poori', 'pori']
      },

      // ===== SOUTH INDIAN =====
      {
        canonical: 'dosa',
        synonyms: ['dosai', 'dose', 'masala dosa', 'plain dosa', 'rava dosa']
      },
      {
        canonical: 'idli',
        synonyms: ['idly', 'idlee']
      },
      {
        canonical: 'sambar',
        synonyms: ['sambhar', 'sambaar']
      },
      {
        canonical: 'uttapam',
        synonyms: ['uttappam', 'utapam', 'oothappam']
      },
      {
        canonical: 'upma',
        synonyms: ['uppuma', 'uppma', 'rava upma']
      },
      {
        canonical: 'vada',
        synonyms: ['wada', 'medu vada', 'dal vada']
      },

      // ===== SNACKS & STREET FOOD =====
      {
        canonical: 'samosa',
        synonyms: ['samosay', 'samose']
      },
      {
        canonical: 'pakora',
        synonyms: ['pakoda', 'bhajiya', 'bhajia', 'onion pakora']
      },
      {
        canonical: 'chaat',
        synonyms: ['chat', 'sev puri', 'bhel', 'bhelpuri', 'pani puri', 'golgappa']
      },
      {
        canonical: 'pani puri',
        synonyms: ['panipuri', 'golgappa', 'gol gappa', 'puchka']
      },
      {
        canonical: 'dabeli',
        synonyms: ['dhabeli', 'kutchi dabeli']
      },
      {
        canonical: 'sandwich',
        synonyms: ['sandwhich', 'sandwitch', 'grilled sandwich']
      },
      {
        canonical: 'frankie',
        synonyms: ['franky', 'kathi roll', 'roll', 'wrap']
      },

      // ===== FAST FOOD =====
      {
        canonical: 'pizza',
        synonyms: ['piza', 'pizaa', 'piiza']
      },
      {
        canonical: 'burger',
        synonyms: ['burgar', 'berger', 'hamburgur']
      },
      {
        canonical: 'pasta',
        synonyms: ['psta', 'macaroni', 'spaghetti']
      },
      {
        canonical: 'noodles',
        synonyms: ['nodles', 'noodels', 'maggi', 'chowmein', 'hakka noodles']
      },
      {
        canonical: 'momos',
        synonyms: ['momo', 'dumpling', 'dumplings', 'dim sum']
      },
      {
        canonical: 'french fries',
        synonyms: ['fries', 'finger chips', 'chips']
      },

      // ===== RICE DISHES =====
      {
        canonical: 'fried rice',
        synonyms: ['friedrice', 'veg fried rice', 'schezwan rice']
      },
      {
        canonical: 'thali',
        synonyms: ['thaali', 'veg thali', 'non veg thali', 'special thali']
      },

      // ===== BEVERAGES =====
      {
        canonical: 'tea',
        synonyms: ['chai', 'chay', 'cutting chai', 'masala chai']
      },
      {
        canonical: 'coffee',
        synonyms: ['cofee', 'coffe', 'cappuccino', 'latte', 'filter coffee']
      },
      {
        canonical: 'juice',
        synonyms: ['ras', 'joos', 'fresh juice']
      },
      {
        canonical: 'milkshake',
        synonyms: ['shake', 'milk shake', 'thick shake']
      },
      {
        canonical: 'coca cola',
        synonyms: ['coke', 'coca-cola', 'cocacola', 'cola']
      },
      {
        canonical: 'pepsi',
        synonyms: ['pepsee']
      },
      {
        canonical: 'thums up',
        synonyms: ['thumbs up', 'thumsup', 'thumbsup']
      },
      {
        canonical: 'sprite',
        synonyms: ['sprit']
      },
      {
        canonical: 'limca',
        synonyms: ['lemka', 'lime soda']
      },

      // ===== DESSERTS & SWEETS =====
      {
        canonical: 'ice cream',
        synonyms: ['icecream', 'kulfi', 'sundae']
      },
      {
        canonical: 'cake',
        synonyms: ['pastry', 'brownie', 'cupcake']
      },
      {
        canonical: 'rasgulla',
        synonyms: ['rasagulla', 'rosogolla', 'rasgula']
      },
      {
        canonical: 'ladoo',
        synonyms: ['laddu', 'laddoo', 'ladu', 'motichoor ladoo', 'besan ladoo']
      },
      {
        canonical: 'barfi',
        synonyms: ['burfi', 'barfee', 'kaju barfi', 'kaju katli']
      },

      // ===== COOKING METHODS =====
      {
        canonical: 'fried',
        synonyms: ['deep fried', 'shallow fried', 'tala', 'fry']
      },
      {
        canonical: 'grilled',
        synonyms: ['tandoor', 'tandoori', 'bbq', 'barbecue', 'roasted']
      },
      {
        canonical: 'boiled',
        synonyms: ['steamed', 'ubla', 'boil']
      },

      // ===== DIETARY & PREFERENCES =====
      {
        canonical: 'vegetarian',
        synonyms: ['veg', 'veggie', 'shakahari', 'pure veg']
      },
      {
        canonical: 'non-vegetarian',
        synonyms: ['non veg', 'nonveg', 'non-veg', 'mansahari']
      },
      {
        canonical: 'spicy',
        synonyms: ['hot', 'teekha', 'tikha', 'mirchi', 'chili', 'chatpata']
      },
      {
        canonical: 'mild',
        synonyms: ['halka', 'less spicy', 'not spicy']
      },
      {
        canonical: 'sweet',
        synonyms: ['meetha', 'goad', 'mithai']
      },

      // ===== ECOMMERCE =====
      {
        canonical: 'tshirt',
        synonyms: ['t-shirt', 't shirt', 'tee', 'tees']
      },
      {
        canonical: 'mobile',
        synonyms: ['phone', 'smartphone', 'cellphone', 'cell phone']
      },
      {
        canonical: 'laptop',
        synonyms: ['notebook', 'computer']
      },
      {
        canonical: 'shoes',
        synonyms: ['footwear', 'sneakers', 'boots']
      }
    ];

    // Build bidirectional maps
    for (const group of synonymGroups) {
      const allForms = [group.canonical, ...group.synonyms];
      
      // Map each form to canonical
      for (const form of allForms) {
        this.synonymMap.set(form.toLowerCase(), group.canonical.toLowerCase());
      }
      
      // Store all forms for expansion
      this.expansionMap.set(
        group.canonical.toLowerCase(), 
        allForms.map(f => f.toLowerCase())
      );
    }

    this.logger.log(`Synonym service initialized with ${this.expansionMap.size} synonym groups`);
  }

  /**
   * Expand query with synonyms
   * Example: "chicken curry" -> "chicken murg murgi curry gravy"
   */
  expandQuery(query: string): string {
    if (!this.enabled || !query) {
      return query;
    }

    const words = query.toLowerCase().split(/\s+/);
    const expandedTerms = new Set<string>();

    for (const word of words) {
      expandedTerms.add(word); // Always include original

      const canonical = this.synonymMap.get(word);
      if (canonical) {
        const synonyms = this.expansionMap.get(canonical) || [];
        // Add top 2 most common synonyms
        synonyms.slice(0, 3).forEach(syn => expandedTerms.add(syn));
      }
    }

    return Array.from(expandedTerms).join(' ');
  }

  /**
   * Normalize query to canonical forms
   * Example: "murgi ka salan" -> "chicken ka salan"
   */
  normalizeQuery(query: string): string {
    if (!this.enabled || !query) {
      return query;
    }

    const words = query.toLowerCase().split(/\s+/);
    const normalized = words.map(word => {
      const canonical = this.synonymMap.get(word);
      return canonical || word;
    });

    return normalized.join(' ');
  }

  /**
   * Get all synonyms for a word
   */
  getSynonyms(word: string): string[] {
    const canonical = this.synonymMap.get(word.toLowerCase());
    if (!canonical) {
      return [];
    }
    return this.expansionMap.get(canonical) || [];
  }

  /**
   * Check if two words are synonyms
   */
  areSynonyms(word1: string, word2: string): boolean {
    const canonical1 = this.synonymMap.get(word1.toLowerCase());
    const canonical2 = this.synonymMap.get(word2.toLowerCase());
    return canonical1 === canonical2 && canonical1 !== undefined;
  }

  /**
   * Add custom synonym group (for learning)
   */
  addSynonymGroup(canonical: string, synonyms: string[]) {
    const allForms = [canonical, ...synonyms].map(f => f.toLowerCase());
    
    for (const form of allForms) {
      this.synonymMap.set(form, canonical.toLowerCase());
    }
    
    this.expansionMap.set(canonical.toLowerCase(), allForms);
    this.logger.debug(`Added synonym group: ${canonical} -> [${synonyms.join(', ')}]`);
  }
}
