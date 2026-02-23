import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import * as mysql from 'mysql2/promise';

@Injectable()
export class DemandForecastService implements OnModuleInit {
  private readonly logger = new Logger(DemandForecastService.name);
  private pgPool: Pool;
  private mysqlPool: mysql.Pool;
  private environmentalContext: any = null; // EnvironmentalContextService (resolved at init)

  private readonly WEATHER_MULTIPLIERS: Record<string, number> = {
    rainy: 1.3,
    stormy: 0.7,
    hot: 1.2, // extreme heat
    clear: 1.0,
    cloudy: 1.05,
    cold: 1.15,
  };

  constructor(
    private readonly config: ConfigService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit() {
    const databaseUrl = this.config.get('DATABASE_URL') ||
      'postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale?schema=public';
    this.pgPool = new Pool({ connectionString: databaseUrl, max: 5 });

    this.mysqlPool = mysql.createPool({
      host: this.config.get('PHP_DB_HOST') || '103.160.107.208',
      port: parseInt(this.config.get('PHP_DB_PORT') || '3307'),
      user: this.config.get('PHP_DB_USER') || 'mangwale_user',
      password: this.config.get('PHP_DB_PASSWORD') || '',
      database: this.config.get('PHP_DB_NAME') || 'mangwale_db',
      connectionLimit: 5,
    });

    try {
      const client = await this.pgPool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS demand_forecasts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          zone_id INTEGER,
          date DATE NOT NULL,
          hour INTEGER NOT NULL,
          day_of_week INTEGER,
          predicted_orders DECIMAL(8,2),
          actual_orders INTEGER,
          weather_condition VARCHAR(30),
          weather_multiplier DECIMAL(4,2) DEFAULT 1.0,
          model_version VARCHAR(20) DEFAULT 'avg_v1',
          confidence DECIMAL(4,2),
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(zone_id, date, hour)
        );
        CREATE INDEX IF NOT EXISTS idx_forecast_zone_date ON demand_forecasts(zone_id, date);
        CREATE INDEX IF NOT EXISTS idx_forecast_date ON demand_forecasts(date);
      `);
      client.release();
      this.logger.log('✅ DemandForecastService initialized');

      // Resolve EnvironmentalContextService for real weather data
      try {
        const { EnvironmentalContextService } = await import('../../context/services/user-context.service');
        this.environmentalContext = this.moduleRef.get(EnvironmentalContextService, { strict: false });
        if (this.environmentalContext) {
          this.logger.log('✅ Weather context wired from EnvironmentalContextService');
        }
      } catch {
        this.logger.debug('EnvironmentalContextService not available, using default weather multipliers');
      }
    } catch (error: any) {
      this.logger.error(`Failed to initialize: ${error.message}`);
    }
  }

  /**
   * Get hourly forecast for a zone on a date
   * Uses rolling 4-week same-day average as baseline
   */
  async getForecast(zoneId: number | null, date: string): Promise<Array<{
    hour: number;
    predictedOrders: number;
    confidence: number;
    weatherMultiplier: number;
  }>> {
    try {
      // Check for cached forecast
      const cached = await this.pgPool.query(
        `SELECT hour, predicted_orders, confidence, weather_multiplier
         FROM demand_forecasts WHERE zone_id ${zoneId ? '= $1' : 'IS NULL'} AND date = $${zoneId ? 2 : 1}
         ORDER BY hour`,
        zoneId ? [zoneId, date] : [date],
      );
      if (cached.rows.length === 24) {
        return cached.rows.map(r => ({
          hour: r.hour,
          predictedOrders: parseFloat(r.predicted_orders),
          confidence: parseFloat(r.confidence),
          weatherMultiplier: parseFloat(r.weather_multiplier),
        }));
      }

      // Compute from historical data — 4-week same-day average
      const targetDate = new Date(date);
      const dayOfWeek = targetDate.getDay(); // 0=Sunday

      const zoneFilter = zoneId ? 'AND zone_id = ?' : '';
      const params = zoneId ? [dayOfWeek, zoneId] : [dayOfWeek];

      const [rows] = await this.mysqlPool.query(`
        SELECT
          HOUR(created_at) as hour,
          COUNT(*) / COUNT(DISTINCT DATE(created_at)) as avg_orders
        FROM orders
        WHERE DAYOFWEEK(created_at) = ? + 1
          AND created_at >= DATE_SUB(NOW(), INTERVAL 28 DAY)
          AND status IN ('delivered', 'accepted', 'picked_up')
          ${zoneFilter}
        GROUP BY HOUR(created_at)
        ORDER BY hour
      `, params) as any;

      const hourlyAvg = new Map<number, number>();
      for (const r of rows) {
        hourlyAvg.set(parseInt(r.hour), parseFloat(r.avg_orders) || 0);
      }

      // Try to get real weather from EnvironmentalContextService
      let weatherMult = 1.0;
      try {
        if (this.environmentalContext) {
          // Satna, MP coordinates (default)
          const weather = await this.environmentalContext.getWeatherContext(24.5726, 80.8394);
          if (weather?.condition) {
            const condition = weather.condition.toLowerCase();
            weatherMult = this.WEATHER_MULTIPLIERS[condition] || 1.0;
            this.logger.log(`Weather: ${condition}, multiplier: ${weatherMult}`);
          }
        }
      } catch {
        this.logger.debug('Weather context unavailable, using default multiplier 1.0');
      }

      // Build 24-hour forecast
      const forecast = Array.from({ length: 24 }, (_, hour) => {
        const baseOrders = hourlyAvg.get(hour) || 0;
        const predicted = Math.round(baseOrders * weatherMult * 100) / 100;
        const confidence = baseOrders > 0 ? Math.min(0.9, 0.3 + (baseOrders / 20)) : 0.1;

        return {
          hour,
          predictedOrders: predicted,
          confidence: Math.round(confidence * 100) / 100,
          weatherMultiplier: weatherMult,
        };
      });

      // Cache forecast in PG
      for (const f of forecast) {
        await this.pgPool.query(`
          INSERT INTO demand_forecasts (zone_id, date, hour, day_of_week, predicted_orders, weather_multiplier, confidence)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (zone_id, date, hour) DO UPDATE SET
            predicted_orders = $5, weather_multiplier = $6, confidence = $7
        `, [zoneId || null, date, f.hour, dayOfWeek, f.predictedOrders, f.weatherMultiplier, f.confidence]);
      }

      return forecast;
    } catch (error: any) {
      this.logger.error(`getForecast failed: ${error.message}`);
      return Array.from({ length: 24 }, (_, hour) => ({
        hour, predictedOrders: 0, confidence: 0, weatherMultiplier: 1.0,
      }));
    }
  }

  /**
   * Get forecast vs actual comparison
   */
  async getForecastVsActual(zoneId: number | null, date: string): Promise<Array<{
    hour: number;
    predicted: number;
    actual: number;
    accuracy: number;
  }>> {
    try {
      const forecast = await this.getForecast(zoneId, date);

      // Get actual orders
      const zoneFilter = zoneId ? 'AND zone_id = ?' : '';
      const params = zoneId ? [date, zoneId] : [date];
      const [rows] = await this.mysqlPool.query(`
        SELECT HOUR(created_at) as hour, COUNT(*) as orders
        FROM orders
        WHERE DATE(created_at) = ? AND status IN ('delivered', 'accepted', 'picked_up') ${zoneFilter}
        GROUP BY HOUR(created_at)
      `, params) as any;

      const actualMap = new Map<number, number>();
      for (const r of rows) {
        actualMap.set(parseInt(r.hour), parseInt(r.orders));
      }

      // Update actuals in PG
      for (const [hour, actual] of actualMap) {
        await this.pgPool.query(
          `UPDATE demand_forecasts SET actual_orders = $1 WHERE zone_id ${zoneId ? '= $2' : 'IS NULL'} AND date = $${zoneId ? 3 : 2} AND hour = $${zoneId ? 4 : 3}`,
          zoneId ? [actual, zoneId, date, hour] : [actual, date, hour],
        );
      }

      return forecast.map(f => {
        const actual = actualMap.get(f.hour) || 0;
        const accuracy = f.predictedOrders > 0
          ? Math.max(0, Math.round((1 - Math.abs(actual - f.predictedOrders) / Math.max(f.predictedOrders, 1)) * 100))
          : actual === 0 ? 100 : 0;
        return {
          hour: f.hour,
          predicted: f.predictedOrders,
          actual,
          accuracy,
        };
      });
    } catch (error: any) {
      this.logger.error(`getForecastVsActual failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Get weather multiplier for a condition
   */
  getWeatherMultiplier(condition: string): number {
    return this.WEATHER_MULTIPLIERS[condition.toLowerCase()] || 1.0;
  }
}
