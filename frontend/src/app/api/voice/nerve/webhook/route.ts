import { NextRequest, NextResponse } from 'next/server';

/**
 * Nerve Webhook Handler
 * 
 * Receives callbacks from Mercury Nerve for:
 * - Call status updates (ringing, answered, completed, failed)
 * - Transcriptions from vendor/rider responses
 * - Call recordings
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      event_type,
      call_id,
      order_id,
      status,
      transcription,
      duration,
      recording_url,
      timestamp,
    } = body;
    
    console.log(`[Nerve Webhook] Event: ${event_type}, Call: ${call_id}, Order: ${order_id}`);
    
    switch (event_type) {
      case 'call.initiated':
        console.log(`Call ${call_id} initiated for order ${order_id}`);
        // Could notify frontend via WebSocket
        break;
        
      case 'call.ringing':
        console.log(`Call ${call_id} ringing`);
        break;
        
      case 'call.answered':
        console.log(`Call ${call_id} answered`);
        // Update order status - vendor/rider picked up
        if (order_id) {
          await notifyOrderUpdate(order_id, 'call_answered', { call_id });
        }
        break;
        
      case 'call.transcription':
        console.log(`Transcription for call ${call_id}: ${transcription}`);
        // Process vendor/rider response
        if (order_id && transcription) {
          await processCallResponse(order_id, call_id, transcription);
        }
        break;
        
      case 'call.completed':
        console.log(`Call ${call_id} completed. Duration: ${duration}s`);
        if (order_id) {
          await notifyOrderUpdate(order_id, 'call_completed', { 
            call_id, 
            duration,
            recording_url,
          });
        }
        break;
        
      case 'call.failed':
        console.log(`Call ${call_id} failed: ${status}`);
        if (order_id) {
          await notifyOrderUpdate(order_id, 'call_failed', { call_id, reason: status });
        }
        break;
        
      case 'call.no_answer':
        console.log(`Call ${call_id} not answered`);
        if (order_id) {
          await notifyOrderUpdate(order_id, 'call_no_answer', { call_id });
        }
        break;
        
      default:
        console.log(`Unknown event type: ${event_type}`, body);
    }
    
    return NextResponse.json({ 
      success: true, 
      received: event_type,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Nerve webhook error:', error);
    return NextResponse.json({
      success: false,
      error: 'Webhook processing failed',
    }, { status: 500 });
  }
}

/**
 * Notify backend about order updates from calls
 */
async function notifyOrderUpdate(orderId: string, event: string, data: Record<string, unknown>) {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3200';
    await fetch(`${backendUrl}/api/orders/${orderId}/call-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data, timestamp: new Date().toISOString() }),
    });
  } catch (error) {
    console.error(`Failed to notify order ${orderId} update:`, error);
  }
}

/**
 * Process transcribed responses from vendor/rider calls
 */
async function processCallResponse(orderId: string, callId: string, transcription: string) {
  try {
    // Keywords indicating acceptance
    const acceptKeywords = ['हां', 'हाँ', 'yes', 'ok', 'ठीक है', 'बिल्कुल', 'accept', 'ready'];
    const rejectKeywords = ['नहीं', 'no', 'cancel', 'busy', 'रद्द', 'नहीं होगा'];
    const delayKeywords = ['देर', 'late', 'delay', 'time', 'थोड़ा'];
    
    const lowerTranscription = transcription.toLowerCase();
    
    let response = 'unclear';
    if (acceptKeywords.some(k => lowerTranscription.includes(k))) {
      response = 'accepted';
    } else if (rejectKeywords.some(k => lowerTranscription.includes(k))) {
      response = 'rejected';
    } else if (delayKeywords.some(k => lowerTranscription.includes(k))) {
      response = 'delayed';
    }
    
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3200';
    await fetch(`${backendUrl}/api/orders/${orderId}/call-response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        callId, 
        transcription, 
        interpretedResponse: response,
        timestamp: new Date().toISOString(),
      }),
    });
    
    console.log(`Order ${orderId} call response interpreted as: ${response}`);
  } catch (error) {
    console.error(`Failed to process call response for order ${orderId}:`, error);
  }
}
