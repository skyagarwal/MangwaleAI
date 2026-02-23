import { Injectable, Logger } from '@nestjs/common';

export interface FestivalInfo {
  name: string;
  date: string;
  preDays: number;
  items: string[];
  campaignMessage?: string;
  daysUntil: number;
  shouldTrigger: boolean;
}

@Injectable()
export class FestivalCampaignService {
  private readonly logger = new Logger(FestivalCampaignService.name);

  private readonly FESTIVAL_CALENDAR: Array<{ name: string; date: string; preDays: number; items: string[]; message: string }> = [
    { name: 'Holi', date: '2026-03-17', preDays: 3, items: ['thandai', 'gujiya', 'sweets', 'namkeen'], message: 'Happy Holi! Celebrate with delicious sweets and thandai!' },
    { name: 'Gudi Padwa', date: '2026-03-29', preDays: 2, items: ['shrikhand', 'puranpoli', 'sweets'], message: 'Gudi Padwa special! Order traditional sweets and puranpoli.' },
    { name: 'Eid ul-Fitr', date: '2026-03-20', preDays: 2, items: ['biryani', 'kebab', 'sheer khurma', 'sewaiyan'], message: 'Eid Mubarak! Celebrate with biryani and sheer khurma.' },
    { name: 'Ram Navami', date: '2026-04-06', preDays: 1, items: ['panakam', 'sundal', 'kosambari'], message: 'Ram Navami special offerings available now!' },
    { name: 'Ganesh Chaturthi', date: '2026-08-27', preDays: 5, items: ['modak', 'laddu', 'puranpoli', 'ukdiche modak'], message: 'Ganpati Bappa Morya! Fresh modak and laddu for Bappa!' },
    { name: 'Navratri Start', date: '2026-10-01', preDays: 3, items: ['sabudana khichdi', 'fruit salad', 'rajgira puri', 'vrat thali'], message: 'Navratri special vrat thali and fasting food available!' },
    { name: 'Dussehra', date: '2026-10-10', preDays: 2, items: ['jalebi', 'fafda', 'sweets'], message: 'Happy Dussehra! Treat yourself with jalebi-fafda.' },
    { name: 'Diwali', date: '2026-10-29', preDays: 7, items: ['sweets box', 'dry fruits', 'namkeen', 'chakli', 'karanji'], message: 'Diwali special! Gift boxes, sweets, and festive snacks.' },
    { name: 'Christmas', date: '2026-12-25', preDays: 3, items: ['cake', 'plum cake', 'cookies'], message: 'Merry Christmas! Fresh cakes and cookies delivered to you.' },
    { name: 'New Year', date: '2026-12-31', preDays: 2, items: ['party snacks', 'cake', 'cold drinks', 'biryani'], message: 'New Year party? We\'ve got snacks, cakes, and biryani!' },
  ];

  /**
   * Get upcoming festivals within N days
   */
  getUpcomingFestivals(days: number = 30): FestivalInfo[] {
    const now = new Date();
    const results: FestivalInfo[] = [];

    for (const festival of this.FESTIVAL_CALENDAR) {
      const festDate = new Date(festival.date);
      const daysUntil = Math.ceil((festDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntil >= -1 && daysUntil <= days) {
        results.push({
          name: festival.name,
          date: festival.date,
          preDays: festival.preDays,
          items: festival.items,
          campaignMessage: festival.message,
          daysUntil,
          shouldTrigger: daysUntil >= 0 && daysUntil <= festival.preDays,
        });
      }
    }

    return results.sort((a, b) => a.daysUntil - b.daysUntil);
  }

  /**
   * Get full festival calendar
   */
  getFullCalendar(): Array<{ name: string; date: string; preDays: number; items: string[]; message: string }> {
    return this.FESTIVAL_CALENDAR;
  }

  /**
   * Check if any festival should trigger today
   */
  getFestivalsToTriggerToday(): FestivalInfo[] {
    return this.getUpcomingFestivals(7).filter(f => f.shouldTrigger);
  }
}
