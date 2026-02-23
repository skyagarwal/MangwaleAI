import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';

/**
 * Zone Heat Map Service
 *
 * Real-time order density per zone for rider positioning decisions.
 * Reads exclusively from PHP MySQL — no PG tables needed.
 */
@Injectable()
export class ZoneHeatMapService implements OnModuleInit {
  private readonly logger = new Logger(ZoneHeatMapService.name);
  private mysqlPool: mysql.Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.mysqlPool = mysql.createPool({
      host: this.config.get('PHP_DB_HOST') || '103.160.107.208',
      port: parseInt(this.config.get('PHP_DB_PORT') || '3307'),
      user: this.config.get('PHP_DB_USER') || 'mangwale_user',
      password: this.config.get('PHP_DB_PASSWORD') || '',
      database: this.config.get('PHP_DB_NAME') || 'mangwale_db',
      connectionLimit: 5,
      connectTimeout: 10000,
    });
    this.logger.log('ZoneHeatMapService initialized');
  }

  /**
   * Get order density per zone for the last N hours.
   * Returns demand level classification for each zone.
   */
  async getOrderDensity(date?: string, hours: number = 2): Promise<Array<{
    zoneId: number;
    zoneName: string;
    orderCount: number;
    avgDeliveryTimeMins: number;
    demandLevel: 'low' | 'medium' | 'high' | 'surge';
  }>> {
    try {
      const dateFilter = date
        ? `DATE(o.created_at) = ?`
        : `o.created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)`;
      const param = date || hours;

      const [rows] = await this.mysqlPool.query(`
        SELECT
          o.zone_id,
          z.name as zone_name,
          COUNT(*) as order_count,
          AVG(CASE WHEN o.status = 'delivered'
              THEN TIMESTAMPDIFF(MINUTE, o.created_at, o.delivered_at) END) as avg_delivery_time
        FROM orders o
        LEFT JOIN zones z ON o.zone_id = z.id
        WHERE ${dateFilter}
          AND o.status IN ('delivered', 'accepted', 'picked_up', 'pending')
          AND o.zone_id IS NOT NULL
        GROUP BY o.zone_id, z.name
        ORDER BY order_count DESC
      `, [param]) as any;

      return (rows || []).map((r: any) => {
        const count = parseInt(r.order_count) || 0;
        return {
          zoneId: r.zone_id,
          zoneName: r.zone_name || `Zone ${r.zone_id}`,
          orderCount: count,
          avgDeliveryTimeMins: Math.round(parseFloat(r.avg_delivery_time) || 0),
          demandLevel: this.classifyDemand(count),
        };
      });
    } catch (error: any) {
      this.logger.error(`getOrderDensity failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Full-day heatmap with hourly breakdown per zone.
   */
  async getZoneHeatMap(date?: string): Promise<{
    zones: Array<{
      zoneId: number;
      zoneName: string;
      hourly: Array<{ hour: number; orders: number }>;
    }>;
  }> {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];

      const [rows] = await this.mysqlPool.query(`
        SELECT
          o.zone_id,
          z.name as zone_name,
          HOUR(o.created_at) as hour,
          COUNT(*) as orders
        FROM orders o
        LEFT JOIN zones z ON o.zone_id = z.id
        WHERE DATE(o.created_at) = ?
          AND o.zone_id IS NOT NULL
        GROUP BY o.zone_id, z.name, HOUR(o.created_at)
        ORDER BY o.zone_id, hour
      `, [targetDate]) as any;

      // Group by zone with all 24 hours filled
      const zoneMap = new Map<number, {
        zoneId: number;
        zoneName: string;
        hourly: Map<number, number>;
      }>();

      for (const row of rows || []) {
        const zoneId = row.zone_id;
        if (!zoneMap.has(zoneId)) {
          zoneMap.set(zoneId, {
            zoneId,
            zoneName: row.zone_name || `Zone ${zoneId}`,
            hourly: new Map(),
          });
        }
        zoneMap.get(zoneId)!.hourly.set(parseInt(row.hour), parseInt(row.orders) || 0);
      }

      const zones = Array.from(zoneMap.values()).map(zone => ({
        zoneId: zone.zoneId,
        zoneName: zone.zoneName,
        hourly: Array.from({ length: 24 }, (_, h) => ({
          hour: h,
          orders: zone.hourly.get(h) || 0,
        })),
      }));

      return { zones };
    } catch (error: any) {
      this.logger.error(`getZoneHeatMap failed: ${error.message}`);
      return { zones: [] };
    }
  }

  /**
   * Top zones by order density right now (last 1 hour).
   */
  async getHotspots(limit: number = 10): Promise<Array<{
    zoneId: number;
    zoneName: string;
    orderCount: number;
    avgOrderValue: number;
  }>> {
    try {
      const [rows] = await this.mysqlPool.query(`
        SELECT
          o.zone_id,
          z.name as zone_name,
          COUNT(*) as order_count,
          AVG(o.total) as avg_order_value
        FROM orders o
        LEFT JOIN zones z ON o.zone_id = z.id
        WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
          AND o.zone_id IS NOT NULL
        GROUP BY o.zone_id, z.name
        ORDER BY order_count DESC
        LIMIT ?
      `, [limit]) as any;

      return (rows || []).map((r: any) => ({
        zoneId: r.zone_id,
        zoneName: r.zone_name || `Zone ${r.zone_id}`,
        orderCount: parseInt(r.order_count) || 0,
        avgOrderValue: Math.round((parseFloat(r.avg_order_value) || 0) * 100) / 100,
      }));
    } catch (error: any) {
      this.logger.error(`getHotspots failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Rider positioning intelligence — active riders vs pending orders per zone.
   * ridersNeeded = max(0, pendingOrders - activeRiders)
   */
  async getRiderPositioning(): Promise<{
    zones: Array<{
      zoneId: number;
      zoneName: string;
      activeRiders: number;
      pendingOrders: number;
      ridersNeeded: number;
    }>;
  }> {
    try {
      // Active riders: riders with in-progress deliveries right now
      const [riderRows] = await this.mysqlPool.query(`
        SELECT
          o.zone_id,
          z.name as zone_name,
          COUNT(DISTINCT o.rider_id) as active_riders
        FROM orders o
        LEFT JOIN zones z ON o.zone_id = z.id
        WHERE o.status IN ('accepted', 'picked_up')
          AND o.rider_id IS NOT NULL
          AND o.zone_id IS NOT NULL
          AND o.created_at >= DATE_SUB(NOW(), INTERVAL 4 HOUR)
        GROUP BY o.zone_id, z.name
      `) as any;

      // Pending orders: orders awaiting rider assignment
      const [pendingRows] = await this.mysqlPool.query(`
        SELECT
          o.zone_id,
          COUNT(*) as pending_orders
        FROM orders o
        WHERE o.status IN ('pending', 'accepted')
          AND (o.rider_id IS NULL OR o.status = 'pending')
          AND o.zone_id IS NOT NULL
          AND o.created_at >= DATE_SUB(NOW(), INTERVAL 4 HOUR)
        GROUP BY o.zone_id
      `) as any;

      // Merge rider and pending data
      const zoneMap = new Map<number, {
        zoneId: number;
        zoneName: string;
        activeRiders: number;
        pendingOrders: number;
      }>();

      for (const row of riderRows || []) {
        zoneMap.set(row.zone_id, {
          zoneId: row.zone_id,
          zoneName: row.zone_name || `Zone ${row.zone_id}`,
          activeRiders: parseInt(row.active_riders) || 0,
          pendingOrders: 0,
        });
      }

      for (const row of pendingRows || []) {
        const existing = zoneMap.get(row.zone_id);
        if (existing) {
          existing.pendingOrders = parseInt(row.pending_orders) || 0;
        } else {
          zoneMap.set(row.zone_id, {
            zoneId: row.zone_id,
            zoneName: `Zone ${row.zone_id}`,
            activeRiders: 0,
            pendingOrders: parseInt(row.pending_orders) || 0,
          });
        }
      }

      const zones = Array.from(zoneMap.values()).map(z => ({
        ...z,
        ridersNeeded: Math.max(0, z.pendingOrders - z.activeRiders),
      }));

      // Sort by riders needed descending
      zones.sort((a, b) => b.ridersNeeded - a.ridersNeeded);

      return { zones };
    } catch (error: any) {
      this.logger.error(`getRiderPositioning failed: ${error.message}`);
      return { zones: [] };
    }
  }

  private classifyDemand(orderCount: number): 'low' | 'medium' | 'high' | 'surge' {
    if (orderCount > 30) return 'surge';
    if (orderCount > 15) return 'high';
    if (orderCount >= 5) return 'medium';
    return 'low';
  }
}
