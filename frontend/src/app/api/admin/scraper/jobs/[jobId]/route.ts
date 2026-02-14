import { NextRequest, NextResponse } from 'next/server';

const SCRAPER_SERVICE_URL = process.env.SCRAPER_SERVICE_URL || 'http://localhost:3300';

/**
 * GET /api/admin/scraper/jobs/:jobId/details
 * Fetch full job details with restaurant data
 */
export async function getJobDetails(jobId: string) {
  try {
    const response = await fetch(
      `${SCRAPER_SERVICE_URL}/api/job/${jobId}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) {
      throw new Error(`Scraper service returned ${response.status}`);
    }

    const jobData = await response.json();
    
    // If job has restaurant ID, fetch additional details
    if (jobData?.restaurantId) {
      const restaurantRes = await fetch(
        `${SCRAPER_SERVICE_URL}/api/restaurant/${jobData.source}/${jobData.restaurantId}`,
        { signal: AbortSignal.timeout(5000) }
      );
      
      const reviewsRes = await fetch(
        `${SCRAPER_SERVICE_URL}/api/reviews/${jobData.source}/${jobData.restaurantId}`,
        { signal: AbortSignal.timeout(5000) }
      );

      const restaurant = restaurantRes.ok ? await restaurantRes.json() : null;
      const reviews = reviewsRes.ok ? await reviewsRes.json() : null;

      return {
        job: jobData,
        restaurant,
        reviews: reviews?.reviews || [],
        menuItems: restaurant?.menu || [],
        scrapingMetrics: {
          startTime: jobData.createdAt,
          endTime: jobData.completedAt,
          duration: jobData.completedAt ? 
            (new Date(jobData.completedAt).getTime() - new Date(jobData.createdAt).getTime()) / 1000 : 0,
          status: jobData.status,
          itemsFound: jobData.itemsScraped || 0,
          reviewsFound: jobData.reviewsScraped || 0,
          error: jobData.error || null,
          fssaiNumber: restaurant?.fssaiNumber,
          gstNumber: restaurant?.gstNumber
        }
      };
    }

    return {
      job: jobData,
      restaurant: null,
      reviews: [],
      menuItems: [],
      scrapingMetrics: {
        startTime: jobData.createdAt,
        endTime: jobData.completedAt,
        duration: jobData.completedAt ? 
          (new Date(jobData.completedAt).getTime() - new Date(jobData.createdAt).getTime()) / 1000 : 0,
        status: jobData.status,
        itemsFound: jobData.itemsScraped || 0,
        reviewsFound: jobData.reviewsScraped || 0,
        error: jobData.error || null
      }
    };
  } catch (error) {
    console.error('Get job details error:', error);
    throw error;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    
    if (jobId) {
      // Fetch details for specific job
      const details = await getJobDetails(jobId);
      return NextResponse.json(details);
    }

    // List jobs (existing functionality)
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
