import { Controller, Get, Post, Body, Param, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Controller('docker')
export class DockerController {
  private readonly logger = new Logger(DockerController.name);

  @Get('containers')
  async getContainers() {
    try {
      const { stdout } = await execAsync(
        'docker ps -a --format \'{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","status":"{{.Status}}","state":"{{.State}}","ports":"{{.Ports}}","created":"{{.CreatedAt}}"}\' 2>/dev/null',
        { timeout: 10000 },
      );
      const containers = stdout.trim().split('\n').filter(Boolean).map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
      return { success: true, containers };
    } catch (error) {
      this.logger.warn(`Docker not available: ${error.message}`);
      return { success: false, containers: [], error: 'Docker not available' };
    }
  }

  @Get('logs/:containerId')
  async getContainerLogs(@Param('containerId') containerId: string) {
    try {
      const safeId = containerId.replace(/[^a-zA-Z0-9_-]/g, '');
      const { stdout } = await execAsync(
        `docker logs --tail 100 ${safeId} 2>&1`,
        { timeout: 10000 },
      );
      return { success: true, logs: stdout };
    } catch (error) {
      return { success: false, logs: '', error: error.message };
    }
  }

  @Post('action')
  async containerAction(@Body() body: { containerId: string; action: string }) {
    const safeId = body.containerId.replace(/[^a-zA-Z0-9_-]/g, '');
    const allowedActions = ['start', 'stop', 'restart'];
    if (!allowedActions.includes(body.action)) {
      return { success: false, error: `Invalid action. Allowed: ${allowedActions.join(', ')}` };
    }
    try {
      await execAsync(`docker ${body.action} ${safeId}`, { timeout: 30000 });
      return { success: true, message: `Container ${safeId} ${body.action}ed` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
