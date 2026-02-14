import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { SessionService } from '../../session/session.service';
import { WhatsAppCloudService } from '../../whatsapp/services/whatsapp-cloud.service';

export interface BroadcastCampaign {
  id: string;
  name: string;
  templateName: string;
  templateLanguage: string;
  templateComponents?: any[];
  audience: 'all' | 'recent' | 'inactive' | 'custom';
  audienceFilter?: {
    lastActiveWithinDays?: number;
    inactiveForDays?: number;
    phoneNumbers?: string[];
  };
  status: 'draft' | 'sending' | 'completed' | 'failed';
  stats: {
    total: number;
    sent: number;
    failed: number;
  };
  createdAt: Date;
  completedAt?: Date;
}

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);
  private readonly rateLimitPerSecond: number;
  // In-memory campaign history (replace with DB table if needed)
  private campaigns: BroadcastCampaign[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly whatsAppCloud: WhatsAppCloudService,
  ) {
    this.rateLimitPerSecond = parseInt(
      this.configService.get('BROADCAST_RATE_LIMIT') || '50',
      10,
    );
  }

  // ─── Audience Resolution ───────────────────────────────────────

  /**
   * Build phone number list based on audience type.
   * - 'all'      → all registered users from Prisma User table
   * - 'recent'   → users active within N days (Redis sessions)
   * - 'inactive' → registered users whose lastActiveAt is older than N days
   * - 'custom'   → explicit phone list
   */
  async getAudienceList(
    audience: BroadcastCampaign['audience'],
    filter?: BroadcastCampaign['audienceFilter'],
  ): Promise<string[]> {
    if (audience === 'custom' && filter?.phoneNumbers?.length) {
      return filter.phoneNumbers;
    }

    if (audience === 'recent') {
      // Active Redis sessions = recently chatting users
      try {
        const sessions = await this.sessionService.getAllSessions();
        let phones = sessions.map((s) => s.phoneNumber).filter(Boolean);
        if (filter?.lastActiveWithinDays) {
          const cutoff =
            Date.now() - filter.lastActiveWithinDays * 86_400_000;
          phones = sessions
            .filter((s) => s.updatedAt >= cutoff)
            .map((s) => s.phoneNumber);
        }
        return [...new Set(phones)];
      } catch (err) {
        this.logger.warn(`Redis session query failed: ${err.message}`);
        return [];
      }
    }

    // 'all' or 'inactive' → query Prisma User table
    try {
      const where: any = {};
      if (audience === 'inactive' && filter?.inactiveForDays) {
        where.lastActiveAt = {
          lt: new Date(Date.now() - filter.inactiveForDays * 86_400_000),
        };
      }
      const users = await this.prisma.user.findMany({
        where,
        select: { phone: true },
      });
      return users.map((u) => u.phone).filter(Boolean);
    } catch (err) {
      this.logger.warn(`Prisma user query failed: ${err.message}`);
      return [];
    }
  }

  // ─── Campaign Management ──────────────────────────────────────

  getCampaigns(): BroadcastCampaign[] {
    return [...this.campaigns].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  getCampaign(id: string): BroadcastCampaign | undefined {
    return this.campaigns.find((c) => c.id === id);
  }

  // ─── Broadcast Execution ──────────────────────────────────────

  /**
   * Rate-limited template broadcast to a phone list.
   * Returns results and persists a campaign record.
   */
  async sendBroadcast(opts: {
    name: string;
    templateName: string;
    templateLanguage: string;
    templateComponents?: any[];
    phoneNumbers: string[];
  }): Promise<BroadcastCampaign> {
    const campaign: BroadcastCampaign = {
      id: `bc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: opts.name,
      templateName: opts.templateName,
      templateLanguage: opts.templateLanguage,
      templateComponents: opts.templateComponents,
      audience: 'custom',
      status: 'sending',
      stats: { total: opts.phoneNumbers.length, sent: 0, failed: 0 },
      createdAt: new Date(),
    };
    this.campaigns.push(campaign);

    this.logger.log(
      `📢 Campaign ${campaign.id}: "${opts.templateName}" → ${opts.phoneNumbers.length} recipients`,
    );

    const batchSize = this.rateLimitPerSecond;
    for (let i = 0; i < opts.phoneNumbers.length; i += batchSize) {
      const batch = opts.phoneNumbers.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (phone) => {
          const formatted = phone.startsWith('91') ? phone : `91${phone}`;
          await this.whatsAppCloud.sendTemplate(formatted, {
            name: opts.templateName,
            language: opts.templateLanguage,
            components: opts.templateComponents,
          });
        }),
      );

      for (const r of results) {
        if (r.status === 'fulfilled') campaign.stats.sent++;
        else {
          campaign.stats.failed++;
          this.logger.warn(`❌ Send failed: ${(r as any).reason?.message}`);
        }
      }

      // 1-second pause between batches
      if (i + batchSize < opts.phoneNumbers.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }

      this.logger.log(
        `📊 Progress: ${Math.min(i + batchSize, opts.phoneNumbers.length)}/${opts.phoneNumbers.length}`,
      );
    }

    campaign.status =
      campaign.stats.failed === campaign.stats.total ? 'failed' : 'completed';
    campaign.completedAt = new Date();

    this.logger.log(
      `✅ Campaign ${campaign.id} done: ${campaign.stats.sent} sent, ${campaign.stats.failed} failed`,
    );

    return campaign;
  }

  /**
   * Convenience: resolve audience then broadcast.
   */
  async sendCampaign(opts: {
    name: string;
    templateName: string;
    templateLanguage: string;
    templateComponents?: any[];
    audience: BroadcastCampaign['audience'];
    audienceFilter?: BroadcastCampaign['audienceFilter'];
  }): Promise<BroadcastCampaign> {
    const phoneNumbers = await this.getAudienceList(
      opts.audience,
      opts.audienceFilter,
    );

    if (phoneNumbers.length === 0) {
      this.logger.warn('No audience found for campaign');
      const empty: BroadcastCampaign = {
        id: `bc_${Date.now()}_empty`,
        name: opts.name,
        templateName: opts.templateName,
        templateLanguage: opts.templateLanguage,
        audience: opts.audience,
        audienceFilter: opts.audienceFilter,
        status: 'completed',
        stats: { total: 0, sent: 0, failed: 0 },
        createdAt: new Date(),
        completedAt: new Date(),
      };
      this.campaigns.push(empty);
      return empty;
    }

    return this.sendBroadcast({
      name: opts.name,
      templateName: opts.templateName,
      templateLanguage: opts.templateLanguage,
      templateComponents: opts.templateComponents,
      phoneNumbers,
    });
  }
}
