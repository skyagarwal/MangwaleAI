import { NextResponse } from 'next/server';

const SCRAPER_SERVICE_URL = process.env.SCRAPER_SERVICE_URL || 'http://localhost:3300';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3200';

export async function GET() {
  try {
    // Try to get stats from scraper service
    const [scraperHealth, backendStats] = await Promise.allSettled([
      fetch(`${SCRAPER_SERVICE_URL}/health`, { 
        signal: AbortSignal.timeout(3000) 
      }).then(r => r.json()),
      fetch(`${BACKEND_URL}/api/admin/scraper/stats`, { 
        signal: AbortSignal.timeout(3000) 
      }).then(r => r.json()),
    ]);

    // Get job stats from scraper service or return mock
    const stats = {
      todayJobs: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      avgDuration: 0,
      storesMapped: 0,
      avgConfidence: 0,
      scraperServiceStatus: 'offline',
      lastSync: null,
    };

    if (scraperHealth.status === 'fulfilled') {
      stats.scraperServiceStatus = 'online';
    }

    if (backendStats.status === 'fulfilled' && backendStats.value) {
      Object.assign(stats, backendStats.value);
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Scraper stats error:', error);
    return NextResponse.json({
      todayJobs: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      avgDuration: 0,
      storesMapped: 0,
      avgConfidence: 0,
      scraperServiceStatus: 'offline',
      lastSync: null,
      error: 'Failed to fetch scraper stats'
    });
  }
}
