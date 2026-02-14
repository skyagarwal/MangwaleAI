import { NextRequest, NextResponse } from 'next/server';

const SCRAPER_SERVICE_URL = process.env.SCRAPER_SERVICE_URL || 'http://localhost:3300';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '20';
    const status = searchParams.get('status') || 'all';

    const response = await fetch(
      `${SCRAPER_SERVICE_URL}/api/jobs?page=${page}&limit=${limit}&status=${status}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) {
      throw new Error(`Scraper service returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Get scraper jobs error:', error);
    return NextResponse.json({ 
      jobs: [], 
      total: 0, 
      page: 1,
      error: 'Scraper service unavailable' 
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source, storeName, storeAddress, url, lat, lng, priority } = body;

    const response = await fetch(`${SCRAPER_SERVICE_URL}/api/scrape/${source}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantName: storeName,
        restaurantUrl: url,
        city: storeAddress,
        lat: lat || 19.9975,
        lng: lng || 73.7898,
        priority: priority || 'normal'
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`Scraper service returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Create scraper job error:', error);
    return NextResponse.json({ 
      error: 'Failed to create scraper job' 
    }, { status: 500 });
  }
}
