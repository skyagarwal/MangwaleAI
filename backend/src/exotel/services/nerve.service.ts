import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { firstValueFrom } from 'rxjs';

/**
 * Nerve System Service - AI Voice Call Orchestrator
 * 
 * Handles:
 * - Vendor order confirmation calls
 * - Vendor prep time collection
 * - Rider assignment calls
 * - Rider pickup ready notifications
 * 
 * Connects to the configured Nerve System endpoint
 */

export interface VendorConfirmationRequest {
  orderId: number;
  vendorId: number;
  vendorPhone: string;
  vendorName: string;
  orderAmount?: number;
  itemCount?: number;
  language?: string;
  callbackUrl?: string;
}

export interface VendorPrepTimeRequest {
  orderId: number;
  vendorId: number;
  vendorPhone: string;
  vendorName: string;
  language?: string;
}

export interface RiderAssignmentRequest {
  orderId: number;
  riderId: number;
  riderPhone: string;
  riderName: string;
  vendorName: string;
  vendorAddress: string;
  estimatedAmount?: number;
  language?: string;
}

export interface RiderPickupReadyRequest {
  orderId: number;
  riderId: number;
  riderPhone: string;
  riderName: string;
  vendorName: string;
  language?: string;
}

export interface VoiceCallResult {
  callId: string;
  callSid?: string;
  status: 'initiated' | 'success' | 'failed' | 'no_answer' | 'busy';
  dtmfDigits?: string;
  prepTimeMinutes?: number;
  rejectionReason?: string;
  recordingUrl?: string;
  message?: string;
}

@Injectable()
export class NerveService {
  private readonly logger = new Logger(NerveService.name);
  private readonly nerveSystemUrl: string;
  private enabled = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
  ) {
    this.nerveSystemUrl = this.configService.get('NERVE_SYSTEM_URL');
    
    if (!this.nerveSystemUrl) {
      this.logger.error('❌ NERVE_SYSTEM_URL not configured in .env');
      throw new Error('NERVE_SYSTEM_URL is required');
    }
    
    this.checkConnection();
  }

  private async checkConnection(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.nerveSystemUrl}/health`, { timeout: 5000 }),
      );
      this.enabled = response.data?.status === 'healthy';
      if (this.enabled) {
        this.logger.log(`✅ NerveService connected to ${this.nerveSystemUrl}`);
        this.logger.log(`   Mode: ${response.data?.mode || 'N/A'}`);
        this.logger.log(`   Phrases cached: ${response.data?.tts_cache_size || 0}`);
      }
    } catch (error: any) {
      this.logger.warn(`⚠️ Nerve System not available: ${error.message}`);
      this.enabled = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get Nerve System health and status
   */
  async getHealth(): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.nerveSystemUrl}/health`),
      );
      return response.data;
    } catch (error: any) {
      return { status: 'offline', error: error.message };
    }
  }

  /**
   * Initiate vendor order confirmation call
   * 
   * Flow:
   * 1. Create voice_call record
   * 2. Call Nerve System to initiate call
   * 3. Nerve System handles TTS prompts and DTMF collection
   * 4. Callback received with result
   */
  async confirmVendorOrder(request: VendorConfirmationRequest): Promise<VoiceCallResult> {
    const callId = `VC_${request.orderId}_${Date.now()}`;
    
    try {
      // Create voice call record
      await this.prisma.$executeRaw`
        INSERT INTO voice_calls (id, call_type, status, order_id, vendor_id, phone_number, recipient_name, language)
        VALUES (${callId}, 'VENDOR_ORDER_CONFIRMATION', 'INITIATED', ${request.orderId}, ${request.vendorId}, ${request.vendorPhone}, ${request.vendorName}, ${request.language || 'hi'})
      `;

      // Call Nerve System
      const response = await firstValueFrom(
        this.httpService.post(`${this.nerveSystemUrl}/api/nerve/vendor-order-confirmation`, {
          order_id: request.orderId,
          vendor_phone: request.vendorPhone,
          vendor_name: request.vendorName,
          order_amount: request.orderAmount || 0,
          vendor_id: request.vendorId,
          language: request.language || 'hi',
          
        }),
      );

      // Update with call SID
      if (response.data?.call_sid) {
        await this.prisma.$executeRaw`
          UPDATE voice_calls SET call_sid = ${response.data.call_sid}, status = 'RINGING'
          WHERE id = ${callId}
        `;
      }

      return {
        callId,
        callSid: response.data?.call_sid,
        status: 'initiated',
        message: response.data?.message || 'Call initiated',
      };
    } catch (error: any) {
      this.logger.error(`Vendor confirmation failed: ${error.message}`);
      
      // Update record with failure
      await this.prisma.$executeRaw`
        UPDATE voice_calls SET status = 'FAILED', metadata = ${JSON.stringify({ error: error.message })}::jsonb
        WHERE id = ${callId}
      `;

      return {
        callId,
        status: 'failed',
        message: error.message,
      };
    }
  }

  /**
   * Initiate rider assignment call
   */
  async assignRider(request: RiderAssignmentRequest): Promise<VoiceCallResult> {
    const callId = `RC_${request.orderId}_${Date.now()}`;
    
    try {
      // Create voice call record
      await this.prisma.$executeRaw`
        INSERT INTO voice_calls (id, call_type, status, order_id, rider_id, phone_number, recipient_name, language)
        VALUES (${callId}, 'RIDER_ASSIGNMENT', 'INITIATED', ${request.orderId}, ${request.riderId}, ${request.riderPhone}, ${request.riderName}, ${request.language || 'hi'})
      `;

      // Call Nerve System
      const response = await firstValueFrom(
        this.httpService.post(`${this.nerveSystemUrl}/api/nerve/rider-assignment`, {
          order_id: request.orderId,
          rider_phone: request.riderPhone,
          rider_name: request.riderName,
          vendor_name: request.vendorName,
          vendor_address: request.vendorAddress,
          estimated_amount: request.estimatedAmount,
          language: request.language || 'hi',
          callback_url: `${this.configService.get('APP_URL')}/api/v1/exotel/nerve/callback`,
        }),
      );

      // Update with call SID
      if (response.data?.call_sid) {
        await this.prisma.$executeRaw`
          UPDATE voice_calls SET call_sid = ${response.data.call_sid}, status = 'RINGING'
          WHERE id = ${callId}
        `;
      }

      return {
        callId,
        callSid: response.data?.call_sid,
        status: 'initiated',
        message: response.data?.message || 'Call initiated',
      };
    } catch (error: any) {
      this.logger.error(`Rider assignment call failed: ${error.message}`);
      
      await this.prisma.$executeRaw`
        UPDATE voice_calls SET status = 'FAILED', metadata = ${JSON.stringify({ error: error.message })}::jsonb
        WHERE id = ${callId}
      `;

      return {
        callId,
        status: 'failed',
        message: error.message,
      };
    }
  }

  /**
   * Process callback from Nerve System
   */
  async processCallback(callbackData: any): Promise<void> {
    const { call_id, call_sid, event, dtmf_digits, status, rejection_reason, prep_time, recording_url } = callbackData;
    
    this.logger.log(`📞 Nerve callback: ${event} for call ${call_id || call_sid}`);

    try {
      const updateFields: any = {
        updated_at: new Date(),
      };

      if (status) {
        updateFields.status = this.mapNerveStatusToDb(status);
      }

      if (dtmf_digits) {
        updateFields.dtmf_digits = dtmf_digits;
      }

      if (prep_time) {
        updateFields.prep_time_minutes = prep_time;
      }

      if (rejection_reason) {
        updateFields.rejection_reason = this.mapRejectionReason(rejection_reason);
      }

      if (recording_url) {
        updateFields.recording_url = recording_url;
      }

      if (event === 'answered') {
        updateFields.answered_at = new Date();
      }

      if (event === 'completed' || event === 'failed') {
        updateFields.ended_at = new Date();
      }

      // Update by call_id or call_sid using safe parameterized queries
      // Whitelist allowed column names for dynamic SET clause
      const ALLOWED_COLUMNS = [
        'status', 'dtmf_digits', 'prep_time_minutes', 'rejection_reason',
        'recording_url', 'answered_at', 'ended_at', 'updated_at', 'metadata',
      ];

      const setFragments: Prisma.Sql[] = [];
      const entries = Object.entries(updateFields);
      for (const [key, value] of entries) {
        if (!ALLOWED_COLUMNS.includes(key)) {
          this.logger.warn(`Skipping disallowed column in voice_calls update: ${key}`);
          continue;
        }
        const col = Prisma.raw(key);
        if (value instanceof Date) {
          setFragments.push(Prisma.sql`${col} = ${value.toISOString()}::timestamptz`);
        } else {
          setFragments.push(Prisma.sql`${col} = ${String(value)}`);
        }
      }

      if (setFragments.length === 0) return;

      const setClause = Prisma.join(setFragments, ', ');

      if (call_id) {
        await this.prisma.$executeRaw`UPDATE voice_calls SET ${setClause} WHERE id = ${call_id}`;
      } else {
        await this.prisma.$executeRaw`UPDATE voice_calls SET ${setClause} WHERE call_sid = ${call_sid}`;
      }
      
      // Emit event for order system to react
      this.emitCallEvent(callbackData);
      
    } catch (error: any) {
      this.logger.error(`Callback processing failed: ${error.message}`);
    }
  }

  private mapNerveStatusToDb(status: string): string {
    const statusMap: Record<string, string> = {
      'initiated': 'INITIATED',
      'ringing': 'RINGING',
      'answered': 'ANSWERED',
      'accepted': 'ACCEPTED',
      'rejected': 'REJECTED',
      'prep_time_set': 'PREP_TIME_SET',
      'no_response': 'NO_RESPONSE',
      'failed': 'FAILED',
      'busy': 'BUSY',
      'completed': 'COMPLETED',
    };
    return statusMap[status] || 'INITIATED';
  }

  private mapRejectionReason(reason: string): string {
    const reasonMap: Record<string, string> = {
      'item_unavailable': 'ITEM_UNAVAILABLE',
      'too_busy': 'TOO_BUSY',
      'shop_closed': 'SHOP_CLOSED',
      'other': 'OTHER',
    };
    return reasonMap[reason] || 'OTHER';
  }

  private emitCallEvent(callbackData: any): void {
    // TODO: Emit event via EventEmitter2 for order service to handle
    // Events: VENDOR_ACCEPTED, VENDOR_REJECTED, VENDOR_PREP_TIME, RIDER_ACCEPTED, RIDER_REJECTED
    this.logger.log(`📢 Event emitted: ${callbackData.event} for order ${callbackData.order_id}`);
  }

  /**
   * Get call history for an order
   */
  async getRecentCalls(limit = 50): Promise<any[]> {
    try {
      const calls = await this.prisma.$queryRaw`
        SELECT * FROM voice_calls ORDER BY initiated_at DESC LIMIT ${limit}
      `;
      return calls as any[];
    } catch {
      return [];
    }
  }

  async getOrderCallHistory(orderId: number): Promise<any[]> {
    try {
      const calls = await this.prisma.$queryRaw`
        SELECT * FROM voice_calls WHERE order_id = ${orderId} ORDER BY initiated_at DESC
      `;
      return calls as any[];
    } catch {
      return [];
    }
  }

  /**
   * Get call stats
   */
  async getCallStats(period = '7d'): Promise<any> {
    try {
      const days = period === '24h' ? 1 : period === '7d' ? 7 : 30;

      const stats = await this.prisma.$queryRaw`
        SELECT
          call_type,
          status,
          COUNT(*) as count,
          AVG(duration_seconds) as avg_duration
        FROM voice_calls
        WHERE initiated_at > NOW() - INTERVAL '${days} days'
        GROUP BY call_type, status
      `;

      return stats;
    } catch {
      return { total: 0, calls: [], message: 'voice_calls table not yet created' };
    }
  }

  /**
   * Retry a failed call
   */
  async retryCall(callId: string): Promise<VoiceCallResult> {
    const call = await this.prisma.$queryRaw`
      SELECT * FROM voice_calls WHERE id = ${callId}
    ` as any[];

    if (!call.length) {
      return { callId, status: 'failed', message: 'Call not found' };
    }

    const originalCall = call[0];
    
    if (originalCall.attempt_number >= originalCall.max_attempts) {
      return { callId, status: 'failed', message: 'Max retries exceeded' };
    }

    // Update attempt count
    await this.prisma.$executeRaw`
      UPDATE voice_calls SET attempt_number = attempt_number + 1 WHERE id = ${callId}
    `;

    // Re-initiate based on call type
    if (originalCall.call_type === 'VENDOR_ORDER_CONFIRMATION') {
      return this.confirmVendorOrder({
        orderId: originalCall.order_id,
        vendorId: originalCall.vendor_id,
        vendorPhone: originalCall.phone_number,
        vendorName: originalCall.recipient_name,
        language: originalCall.language,
      });
    }

    return { callId, status: 'failed', message: 'Unknown call type for retry' };
  }
}
