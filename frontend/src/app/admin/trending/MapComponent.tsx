'use client';

import { useEffect, useState } from 'react';
import L, { LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import styles from './map.module.css';

interface Zone {
  id: number;
  name: string;
  coordinates: any;
  total_searches: number;
  status: 'active' | 'inactive';
}

interface MapComponentProps {
  zones: Zone[];
}

export default function MapComponent({ zones }: MapComponentProps) {
  const [map, setMap] = useState<L.Map | null>(null);

  // Nashik city center coordinates
  const NASHIK_CENTER: LatLngTuple = [19.9975, 73.7898];

  // Convert WKT coordinates to Leaflet polygon
  const parseCoordinates = (wktHex: string): LatLngTuple[] => {
    try {
      // For now, return dummy coordinates for Nashik area
      // In production, parse the WKT hex format
      return [
        [19.9, 73.7],
        [20.0, 73.7],
        [20.0, 73.9],
        [19.9, 73.9],
        [19.9, 73.7],
      ];
    } catch (error) {
      console.error('Error parsing coordinates:', error);
      return [];
    }
  };

  useEffect(() => {
    // Initialize map
    const mapContainer = document.getElementById('zone-map');
    if (!mapContainer || map) return;

    const leafletMap = L.map('zone-map').setView(NASHIK_CENTER, 12);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
      minZoom: 5,
    }).addTo(leafletMap);

    // Add zones as polygons
    zones.forEach((zone, idx) => {
      const coords = parseCoordinates(zone.coordinates);
      if (coords.length > 0) {
        const color = zone.status === 'active' ? '#10b981' : '#9ca3af';
        const polygon = L.polygon(coords, {
          color,
          fillColor: color,
          fillOpacity: 0.3,
          weight: 2,
          dashArray: zone.status === 'inactive' ? '5, 5' : undefined,
        }).addTo(leafletMap);

        // Add popup with zone info
        polygon.bindPopup(`
          <div class="p-2">
            <h4 class="font-bold">${zone.name}</h4>
            <p class="text-sm">ID: ${zone.id}</p>
            <p class="text-sm">Searches: ${zone.total_searches.toLocaleString()}</p>
            <p class="text-sm">Status: <span class="font-semibold ${zone.status === 'active' ? 'text-green-600' : 'text-gray-600'}">${zone.status}</span></p>
          </div>
        `);

        // Add marker at zone center
        const center = polygon.getBounds().getCenter();
        const marker = L.circleMarker(center, {
          radius: 8,
          fillColor: color,
          color: 'white',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8,
        }).addTo(leafletMap);

        marker.bindPopup(`<strong>${zone.name}</strong><br/>${zone.total_searches.toLocaleString()} searches`);
      }
    });

    // Add center marker for reference
    L.marker(NASHIK_CENTER, {
      icon: L.icon({
        iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjEwIiBmaWxsPSIjMzI2NSBkYyIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIi8+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMyIgZmlsbD0id2hpdGUiLz48L3N2Zz4=',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      }),
    }).addTo(leafletMap).bindPopup('Nashik City Center');

    setMap(leafletMap);

    return () => {
      leafletMap.remove();
    };
  }, [zones, map]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="h-96 relative" id="zone-map" style={{ width: '100%' }} />
      </div>

      {/* Map Legend */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-md border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">Map Legend</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-green-400 rounded opacity-50 border-2 border-green-500"></div>
              <span className="text-sm">Active Zone</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-gray-400 rounded opacity-50 border-2 border-gray-400" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 1px, rgba(255,255,255,.2) 1px, rgba(255,255,255,.2) 2px)' }}></div>
              <span className="text-sm">Inactive Zone</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
              <span className="text-sm">City Center</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-md border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">Zone Summary</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Zones:</span>
              <span className="font-semibold">{zones.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Active:</span>
              <span className="font-semibold text-green-600">{zones.filter(z => z.status === 'active').length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Inactive:</span>
              <span className="font-semibold text-gray-600">{zones.filter(z => z.status === 'inactive').length}</span>
            </div>
            <div className="border-t pt-1 mt-1 flex justify-between">
              <span className="text-gray-600">Total Searches:</span>
              <span className="font-semibold">{zones.reduce((sum, z) => sum + z.total_searches, 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Map Controls Help */}
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
        <p className="text-sm text-blue-900">
          <strong>Map Controls:</strong> Scroll to zoom, click zones for details, use mouse to pan. Click city center marker to center map.
        </p>
      </div>
    </div>
  );
}
