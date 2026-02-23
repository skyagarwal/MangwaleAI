import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';

@Injectable()
export class ZoneService implements OnModuleInit {
  private readonly logger = new Logger(ZoneService.name);
  private zones: { id: number; polygon: [number, number][] }[] = [];

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    await this.loadZones();
    // Refresh zones every 10 minutes
    setInterval(() => this.loadZones(), 10 * 60 * 1000);
  }

  private async loadZones() {
    try {
      const connection = await mysql.createConnection({
        host: this.config.get<string>('MYSQL_HOST'),
        port: parseInt(this.config.get<string>('MYSQL_PORT') || '3306', 10),
        user: this.config.get<string>('MYSQL_USER'),
        password: this.config.get<string>('MYSQL_PASSWORD'),
        database: this.config.get<string>('MYSQL_DATABASE'),
      });

      // Fetch zones with coordinates as WKT
      const [rows] = await connection.execute(
        'SELECT id, ST_AsText(coordinates) as coordinates FROM zones WHERE status = 1'
      );

      this.zones = (rows as any[]).map((row) => ({
        id: row.id,
        polygon: this.parseWKT(row.coordinates),
      }));

      await connection.end();
      this.logger.log(`Loaded ${this.zones.length} zones`);
    } catch (error) {
      this.logger.error('Failed to load zones', error);
    }
  }

  private parseWKT(wkt: string): [number, number][] {
    if (!wkt || !wkt.startsWith('POLYGON')) return [];
    // Remove "POLYGON((" and "))"
    const content = wkt.replace(/^POLYGON\(\(/, '').replace(/\)\)$/, '');
    return content.split(',').map((pair) => {
      const parts = pair.trim().split(' ');
      // Assuming WKT is "lon lat" (standard) or "lat lon" depending on insertion.
      // We'll store as [x, y] (lon, lat) for the algorithm.
      return [parseFloat(parts[0]), parseFloat(parts[1])];
    });
  }

  getZoneId(lat: number, lon: number): number | null {
    // Point in Polygon (Ray Casting)
    // Point: [lon, lat] (x, y)
    const x = lon, y = lat;
    
    for (const zone of this.zones) {
      if (this.isPointInPolygon(x, y, zone.polygon)) {
        return zone.id;
      }
    }
    return null;
  }

  private isPointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];

      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
}
