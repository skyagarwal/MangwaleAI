import { Injectable, Logger, OnModuleInit, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export interface CreateApprovalDto {
  type: string;
  title: string;
  description?: string;
  payload: Record<string, any>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  requestedBy?: string;
  assignedTo?: string;
  expiresInHours?: number;
  flowRunId?: string;
  metadata?: Record<string, any>;
}

export interface ApprovalRequest {
  id: string;
  type: string;
  title: string;
  description: string | null;
  payload: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  priority: string;
  requestedBy: string | null;
  assignedTo: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNotes: string | null;
  expiresAt: Date | null;
  flowRunId: string | null;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ApprovalService implements OnModuleInit {
  private readonly logger = new Logger(ApprovalService.name);
  private pool: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl = this.config.get('DATABASE_URL') ||
      'postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale?schema=public';

    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });

    try {
      const client = await this.pool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS approval_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          type VARCHAR(50) NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          payload JSONB NOT NULL DEFAULT '{}',
          status VARCHAR(20) DEFAULT 'pending',
          priority VARCHAR(20) DEFAULT 'normal',
          requested_by VARCHAR(100),
          assigned_to VARCHAR(100),
          decided_by VARCHAR(100),
          decided_at TIMESTAMP,
          decision_notes TEXT,
          expires_at TIMESTAMP,
          flow_run_id UUID,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_requests(status);
        CREATE INDEX IF NOT EXISTS idx_approval_type ON approval_requests(type);
        CREATE INDEX IF NOT EXISTS idx_approval_priority ON approval_requests(priority);
        CREATE INDEX IF NOT EXISTS idx_approval_assigned ON approval_requests(assigned_to);
        CREATE INDEX IF NOT EXISTS idx_approval_created ON approval_requests(created_at);
      `);
      client.release();
      this.logger.log('ApprovalService initialized');
    } catch (error: any) {
      this.logger.error(`Failed to initialize: ${error.message}`);
    }
  }

  async createRequest(dto: CreateApprovalDto): Promise<ApprovalRequest> {
    const expiresAt = dto.expiresInHours
      ? new Date(Date.now() + dto.expiresInHours * 60 * 60 * 1000)
      : null;

    const result = await this.pool.query(
      `INSERT INTO approval_requests (type, title, description, payload, priority, requested_by, assigned_to, expires_at, flow_run_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        dto.type, dto.title, dto.description || null,
        JSON.stringify(dto.payload), dto.priority || 'normal',
        dto.requestedBy || null, dto.assignedTo || null,
        expiresAt, dto.flowRunId || null,
        JSON.stringify(dto.metadata || {}),
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async approveRequest(id: string, decidedBy: string, notes?: string): Promise<ApprovalRequest> {
    const result = await this.pool.query(
      `UPDATE approval_requests
       SET status = 'approved', decided_by = $2, decided_at = NOW(), decision_notes = $3, updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id, decidedBy, notes || null],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Approval request ${id} not found or already decided`);
    }

    return this.mapRow(result.rows[0]);
  }

  async rejectRequest(id: string, decidedBy: string, reason: string): Promise<ApprovalRequest> {
    const result = await this.pool.query(
      `UPDATE approval_requests
       SET status = 'rejected', decided_by = $2, decided_at = NOW(), decision_notes = $3, updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id, decidedBy, reason],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Approval request ${id} not found or already decided`);
    }

    return this.mapRow(result.rows[0]);
  }

  async getQueue(filters?: {
    type?: string;
    status?: string;
    priority?: string;
    assignedTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: ApprovalRequest[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (filters?.type) {
      conditions.push(`type = $${paramIdx++}`);
      params.push(filters.type);
    }
    if (filters?.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(filters.status);
    } else {
      conditions.push(`status = $${paramIdx++}`);
      params.push('pending');
    }
    if (filters?.priority) {
      conditions.push(`priority = $${paramIdx++}`);
      params.push(filters.priority);
    }
    if (filters?.assignedTo) {
      conditions.push(`assigned_to = $${paramIdx++}`);
      params.push(filters.assignedTo);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const [itemsResult, countResult] = await Promise.all([
      this.pool.query(
        `SELECT * FROM approval_requests ${whereClause}
         ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, created_at DESC
         LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, limit, offset],
      ),
      this.pool.query(
        `SELECT COUNT(*) as total FROM approval_requests ${whereClause}`,
        params,
      ),
    ]);

    return {
      items: itemsResult.rows.map(this.mapRow),
      total: parseInt(countResult.rows[0].total),
    };
  }

  async getById(id: string): Promise<ApprovalRequest> {
    const result = await this.pool.query(
      `SELECT * FROM approval_requests WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Approval request ${id} not found`);
    }
    return this.mapRow(result.rows[0]);
  }

  async getStats(): Promise<{
    pending: number;
    approvedToday: number;
    rejectedToday: number;
    avgResponseTimeHours: number;
    byType: { type: string; count: number }[];
    byPriority: { priority: string; count: number }[];
  }> {
    const [pending, today, byType, byPriority, avgTime] = await Promise.all([
      this.pool.query(`SELECT COUNT(*) as count FROM approval_requests WHERE status = 'pending'`),
      this.pool.query(`
        SELECT
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
        FROM approval_requests
        WHERE DATE(decided_at) = CURRENT_DATE
      `),
      this.pool.query(`
        SELECT type, COUNT(*) as count FROM approval_requests WHERE status = 'pending' GROUP BY type
      `),
      this.pool.query(`
        SELECT priority, COUNT(*) as count FROM approval_requests WHERE status = 'pending' GROUP BY priority
      `),
      this.pool.query(`
        SELECT AVG(EXTRACT(EPOCH FROM (decided_at - created_at)) / 3600) as avg_hours
        FROM approval_requests
        WHERE decided_at IS NOT NULL AND decided_at >= NOW() - INTERVAL '7 days'
      `),
    ]);

    return {
      pending: parseInt(pending.rows[0].count),
      approvedToday: parseInt(today.rows[0]?.approved) || 0,
      rejectedToday: parseInt(today.rows[0]?.rejected) || 0,
      avgResponseTimeHours: Math.round((parseFloat(avgTime.rows[0]?.avg_hours) || 0) * 10) / 10,
      byType: byType.rows.map(r => ({ type: r.type, count: parseInt(r.count) })),
      byPriority: byPriority.rows.map(r => ({ priority: r.priority, count: parseInt(r.count) })),
    };
  }

  private mapRow(row: any): ApprovalRequest {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      payload: row.payload,
      status: row.status,
      priority: row.priority,
      requestedBy: row.requested_by,
      assignedTo: row.assigned_to,
      decidedBy: row.decided_by,
      decidedAt: row.decided_at,
      decisionNotes: row.decision_notes,
      expiresAt: row.expires_at,
      flowRunId: row.flow_run_id,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
