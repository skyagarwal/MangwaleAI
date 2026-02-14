/**
 * API Route: /api/admin/data-sources
 * Manages external data sources for the AI system
 */

import { NextRequest, NextResponse } from 'next/server';

// Remove /api from URL if present since we add it in the path
const BACKEND_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3200').replace(/\/api$/, '');
const BACKEND_URL = BACKEND_BASE;

// Mock data for data sources (until backend endpoint exists)
const mockDataSources = [
  {
    id: 1,
    name: 'OpenSearch Food Items',
    dataType: 'store_info',
    apiEndpoint: 'http://localhost:9200/food_items_v4',
    priority: 1,
    isActive: true,
    usageCount: 15420,
    avgResponseTime: 45,
    errorCount: 12,
    healthStatus: 'healthy',
    lastSuccess: new Date().toISOString(),
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'Competitor Scraper',
    dataType: 'pricing',
    apiEndpoint: 'http://172.17.0.5:3300',
    priority: 2,
    isActive: true,
    usageCount: 892,
    avgResponseTime: 2500,
    errorCount: 5,
    healthStatus: 'healthy',
    lastSuccess: new Date().toISOString(),
    createdAt: '2024-06-01T00:00:00Z',
  },
  {
    id: 3,
    name: 'Weather API',
    dataType: 'weather',
    apiEndpoint: 'https://api.openweathermap.org',
    priority: 3,
    isActive: true,
    usageCount: 5621,
    avgResponseTime: 120,
    errorCount: 2,
    healthStatus: 'healthy',
    lastSuccess: new Date().toISOString(),
    createdAt: '2024-03-15T00:00:00Z',
  },
  {
    id: 4,
    name: 'Google Reviews',
    dataType: 'reviews',
    apiEndpoint: 'https://maps.googleapis.com',
    priority: 4,
    isActive: false,
    usageCount: 0,
    avgResponseTime: 0,
    errorCount: 0,
    healthStatus: 'degraded',
    createdAt: '2024-08-01T00:00:00Z',
  },
];

export async function GET(request: NextRequest) {
  try {
    // Try to get from backend first
    const backendResponse = await fetch(`${BACKEND_URL}/api/admin/data-sources`, {
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (backendResponse.ok) {
      const data = await backendResponse.json();
      // Ensure it's an array
      if (Array.isArray(data)) {
        return NextResponse.json(data);
      }
      // If backend returns object with data property
      if (data && Array.isArray(data.data)) {
        return NextResponse.json(data.data);
      }
    }
  } catch (error) {
    console.log('Backend data-sources not available, using mock data');
  }

  // Return mock data if backend is unavailable
  return NextResponse.json(mockDataSources);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Try backend first
    try {
      const backendResponse = await fetch(`${BACKEND_URL}/api/admin/data-sources`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (backendResponse.ok) {
        const data = await backendResponse.json();
        return NextResponse.json(data);
      }
    } catch (e) {
      // Backend not available
    }

    // Mock response
    const newSource = {
      id: Date.now(),
      ...body,
      usageCount: 0,
      avgResponseTime: 0,
      errorCount: 0,
      healthStatus: 'healthy',
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json(newSource, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create data source' },
      { status: 500 }
    );
  }
}
