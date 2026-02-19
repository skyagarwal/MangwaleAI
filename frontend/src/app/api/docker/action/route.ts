import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Strict validation: only allow alphanumeric, hyphens, underscores, dots
const SAFE_CONTAINER_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, containerId } = body;

    if (!action || !containerId) {
      return NextResponse.json(
        { success: false, error: 'Missing action or containerId' },
        { status: 400 }
      );
    }

    // Validate action
    const validActions = ['start', 'stop', 'restart', 'pause', 'unpause'];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { success: false, error: `Invalid action. Valid actions: ${validActions.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate containerId to prevent command injection
    if (!SAFE_CONTAINER_ID.test(containerId) || containerId.length > 128) {
      return NextResponse.json(
        { success: false, error: 'Invalid container ID format' },
        { status: 400 }
      );
    }

    // Use execFile (not exec) to prevent shell injection
    try {
      const { stdout, stderr } = await execFileAsync('docker', [action, containerId]);

      return NextResponse.json({
        success: true,
        action,
        containerId,
        message: `Container ${action} command executed successfully`,
        output: stdout || stderr,
      });
    } catch (execError: unknown) {
      const error = execError as { message?: string };
      return NextResponse.json(
        { success: false, error: `Docker command failed: ${error.message || 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Docker action failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to execute Docker action' },
      { status: 500 }
    );
  }
}
