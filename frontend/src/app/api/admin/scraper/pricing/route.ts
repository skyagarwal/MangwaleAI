import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3200';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    const itemName = searchParams.get('itemName');
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '50';

    const params = new URLSearchParams({ page, limit });
    if (storeId) params.append('storeId', storeId);
    if (itemName) params.append('itemName', itemName);

    const response = await fetch(
      `${BACKEND_URL}/api/admin/scraper/pricing?${params}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Get pricing data error:', error);
    return NextResponse.json({ 
      pricing: [], 
      total: 0,
      error: 'Failed to fetch pricing data' 
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemName, restaurantName, city } = body;

    const response = await fetch(`${BACKEND_URL}/api/admin/scraper/compare-pricing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemName, restaurantName, city }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Compare pricing error:', error);
    return NextResponse.json({ 
      error: 'Failed to compare pricing' 
    }, { status: 500 });
  }
}
