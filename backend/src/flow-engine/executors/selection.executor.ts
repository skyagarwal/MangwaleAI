import { Injectable, Logger } from '@nestjs/common';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';

interface CardItem {
  id: number | string;
  name: string;
  price: string | number;
  storeId?: number;
  storeName?: string;
  storeLat?: number;
  storeLng?: number;
  [key: string]: any;
}

interface SelectionResult {
  selectedItems: Array<{
    itemIndex: number;
    itemId: number | string;
    itemName: string;
    quantity: number;
    price: number;
    storeId?: number;
    storeName?: string;
    storeLat?: number;
    storeLng?: number;
  }>;
  action: 'add_to_cart' | 'search_more' | 'checkout' | 'cancel' | 'unknown';
  totalPrice: number;
}

/**
 * Selection Executor
 * 
 * Parses user selection from search results.
 * Handles formats:
 * - "Add X to cart" (from button click)
 * - "1" or "1,2,3" (item numbers)
 * - "1x2" (item 1, quantity 2)
 * - "first one" / "second item"
 * - "checkout" / "proceed"
 * - "cancel" / "no"
 */
@Injectable()
export class SelectionExecutor implements ActionExecutor {
  readonly name = 'selection';
  private readonly logger = new Logger(SelectionExecutor.name);

  async execute(
    config: Record<string, any>,
    context: FlowContext
  ): Promise<ActionExecutionResult> {
    try {
      const userMessage = (context.data._user_message || context.data.user_message) as string;
      const searchResults = context.data.search_results as { cards?: CardItem[]; items?: CardItem[] };
      
      if (!userMessage) {
        return {
          success: false,
          error: 'No user message to parse',
          event: 'error',
        };
      }

      const cards = searchResults?.cards || searchResults?.items || [];
      this.logger.debug(`Parsing selection from: "${userMessage}" with ${cards.length} items available`);

      const result = this.parseSelection(userMessage, cards);
      
      this.logger.log(`Selection result: action=${result.action}, items=${result.selectedItems.length}`);

      // Determine next event based on action
      let event = 'unknown';
      if (result.action === 'add_to_cart' && result.selectedItems.length > 0) {
        event = 'item_selected';
      } else if (result.action === 'checkout') {
        event = 'checkout';
      } else if (result.action === 'cancel') {
        event = 'cancel';
      } else if (result.action === 'search_more') {
        event = 'search_more';
      } else {
        event = 'unclear';
      }

      return {
        success: true,
        output: result,
        event,
      };
    } catch (error) {
      this.logger.error(`Selection parsing failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        event: 'error',
      };
    }
  }

  private parseSelection(message: string, cards: CardItem[]): SelectionResult {
    const lowerMessage = message.toLowerCase().trim();
    const result: SelectionResult = {
      selectedItems: [],
      action: 'unknown',
      totalPrice: 0,
    };

    // Check for "Add X to cart" format (from button clicks)
    const addToCartMatch = lowerMessage.match(/^add\s+(.+)\s+to\s+cart$/i);
    if (addToCartMatch) {
      const itemName = addToCartMatch[1].toLowerCase();
      const matchedItem = this.findItemByName(itemName, cards);
      if (matchedItem) {
        result.selectedItems.push(matchedItem);
        result.action = 'add_to_cart';
        result.totalPrice = matchedItem.price;
        return result;
      }
    }

    // Check for checkout intents
    if (this.isCheckoutIntent(lowerMessage)) {
      result.action = 'checkout';
      return result;
    }

    // Check for cancel intents
    if (this.isCancelIntent(lowerMessage)) {
      result.action = 'cancel';
      return result;
    }

    // Check for "search more" / "show more" intents
    if (this.isSearchMoreIntent(lowerMessage)) {
      result.action = 'search_more';
      return result;
    }

    // Parse number-based selections: "1", "1,2,3", "1x2", "2 of first"
    const numberSelections = this.parseNumberSelections(lowerMessage, cards);
    if (numberSelections.length > 0) {
      result.selectedItems = numberSelections;
      result.action = 'add_to_cart';
      result.totalPrice = numberSelections.reduce((sum, item) => sum + item.price * item.quantity, 0);
      return result;
    }

    // Parse ordinal selections: "first", "second", "last"
    const ordinalSelection = this.parseOrdinalSelection(lowerMessage, cards);
    if (ordinalSelection) {
      result.selectedItems.push(ordinalSelection);
      result.action = 'add_to_cart';
      result.totalPrice = ordinalSelection.price;
      return result;
    }

    // Try fuzzy name match as last resort
    const fuzzyMatch = this.fuzzyMatchItem(lowerMessage, cards);
    if (fuzzyMatch) {
      result.selectedItems.push(fuzzyMatch);
      result.action = 'add_to_cart';
      result.totalPrice = fuzzyMatch.price;
      return result;
    }

    return result;
  }

  private findItemByName(name: string, cards: CardItem[]): SelectionResult['selectedItems'][0] | null {
    const lowerName = name.toLowerCase();
    
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const cardName = (card.name || '').toLowerCase();
      
      if (cardName === lowerName || cardName.includes(lowerName) || lowerName.includes(cardName)) {
        return {
          itemIndex: i,
          itemId: card.id,
          itemName: card.name,
          quantity: 1,
          price: this.parsePrice(card.price),
          storeId: card.storeId,
          storeName: card.storeName,
          storeLat: card.storeLat,
          storeLng: card.storeLng,
        };
      }
    }
    
    return null;
  }

  private parseNumberSelections(message: string, cards: CardItem[]): SelectionResult['selectedItems'] {
    const selections: SelectionResult['selectedItems'] = [];
    
    // Match patterns: "1", "1,2,3", "1 2 3", "1x2", "1 x 2", "2 of 1"
    // Simple number: just "1" or "2"
    const simpleNumber = message.match(/^\d+$/);
    if (simpleNumber) {
      const index = parseInt(simpleNumber[0]) - 1; // Convert to 0-based
      if (index >= 0 && index < cards.length) {
        const card = cards[index];
        selections.push({
          itemIndex: index,
          itemId: card.id,
          itemName: card.name,
          quantity: 1,
          price: this.parsePrice(card.price),
          storeId: card.storeId,
          storeName: card.storeName,
          storeLat: card.storeLat,
          storeLng: card.storeLng,
        });
      }
      return selections;
    }

    // Multiple numbers: "1,2,3" or "1 2 3"
    const multipleNumbers = message.match(/(\d+)[,\s]+/g);
    if (multipleNumbers) {
      const numbers = message.match(/\d+/g);
      if (numbers) {
        for (const num of numbers) {
          const index = parseInt(num) - 1;
          if (index >= 0 && index < cards.length) {
            const card = cards[index];
            selections.push({
              itemIndex: index,
              itemId: card.id,
              itemName: card.name,
              quantity: 1,
              price: this.parsePrice(card.price),
              storeId: card.storeId,
              storeName: card.storeName,
              storeLat: card.storeLat,
              storeLng: card.storeLng,
            });
          }
        }
        return selections;
      }
    }

    // Quantity format: "1x2" or "1 x 2" (item 1, quantity 2)
    const quantityMatch = message.match(/(\d+)\s*[xX×]\s*(\d+)/);
    if (quantityMatch) {
      const index = parseInt(quantityMatch[1]) - 1;
      const quantity = parseInt(quantityMatch[2]);
      if (index >= 0 && index < cards.length && quantity > 0) {
        const card = cards[index];
        selections.push({
          itemIndex: index,
          itemId: card.id,
          itemName: card.name,
          quantity,
          price: this.parsePrice(card.price),
          storeId: card.storeId,
          storeName: card.storeName,
          storeLat: card.storeLat,
          storeLng: card.storeLng,
        });
      }
      return selections;
    }

    return selections;
  }

  private parseOrdinalSelection(message: string, cards: CardItem[]): SelectionResult['selectedItems'][0] | null {
    const ordinalMap: Record<string, number> = {
      'first': 0, 'second': 1, 'third': 2, 'fourth': 3, 'fifth': 4,
      'sixth': 5, 'seventh': 6, 'eighth': 7, 'ninth': 8, 'tenth': 9,
      'last': cards.length - 1,
      '1st': 0, '2nd': 1, '3rd': 2, '4th': 3, '5th': 4,
    };

    for (const [ordinal, index] of Object.entries(ordinalMap)) {
      if (message.includes(ordinal) && index >= 0 && index < cards.length) {
        const card = cards[index];
        return {
          itemIndex: index,
          itemId: card.id,
          itemName: card.name,
          quantity: 1,
          price: this.parsePrice(card.price),
          storeId: card.storeId,
          storeName: card.storeName,
          storeLat: card.storeLat,
          storeLng: card.storeLng,
        };
      }
    }

    return null;
  }

  private fuzzyMatchItem(message: string, cards: CardItem[]): SelectionResult['selectedItems'][0] | null {
    // Simple word overlap matching
    const words = message.split(/\s+/).filter(w => w.length > 2);
    
    let bestMatch: { index: number; score: number } | null = null;
    
    for (let i = 0; i < cards.length; i++) {
      const cardName = (cards[i].name || '').toLowerCase();
      const cardWords = cardName.split(/\s+/);
      
      let score = 0;
      for (const word of words) {
        if (cardWords.some(cw => cw.includes(word) || word.includes(cw))) {
          score++;
        }
      }
      
      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { index: i, score };
      }
    }

    if (bestMatch && bestMatch.score >= 1) {
      const card = cards[bestMatch.index];
      return {
        itemIndex: bestMatch.index,
        itemId: card.id,
        itemName: card.name,
        quantity: 1,
        price: this.parsePrice(card.price),
        storeId: card.storeId,
        storeName: card.storeName,
        storeLat: card.storeLat,
        storeLng: card.storeLng,
      };
    }

    return null;
  }

  private isCheckoutIntent(message: string): boolean {
    const checkoutKeywords = ['checkout', 'proceed', 'pay', 'order now', 'place order', 'confirm order', 'done', 'that\'s all', 'finish'];
    return checkoutKeywords.some(k => message.includes(k));
  }

  private isCancelIntent(message: string): boolean {
    const cancelKeywords = ['cancel', 'no thanks', 'never mind', 'nevermind', 'stop', 'exit', 'quit'];
    return cancelKeywords.some(k => message.includes(k));
  }

  private isSearchMoreIntent(message: string): boolean {
    const searchMoreKeywords = ['more', 'show more', 'other', 'different', 'something else', 'search again'];
    return searchMoreKeywords.some(k => message.includes(k));
  }

  private parsePrice(price: string | number): number {
    if (typeof price === 'number') return price;
    // Parse "₹310" or "Rs. 310" or just "310"
    const match = String(price).match(/[\d,]+\.?\d*/);
    if (match) {
      return parseFloat(match[0].replace(/,/g, ''));
    }
    return 0;
  }
}
