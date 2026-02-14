import { Controller, Get, Post, Body, Put, Param, Delete } from '@nestjs/common';
import { IntentsService } from '../services/intents.service';

interface IntentCreateInput {
  name: string;
  description?: string;
  examples?: string[];
  slots?: any;
}

interface IntentUpdateInput {
  name?: string;
  description?: string;
  examples?: string[];
  slots?: any;
}

@Controller('intents')
export class IntentsController {
  constructor(private readonly intentsService: IntentsService) {}

  @Get()
  findAll() {
    return this.intentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.intentsService.findOne(id);
  }

  @Post()
  create(@Body() data: IntentCreateInput) {
    return this.intentsService.create(data as any);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: IntentUpdateInput) {
    return this.intentsService.update(id, data as any);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.intentsService.remove(id);
  }
}
