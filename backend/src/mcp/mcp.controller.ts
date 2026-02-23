import { Controller, Get, Post, Req, Res, Logger, HttpCode } from '@nestjs/common';
import { Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { McpServerService } from './services/mcp-server.service';

/**
 * MCP Controller — HTTP+SSE Transport for AI Agent Access
 *
 * Endpoints:
 *   GET  /mcp/sse      → Establish SSE stream (AI client connects here)
 *   POST /mcp/messages  → Send JSON-RPC messages (tool calls)
 *
 * Usage by AI clients (Claude, ChatGPT, Gemini):
 * 1. Client connects to GET /mcp/sse → receives SSE stream with endpoint URL
 * 2. Client sends tool calls via POST /mcp/messages?sessionId=X
 * 3. Server responds via the SSE stream
 *
 * Example with Claude Desktop:
 * {
 *   "mcpServers": {
 *     "mangwale": {
 *       "url": "https://your-domain.com/mcp/sse"
 *     }
 *   }
 * }
 */
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);
  private readonly transports = new Map<string, SSEServerTransport>();

  constructor(private readonly mcpServer: McpServerService) {}

  /**
   * SSE endpoint — AI client connects here to establish a persistent stream
   */
  @Get('sse')
  async handleSse(@Req() req: Request, @Res() res: Response): Promise<void> {
    this.logger.log(`MCP SSE connection from ${req.ip}`);

    // Create a new MCP server + SSE transport for this connection
    const server = this.mcpServer.createServer();
    const transport = new SSEServerTransport('/mcp/messages', res as any);

    // Store transport by session ID for message routing
    this.transports.set(transport.sessionId, transport);
    this.logger.log(`MCP session created: ${transport.sessionId}`);

    // Clean up on disconnect
    transport.onclose = () => {
      this.transports.delete(transport.sessionId);
      this.logger.log(`MCP session closed: ${transport.sessionId}`);
    };

    // Connect the MCP server to this transport (starts the SSE stream)
    await server.connect(transport);
  }

  /**
   * Messages endpoint — AI client sends JSON-RPC tool calls here
   */
  @Post('messages')
  @HttpCode(200)
  async handleMessages(@Req() req: Request, @Res() res: Response): Promise<void> {
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      res.status(400).json({ error: 'sessionId query parameter is required' });
      return;
    }

    const transport = this.transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: 'Session not found. Connect to /mcp/sse first.' });
      return;
    }

    // Route the message through the SSE transport
    await transport.handlePostMessage(req as any, res as any);
  }

  /**
   * Health check — returns server info and available tools count
   */
  @Get('health')
  getHealth(): any {
    return {
      status: 'ok',
      server: 'mangwale-commerce',
      version: '1.0.0',
      protocol: 'MCP (Model Context Protocol)',
      tools: 11,
      active_sessions: this.transports.size,
      endpoints: {
        sse: '/mcp/sse',
        messages: '/mcp/messages',
      },
      documentation: 'https://modelcontextprotocol.io',
    };
  }
}
