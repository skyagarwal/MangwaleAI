#!/usr/bin/env npx ts-node
/**
 * IndicBERT Retraining Pipeline
 * 
 * This script exports approved training data and triggers model retraining.
 * Run weekly via cron or manually when sufficient new data is available.
 * 
 * Usage:
 *   npx ts-node scripts/retrain-indicbert.ts
 *   npx ts-node scripts/retrain-indicbert.ts --dry-run
 *   npx ts-node scripts/retrain-indicbert.ts --since 2026-01-01
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

interface TrainingSample {
  text: string;
  intent: string;
  entities: any;
  confidence: number;
  source: string;
}

interface RetrainingConfig {
  minSamples: number;
  outputDir: string;
  pythonEnv: string;
  modelName: string;
  epochs: number;
  batchSize: number;
  learningRate: number;
}

const DEFAULT_CONFIG: RetrainingConfig = {
  minSamples: 100, // Minimum new samples before retraining
  outputDir: path.join(__dirname, '../training'),
  pythonEnv: 'python3',
  modelName: 'ai4bharat/IndicBERTv2-SS',
  epochs: 3,
  batchSize: 16,
  learningRate: 2e-5,
};

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const sinceIndex = args.indexOf('--since');
  const sinceDate = sinceIndex >= 0 ? new Date(args[sinceIndex + 1]) : undefined;

  console.log('🚀 IndicBERT Retraining Pipeline');
  console.log(`   Mode: ${isDryRun ? 'DRY RUN' : 'PRODUCTION'}`);
  if (sinceDate) console.log(`   Since: ${sinceDate.toISOString()}`);
  console.log('');

  try {
    // Step 1: Get training statistics
    const stats = await getTrainingStats();
    console.log('📊 Training Data Statistics:');
    console.log(`   Total samples: ${stats.total}`);
    console.log(`   Approved: ${stats.approved}`);
    console.log(`   Pending review: ${stats.pending}`);
    console.log(`   By source: ${JSON.stringify(stats.bySource)}`);
    console.log('');

    if (stats.approved < DEFAULT_CONFIG.minSamples) {
      console.log(`⚠️ Not enough approved samples (${stats.approved} < ${DEFAULT_CONFIG.minSamples})`);
      console.log('   Waiting for more training data...');
      return;
    }

    // Step 2: Export approved training data
    console.log('📦 Exporting training data...');
    const samples = await exportTrainingData(sinceDate);
    console.log(`   Exported ${samples.length} samples`);

    // Step 3: Balance dataset (ensure each intent has minimum samples)
    const balancedSamples = balanceDataset(samples);
    console.log(`   Balanced to ${balancedSamples.length} samples`);

    // Step 4: Split into train/validation
    const { train, validation } = splitDataset(balancedSamples, 0.85);
    console.log(`   Train: ${train.length}, Validation: ${validation.length}`);

    // Step 5: Write JSONL files
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const trainFile = path.join(DEFAULT_CONFIG.outputDir, `indicbert_train_${timestamp}.jsonl`);
    const validFile = path.join(DEFAULT_CONFIG.outputDir, `indicbert_valid_${timestamp}.jsonl`);

    writeJsonl(trainFile, train);
    writeJsonl(validFile, validation);
    console.log(`   Written to: ${trainFile}`);
    console.log(`   Written to: ${validFile}`);

    if (isDryRun) {
      console.log('\n✅ DRY RUN complete. No model training performed.');
      console.log(`   Review files at: ${DEFAULT_CONFIG.outputDir}`);
      return;
    }

    // Step 6: Trigger Python training script
    console.log('\n🧠 Starting model training...');
    const trainCommand = buildTrainCommand(trainFile, validFile, timestamp);
    console.log(`   Command: ${trainCommand}`);

    try {
      execSync(trainCommand, { stdio: 'inherit', cwd: DEFAULT_CONFIG.outputDir });
      console.log('\n✅ Training complete!');

      // Step 7: Update model version
      await updateModelVersion(timestamp);

    } catch (trainError: any) {
      console.error(`\n❌ Training failed: ${trainError.message}`);
      console.log('   Check training logs for details.');
    }

    // Step 8: Generate report
    await generateReport(stats, samples.length, timestamp);

  } catch (error: any) {
    console.error(`❌ Pipeline failed: ${error.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function getTrainingStats() {
  const [total, approved, pending] = await Promise.all([
    prisma.nluTrainingData.count(),
    prisma.nluTrainingData.count({ where: { reviewStatus: 'approved' } }),
    prisma.nluTrainingData.count({ where: { reviewStatus: 'pending' } }),
  ]);

  const sourceGroups = await prisma.nluTrainingData.groupBy({
    by: ['source'],
    _count: { id: true },
    where: { reviewStatus: 'approved' },
  });

  const bySource: Record<string, number> = {};
  sourceGroups.forEach(g => { bySource[g.source] = g._count.id; });

  return { total, approved, pending, bySource };
}

async function exportTrainingData(sinceDate?: Date): Promise<TrainingSample[]> {
  const where: any = { reviewStatus: 'approved' };
  if (sinceDate) {
    where.createdAt = { gte: sinceDate };
  }

  const samples = await prisma.nluTrainingData.findMany({
    where,
    select: {
      text: true,
      intent: true,
      entities: true,
      confidence: true,
      source: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return samples.map(s => ({
    text: s.text,
    intent: s.intent,
    entities: typeof s.entities === 'string' ? JSON.parse(s.entities) : s.entities,
    confidence: s.confidence,
    source: s.source,
  }));
}

function balanceDataset(samples: TrainingSample[]): TrainingSample[] {
  // Group by intent
  const byIntent: Record<string, TrainingSample[]> = {};
  samples.forEach(s => {
    if (!byIntent[s.intent]) byIntent[s.intent] = [];
    byIntent[s.intent].push(s);
  });

  // Find median count
  const counts = Object.values(byIntent).map(arr => arr.length);
  counts.sort((a, b) => a - b);
  const targetCount = counts[Math.floor(counts.length / 2)] || 50;
  const minCount = Math.min(10, Math.min(...counts));
  const maxCount = Math.max(targetCount * 2, 100);

  // Balance: undersample large classes, keep small classes as-is
  const balanced: TrainingSample[] = [];
  for (const [intent, intentSamples] of Object.entries(byIntent)) {
    if (intentSamples.length <= maxCount) {
      balanced.push(...intentSamples);
    } else {
      // Random undersample
      const shuffled = intentSamples.sort(() => Math.random() - 0.5);
      balanced.push(...shuffled.slice(0, maxCount));
    }
  }

  return balanced.sort(() => Math.random() - 0.5); // Shuffle final dataset
}

function splitDataset(samples: TrainingSample[], trainRatio: number) {
  const shuffled = [...samples].sort(() => Math.random() - 0.5);
  const splitIdx = Math.floor(shuffled.length * trainRatio);
  return {
    train: shuffled.slice(0, splitIdx),
    validation: shuffled.slice(splitIdx),
  };
}

function writeJsonl(filepath: string, samples: TrainingSample[]) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const lines = samples.map(s => JSON.stringify({
    text: s.text,
    intent: s.intent,
    entities: s.entities,
  }));

  fs.writeFileSync(filepath, lines.join('\n'));
}

function buildTrainCommand(trainFile: string, validFile: string, version: string): string {
  const outputDir = path.join(DEFAULT_CONFIG.outputDir, `model_${version}`);
  
  return [
    DEFAULT_CONFIG.pythonEnv,
    'train_indicbert.py',
    `--train_file ${trainFile}`,
    `--valid_file ${validFile}`,
    `--output_dir ${outputDir}`,
    `--model_name ${DEFAULT_CONFIG.modelName}`,
    `--epochs ${DEFAULT_CONFIG.epochs}`,
    `--batch_size ${DEFAULT_CONFIG.batchSize}`,
    `--learning_rate ${DEFAULT_CONFIG.learningRate}`,
  ].join(' ');
}

async function updateModelVersion(version: string) {
  // Update version in database or config
  console.log(`   Updated model version to: ${version}`);
  
  // Could also update a config file or database record
  const versionFile = path.join(DEFAULT_CONFIG.outputDir, 'current_version.txt');
  fs.writeFileSync(versionFile, version);
}

async function generateReport(stats: any, exportedCount: number, version: string) {
  const report = {
    timestamp: new Date().toISOString(),
    version,
    stats,
    exportedSamples: exportedCount,
    config: DEFAULT_CONFIG,
  };

  const reportFile = path.join(DEFAULT_CONFIG.outputDir, `retrain_report_${version}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report saved to: ${reportFile}`);
}

main();
