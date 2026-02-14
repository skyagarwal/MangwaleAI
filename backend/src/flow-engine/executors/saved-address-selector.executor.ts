import { Injectable, Logger } from '@nestjs/common';
import { PhpAddressService } from '../../php-integration/services/php-address.service';
import { SessionService } from '../../session/session.service';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';

/**
 * Saved Address Selector Executor
 * 
 * Auto-selects a saved address (home/office) based on user's message hint.
 * Used when user says "order to my home address" or "deliver to office"
 */
@Injectable()
export class SavedAddressSelectorExecutor implements ActionExecutor {
  readonly name = 'saved_address_selector';
  private readonly logger = new Logger(SavedAddressSelectorExecutor.name);

  constructor(
    private readonly phpAddressService: PhpAddressService,
    private readonly sessionService: SessionService,
  ) {}

  async execute(
    config: Record<string, any>,
    context: FlowContext
  ): Promise<ActionExecutionResult> {
    try {
      const addressTypeHint = (config.addressTypeHint as string) || context.data._user_message || '';
      const saveToContext = (config.saveToContext as string) || 'delivery_address';
      
      this.logger.log(`🏠 Auto-selecting saved address from hint: "${addressTypeHint}"`);
      
      // Get session for auth token
      const session = await this.sessionService.getSession(context._system.sessionId);
      const authToken = session?.data?.auth_token;
      const userId = session?.data?.user_id;
      
      if (!authToken || !userId) {
        this.logger.warn('⚠️ User not authenticated - skipping saved address selection');
        return {
          success: true, // This is a valid outcome, not a failure
          output: null,
          event: 'no_saved_address', // Will transition to request_location
          // No error - this is expected for guest users
        };
      }
      
      // Fetch saved addresses
      const savedAddresses = await this.phpAddressService.getAddresses(authToken);
      
      if (!savedAddresses || savedAddresses.length === 0) {
        this.logger.warn('⚠️ User has no saved addresses');
        return {
          success: false,
          output: null,
          event: 'no_saved_address',
          error: 'No saved addresses found',
        };
      }
      
      this.logger.log(`📍 Found ${savedAddresses.length} saved addresses`);
      
      // Determine which type of address user wants
      const hintLower = addressTypeHint.toLowerCase();
      let preferredType = 'home'; // Default to home
      
      if (/office|work|daftar|karyalay/i.test(hintLower)) {
        preferredType = 'office';
      } else if (/home|ghar|house|makaan/i.test(hintLower)) {
        preferredType = 'home';
      }
      
      this.logger.log(`🎯 Looking for address type: ${preferredType}`);
      
      // Find matching address by type
      let selectedAddress = savedAddresses.find(addr => 
        addr.addressType?.toLowerCase() === preferredType
      );
      
      // If not found by exact type, try partial match
      if (!selectedAddress) {
        selectedAddress = savedAddresses.find(addr => 
          addr.addressType?.toLowerCase().includes(preferredType) ||
          preferredType.includes(addr.addressType?.toLowerCase() || '')
        );
      }
      
      // If still not found, use the first saved address
      if (!selectedAddress) {
        this.logger.log(`⚠️ No "${preferredType}" address found, using first saved address`);
        selectedAddress = savedAddresses[0];
      }
      
      // Validate that address has coordinates
      if (!selectedAddress.latitude || !selectedAddress.longitude) {
        this.logger.warn(`⚠️ Selected address has no coordinates: ${JSON.stringify(selectedAddress)}`);
        return {
          success: false,
          output: null,
          event: 'no_saved_address',
          error: 'Selected address has no coordinates',
        };
      }
      
      this.logger.log(`✅ Auto-selected "${selectedAddress.addressType}" address: ${selectedAddress.address?.substring(0, 50)}...`);
      
      // Format the address object
      const formattedAddress = {
        address: selectedAddress.address,
        lat: parseFloat(selectedAddress.latitude),
        lng: parseFloat(selectedAddress.longitude),
        addressType: selectedAddress.addressType,
        landmark: selectedAddress.landmark,
        id: selectedAddress.id,
        auto_selected: true,
        source: 'saved_address',
      };
      
      // Save to context
      context.data[saveToContext] = formattedAddress;
      context.data._selected_address_type = selectedAddress.addressType;
      
      return {
        success: true,
        output: formattedAddress,
        event: 'address_selected',
      };
      
    } catch (error) {
      this.logger.error(`❌ Error selecting saved address: ${error.message}`, error.stack);
      return {
        success: false,
        output: null,
        event: 'no_saved_address',
        error: error.message,
      };
    }
  }
}
