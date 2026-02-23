import { Module } from '@nestjs/common';
import { CartBuilderService } from './cart-builder.service';
import { CartController } from './cart.controller';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [SearchModule],
  controllers: [CartController],
  providers: [CartBuilderService],
  exports: [CartBuilderService],
})
export class CartModule {}
