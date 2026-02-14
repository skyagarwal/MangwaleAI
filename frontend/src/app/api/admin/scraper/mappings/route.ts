import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3200';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '20';
    const mapped = searchParams.get('mapped'); // 'true', 'false', or null for all

    const response = await fetch(
      `${BACKEND_URL}/api/admin/scraper/mappings?page=${page}&limit=${limit}${mapped ? `&mapped=${mapped}` : ''}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Get store mappings error:', error);
    return NextResponse.json({ 
      mappings: [], 
      total: 0,
      page: 1,
      error: 'Failed to fetch mappings' 
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, storeName, storeAddress, lat, lng, fssaiNumber, gstNumber } = body;

    const response = await fetch(`${BACKEND_URL}/api/admin/scraper/match-store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId,
        storeName,
        storeAddress,
        lat,
        lng,
        fssaiNumber,
        gstNumber
      }),
      signal: AbortSignal.timeout(30000) // Matching can take time
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Match store error:', error);
    return NextResponse.json({ 
      error: 'Failed to match store' 
    }, { status: 500 });
  }
}
