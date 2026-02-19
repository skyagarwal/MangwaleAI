import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { firstValueFrom } from 'rxjs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class LabelStudioService {
  private readonly logger = new Logger(LabelStudioService.name);
  private readonly labelStudioUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.labelStudioUrl = this.config.get('LABEL_STUDIO_URL', 'http://localhost:8080');
    this.apiKey = this.config.get('LABEL_STUDIO_API_KEY', '');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.labelStudioUrl}/api/health`, {
          headers: this.getHeaders(),
        }),
      );
      return response.status === 200;
    } catch (error) {
      this.logger.warn('Label Studio health check failed');
      return false;
    }
  }

  async getProjects(): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.labelStudioUrl}/api/projects`, {
          headers: this.getHeaders(),
        }),
      );
      return response.data.results || [];
    } catch (error) {
      this.logger.error(`Failed to get Label Studio projects: ${error.message}`);
      return [];
    }
  }

  async createProject(projectData: any): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.labelStudioUrl}/api/projects`,
          projectData,
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create Label Studio project: ${error.message}`);
      throw error;
    }
  }

  async exportData(projectId: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.labelStudioUrl}/api/projects/${projectId}/export`,
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to export Label Studio data: ${error.message}`);
      throw error;
    }
  }

  async syncData(projectId: string = '1'): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`Starting Label Studio sync for project ${projectId}...`);

      // Execute the sync script
      const { stdout, stderr } = await execAsync(`npm run label-studio:sync -- --project-id ${projectId}`);

      this.logger.log(`Sync output: ${stdout}`);
      if (stderr) this.logger.warn(`Sync stderr: ${stderr}`);

      return {
        success: true,
        message: 'Sync completed successfully',
      };
    } catch (error) {
      this.logger.error(`Sync failed: ${error.message}`);
      return {
        success: false,
        message: `Sync failed: ${error.message}`,
      };
    }
  }

  async pushDatasetToLabelStudio(datasetId: string): Promise<{ projectId: number; pushed: number }> {
    const projectId = 3; // NLU Intent Classification project

    // Get pending-review examples from DB
    const examples = await this.prisma.nluTrainingData.findMany({
      where: { reviewStatus: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    if (examples.length === 0) {
      this.logger.log('No pending examples to push to Label Studio');
      return { projectId, pushed: 0 };
    }

    // Format as Label Studio tasks
    const tasks = examples.map(ex => ({
      data: {
        text: ex.text,
        intent: ex.intent,
        confidence: ex.confidence,
        source: ex.source,
        db_id: ex.id,
      },
    }));

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.labelStudioUrl}/api/projects/${projectId}/import`,
          tasks,
          { headers: this.getHeaders() },
        ),
      );

      const pushed = response.data?.task_count ?? tasks.length;
      this.logger.log(`Pushed ${pushed} tasks to Label Studio project #${projectId}`);
      return { projectId, pushed };
    } catch (error) {
      this.logger.error(`Failed to push to Label Studio: ${error.message}`);
      throw error;
    }
  }

  async pullAnnotationsFromLabelStudio(datasetId: string): Promise<{ imported: number }> {
    const projectId = 3;

    try {
      // Get all tasks with annotations
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.labelStudioUrl}/api/projects/${projectId}/tasks`,
          {
            headers: this.getHeaders(),
            params: { fields: 'all', page_size: 500 },
          },
        ),
      );

      const tasks = response.data?.tasks || response.data || [];
      let imported = 0;

      for (const task of tasks) {
        // Only process tasks that have been annotated
        if (!task.annotations || task.annotations.length === 0) continue;

        const latestAnnotation = task.annotations[task.annotations.length - 1];
        const results = latestAnnotation.result || [];

        // Extract the chosen intent from the annotation
        let annotatedIntent: string | null = null;
        for (const result of results) {
          if (result.type === 'choices' && result.value?.choices?.length > 0) {
            annotatedIntent = result.value.choices[0];
            break;
          }
          if (result.type === 'taxonomy' && result.value?.taxonomy?.length > 0) {
            annotatedIntent = result.value.taxonomy[0][0];
            break;
          }
        }

        if (!annotatedIntent) continue;

        const taskText = task.data?.text;
        if (!taskText) continue;

        // Update the training data record
        try {
          await this.prisma.nluTrainingData.updateMany({
            where: { text: taskText },
            data: {
              intent: annotatedIntent,
              reviewStatus: 'approved',
              approved_at: new Date(),
              approved_by: 'label-studio',
            },
          });
          imported++;
        } catch (error) {
          this.logger.warn(`Failed to update example "${taskText.substring(0, 50)}": ${error.message}`);
        }
      }

      this.logger.log(`Pulled ${imported} annotations from Label Studio project #${projectId}`);
      return { imported };
    } catch (error) {
      this.logger.error(`Failed to pull from Label Studio: ${error.message}`);
      throw error;
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Token ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }
}
