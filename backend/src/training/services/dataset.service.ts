import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';

interface Dataset {
  id: string;
  name: string;
  type: string; // 'nlu', 'image', 'text', 'audio'
  description: string;
  filePath?: string;
  size: number;
  recordCount: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class DatasetService {
  private readonly logger = new Logger(DatasetService.name);
  private datasets: Map<string, Dataset> = new Map();
  private readonly datasetsDir = '/tmp/datasets'; // In production, use configurable path

  constructor(private readonly prisma: PrismaService) {
    this.ensureDatasetsDir();
  }

  private async ensureDatasetsDir(): Promise<void> {
    try {
      await fs.mkdir(this.datasetsDir, { recursive: true });
    } catch (error) {
      this.logger.error(`Failed to create datasets directory: ${error.message}`);
    }
  }

  async getDatasets(): Promise<Dataset[]> {
    return Array.from(this.datasets.values());
  }

  async getDataset(id: string): Promise<Dataset | null> {
    return this.datasets.get(id) || null;
  }

  async createDataset(datasetInfo: any, file?: Express.Multer.File): Promise<Dataset> {
    const id = `dataset-${Date.now()}`;

    let filePath: string | undefined;
    let size = 0;

    if (file) {
      filePath = path.join(this.datasetsDir, `${id}-${file.originalname}`);
      await fs.writeFile(filePath, file.buffer);
      size = file.size;
    }

    const dataset: Dataset = {
      id,
      name: datasetInfo.name,
      type: datasetInfo.type,
      description: datasetInfo.description || '',
      filePath,
      size,
      recordCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.datasets.set(id, dataset);
    this.logger.log(`Created dataset: ${dataset.name} (${id})`);

    return dataset;
  }

  async uploadFile(id: string, file: Express.Multer.File): Promise<Dataset | null> {
    const dataset = this.datasets.get(id);
    if (!dataset) {
      return null;
    }

    const filePath = path.join(this.datasetsDir, `${id}-${file.originalname}`);
    await fs.writeFile(filePath, file.buffer);

    dataset.filePath = filePath;
    dataset.size = file.size;
    dataset.updatedAt = new Date();

    return dataset;
  }

  async getStats(id: string): Promise<any> {
    const dataset = this.datasets.get(id);
    if (!dataset) {
      return null;
    }

    return {
      id: dataset.id,
      name: dataset.name,
      type: dataset.type,
      size: dataset.size,
      recordCount: dataset.recordCount,
      createdAt: dataset.createdAt,
      updatedAt: dataset.updatedAt,
      stats: this.calculateDatasetStats(dataset),
    };
  }

  async getExamples(datasetId: string): Promise<any[]> {
    const dataset = this.datasets.get(datasetId);

    try {
      const rows = await this.prisma.nluTrainingData.findMany({
        where: {
          reviewStatus: { in: ['approved', 'pending', 'auto_approved'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });

      return rows.map(r => ({
        id: r.id,
        text: r.text,
        intent: r.intent,
        entities: r.entities,
        confidence: r.confidence,
        source: r.source,
        reviewStatus: r.reviewStatus,
        language: r.language,
        createdAt: r.createdAt,
      }));
    } catch (error) {
      this.logger.error(`Failed to get examples for dataset ${datasetId}: ${error.message}`);
      return [];
    }
  }

  async addExamples(datasetId: string, examples: { text: string; intent: string; entities?: any }[]): Promise<{ added: number; skipped: number }> {
    let added = 0;
    let skipped = 0;

    for (const ex of examples) {
      try {
        await this.prisma.nluTrainingData.create({
          data: {
            text: ex.text,
            intent: ex.intent,
            entities: ex.entities || {},
            confidence: 1.0,
            source: 'manual',
            reviewStatus: 'approved',
            language: 'en',
          },
        });
        added++;
      } catch (error) {
        // Unique constraint on text — skip duplicates
        if (error.code === 'P2002') {
          skipped++;
        } else {
          this.logger.error(`Failed to add example "${ex.text}": ${error.message}`);
          skipped++;
        }
      }
    }

    // Update dataset record count
    const dataset = this.datasets.get(datasetId);
    if (dataset) {
      dataset.recordCount += added;
      dataset.updatedAt = new Date();
    }

    this.logger.log(`Bulk add to dataset ${datasetId}: ${added} added, ${skipped} skipped`);
    return { added, skipped };
  }

  async deleteDataset(id: string): Promise<boolean> {
    const dataset = this.datasets.get(id);
    if (!dataset) {
      return false;
    }

    // Clean up file if exists
    if (dataset.filePath) {
      try {
        await fs.unlink(dataset.filePath);
      } catch {
        // File may already be gone
      }
    }

    this.datasets.delete(id);
    this.logger.log(`Deleted dataset: ${id}`);
    return true;
  }

  private calculateDatasetStats(dataset: Dataset): any {
    return {
      format: 'json',
      encoding: 'utf-8',
      sampleCount: dataset.recordCount,
    };
  }
}
