import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3200';

/**
 * Nerve AI Call Automation API
 * 
 * Proxies to backend which connects to Mercury Nerve System:
 * - Outbound calls to vendors/riders
 * - Order confirmation calls
 * - Call history and stats
 */

// GET: List calls or get stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const stats = searchParams.get('stats');
    const period = searchParams.get('period') || '7d';
    
    if (stats === 'true') {
      // Get call statistics
      const response = await fetch(`${BACKEND_URL}/api/exotel/nerve/calls/stats?period=${period}`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      return NextResponse.json({ success: true, stats: data });
    }
    
    if (orderId) {
      // Get order call history
      const response = await fetch(`${BACKEND_URL}/api/exotel/nerve/calls/order/${orderId}`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      
      if (!response.ok) throw new Error('Failed to fetch order calls');
      const data = await response.json();
      return NextResponse.json({ success: true, calls: data });
    }
    
    // Get Nerve health
    const response = await fetch(`${BACKEND_URL}/api/exotel/nerve/health`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    
    if (!response.ok) throw new Error('Failed to fetch health');
    const data = await response.json();
    return NextResponse.json({ success: true, health: data });
  } catch (error) {
    console.error('Nerve calls error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch call data',
    }, { status: 500 });
  }
}

// POST: Initiate vendor or rider call
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      callType, // 'vendor' or 'rider'
      orderId,
      ...callData
    } = body;
    
    if (!callType || !orderId) {
      return NextResponse.json({ 
        success: false, 
        error: 'callType and orderId are required' 
      }, { status: 400 });
    }
    
    let endpoint: string;
    if (callType === 'vendor') {
      endpoint = `${BACKEND_URL}/api/exotel/nerve/vendor/confirm`;
    } else if (callType === 'rider') {
      endpoint = `${BACKEND_URL}/api/exotel/nerve/rider/assign`;
    } else {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid callType. Use "vendor" or "rider"' 
      }, { status: 400 });
    }
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, ...callData }),
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Nerve call error:', errorText);
      return NextResponse.json({
        success: false,
        error: 'Failed to initiate call',
        details: errorText,
      }, { status: response.status });
    }
    
    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error('Nerve call error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to initiate call',
    }, { status: 500 });
  }
}

// POST retry a failed call
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { callId } = body;
    
    if (!callId) {
      return NextResponse.json({ 
        success: false, 
        error: 'callId is required' 
      }, { status: 400 });
    }
    
    const response = await fetch(`${BACKEND_URL}/api/exotel/nerve/calls/${callId}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: 'Failed to retry call',
      }, { status: response.status });
    }
    
    const data = await response.json();
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error('Nerve retry error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to retry call',
    }, { status: 500 });
  }
}
