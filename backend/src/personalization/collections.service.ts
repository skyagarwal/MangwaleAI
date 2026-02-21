import { Injectable, Logger, Optional } from '@nestjs/common';
import { UserContextService } from '../user-context/user-context.service';
import { StoreScheduleService } from '../stores/services/store-schedule.service';

export interface Collection {
  id: string;
  title: string;
  subtitle: string;
  query: string;
  emoji: string;
}

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    private readonly userContext: UserContextService,
    @Optional() private readonly storeSchedule?: StoreScheduleService,
  ) {}

  async generateCollections(
    userId: number,
    opts: { lat?: number; lng?: number } = {},
  ): Promise<Collection[]> {
    const collections: Collection[] = [];

    // Load order history — gives us favoriteItems[{itemId,itemName,orderCount}]
    // and favoriteStores[{storeId,storeName,orderCount}] with proper names
    let orderHistory: Awaited<ReturnType<UserContextService['getOrderHistory']>> | null = null;
    try {
      orderHistory = await this.userContext.getOrderHistoryById(userId);
    } catch (err) {
      this.logger.warn(`Could not load order history for user ${userId}: ${err.message}`);
    }

    const hour = new Date().getHours();

    // 1. "Your Usual" — if user has ≥2 favourite food items
    const favItems = orderHistory?.favoriteItems?.filter(i => i.itemName) ?? [];
    if (favItems.length >= 2) {
      const topItem = favItems[0];
      collections.push({
        id: 'your_usual',
        emoji: '❤️',
        title: 'Your Usual ❤️',
        subtitle: `You love ${topItem.itemName}`,
        query: topItem.itemName,
      });
    }

    // 2. "Back to [FavStore]" — if user has a favourite store
    const favStores = orderHistory?.favoriteStores?.filter(s => s.storeName) ?? [];
    if (favStores.length > 0) {
      const favStore = favStores[0];
      const storeName = favStore.storeName;
      let storeStatus = '🟢 Open';
      if (favStore.storeId && this.storeSchedule) {
        try {
          const s = await this.storeSchedule.isStoreOpen(favStore.storeId);
          storeStatus = s.is_open ? '🟢 Open now' : `🔴 ${s.message || 'Closed'}`;
        } catch {}
      }
      const displayName = storeName.length > 18 ? storeName.slice(0, 18) + '…' : storeName;
      collections.push({
        id: 'fav_store',
        emoji: '🏪',
        title: `Back to ${displayName}`,
        subtitle: `${favStore.orderCount ? favStore.orderCount + ' orders • ' : ''}${storeStatus}`,
        query: `food from ${storeName}`,
      });
    }

    // 3. "Open Now Nearby" — always available
    collections.push({
      id: 'open_now',
      emoji: '🟢',
      title: 'Open Now Nearby',
      subtitle: 'Currently serving near you',
      query: 'open now',  // matches open_now_requested condition in check_resolution_result
    });

    // 4. "Chotu's Pick" — time-aware
    const mealPick = this.getMealTimePick(hour);
    collections.push({
      id: 'chotu_pick',
      emoji: mealPick.emoji,
      title: mealPick.title,
      subtitle: mealPick.subtitle,
      query: mealPick.query,
    });

    // Return max 4 collections
    return collections.slice(0, 4);
  }

  private getMealTimePick(hour: number): { emoji: string; title: string; subtitle: string; query: string } {
    if (hour >= 6 && hour < 11) {
      return { emoji: '☕', title: 'Breakfast Time ☕', subtitle: 'Start your day right', query: 'chai breakfast sandwich egg' };
    } else if (hour >= 11 && hour < 15) {
      return { emoji: '🍛', title: 'Lunch Specials 🍛', subtitle: "What's good today", query: 'thali rice curry lunch' };
    } else if (hour >= 15 && hour < 18) {
      return { emoji: '🫖', title: 'Evening Bites 🫖', subtitle: 'Chai & snack time', query: 'chai snacks evening' };
    } else if (hour >= 18 && hour < 23) {
      return { emoji: '🌙', title: 'Dinner Options 🌙', subtitle: "What's for dinner?", query: 'biryani dinner roti sabzi' };
    } else {
      return { emoji: '🌙', title: 'Late Night Cravings 🌙', subtitle: 'Still hungry?', query: 'late night khana snacks' };
    }
  }
}
