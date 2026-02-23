import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { CartBuilderService, NERCartItem } from './cart-builder.service';

interface BuildCartBody {
  cart_items: NERCartItem[];
  store_name?: string;
  store_id?: number;
  zone_id?: number;
  module_id?: number;
}

@Controller('v3/cart')
@ApiTags('Cart')
export class CartController {
  private readonly logger = new Logger(CartController.name);

  constructor(private readonly cartBuilder: CartBuilderService) {}

  @Post('/build')
  @ApiOperation({
    summary: 'Build cart from NER items',
    description: 'Takes NER extracted cart items and matches them to actual products with prices',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        cart_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item: { type: 'string', example: 'roti' },
              quantity: { type: 'number', example: 5 },
            },
          },
        },
        store_name: { type: 'string', example: 'inayat' },
        zone_id: { type: 'number', example: 4 },
        module_id: { type: 'number', example: 4 },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Cart built successfully' })
  async buildCart(@Body() body: BuildCartBody) {
    this.logger.log(`🛒 Building cart: ${JSON.stringify(body)}`);
    
    const cartItems = body.cart_items || [];
    this.logger.log(`🛒 Cart items: ${cartItems.length}`);

    const cart = await this.cartBuilder.buildCart(cartItems, {
      store_id: body.store_id,
      store_name: body.store_name,
      zone_id: body.zone_id || 4,
      module_id: body.module_id || 4,
    });

    return this.cartBuilder.formatCartResponse(cart);
  }
}
