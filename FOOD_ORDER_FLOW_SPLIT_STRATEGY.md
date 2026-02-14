# 🍕 Food Order Flow Split Strategy

## Current State
- **File**: `backend/src/flow-engine/flows/food-order.flow.ts`
- **Size**: 3,979 lines
- **States**: 485 states
- **Complexity**: Very High

## Split Strategy

### Approach: Modular State Definitions
Instead of one monolithic file, split into logical modules that export state objects, then merge them in the main flow file.

### Module Structure

```
food-order/
├── intro-states.ts          ✅ Created - Intro, express order, greeting
├── location-states.ts       ✅ Created - Location & address handling
├── search-states.ts         ⏳ TODO - Search, browse, recommendations
├── selection-states.ts      ⏳ TODO - Item selection, cart management
├── checkout-states.ts       ⏳ TODO - Auth, address collection, payment
├── order-states.ts          ⏳ TODO - Order placement, completion, errors
└── index.ts                 ⏳ TODO - Merge all states into main flow
```

### State Groups (485 total states)

#### 1. Intro & Express Order (~50 states) ✅
- `check_trigger`
- `detect_express_order`
- `check_if_express_order`
- `express_order_flow`
- `greet_user`
- `understand_request`
- `check_search_query_exists`

#### 2. Location & Address (~15 states) ✅
- `save_original_query`
- `check_saved_address_intent`
- `check_existing_location`
- `auto_select_saved_address`
- `use_saved_address_location`
- `check_location`
- `request_location`
- `confirm_location_received`
- `handle_location_response`
- `parse_and_restore`
- `restore_original_query`
- `extract_location_from_text`

#### 3. Search & Browse (~150 states) ⏳
- `search_food`
- `search_food_with_restaurant`
- `show_results`
- `show_categories`
- `show_partner_stores`
- `show_recommendations`
- `search_fastest_delivery`
- `merge_nlu_with_llm`
- `build_search_query`
- `ask_what_to_eat`
- `process_specific_food`
- `check_restaurant_filter`
- `show_restaurant_not_found`
- `show_external_vendor_found`
- `handle_external_vendor_response`
- `check_external_vendor_confirmation`
- `setup_external_vendor_pickup`
- `offer_custom_pickup_manual`
- `handle_custom_pickup_location`
- `save_custom_pickup_location`
- `confirm_custom_pickup_location`
- `analyze_no_results`
- `check_custom_offer`
- `search_external_vendor`
- `show_external_results`
- `handle_external_selection`
- `check_external_selection`
- `confirm_external_pickup`
- `collect_external_order_items`
- ... (many more search-related states)

#### 4. Selection & Cart (~100 states) ⏳
- `select_item`
- `add_to_cart`
- `show_cart`
- `modify_cart`
- `remove_from_cart`
- `update_quantity`
- `clear_cart`
- `show_item_details`
- `select_variant`
- `add_special_instructions`
- ... (cart management states)

#### 5. Checkout & Auth (~80 states) ⏳
- `check_auth_for_checkout`
- `request_phone`
- `parse_phone`
- `send_otp`
- `verify_otp`
- `check_otp`
- `otp_retry`
- `otp_error`
- `collect_address`
- `parse_delivery_address`
- `confirm_delivery_address`
- `ask_new_delivery_address`
- `validate_zone`
- `check_zone`
- ... (auth and address collection states)

#### 6. Order Placement (~90 states) ⏳
- `calculate_distance`
- `calculate_pricing`
- `calculate_custom_distance`
- `calculate_custom_pricing`
- `show_summary`
- `show_custom_summary`
- `check_final_confirmation`
- `place_order`
- `create_simple_parcel_order`
- `confirm_parcel_delivery_address`
- `route_parcel_confirmation`
- `completed`
- `cancelled`
- `address_error`
- `out_of_zone`
- `distance_error`
- `order_failed`
- ... (order placement and error states)

## Implementation Steps

### Step 1: Create State Modules ✅ (Partial)
- [x] Create `intro-states.ts`
- [x] Create `location-states.ts`
- [ ] Create `search-states.ts`
- [ ] Create `selection-states.ts`
- [ ] Create `checkout-states.ts`
- [ ] Create `order-states.ts`

### Step 2: Extract States from Main File
For each module:
1. Identify all states in that category
2. Copy state definitions to module file
3. Ensure all transitions reference correct state names
4. Export as `Record<string, FlowState>`

### Step 3: Create Merge File
Create `food-order/index.ts` that:
1. Imports all state modules
2. Merges them into a single states object
3. Exports the complete `foodOrderFlow` definition

### Step 4: Update Main Flow File
Replace `food-order.flow.ts` with:
```typescript
export { foodOrderFlow } from './food-order';
```

### Step 5: Update Flow Index
Ensure `flows/index.ts` still imports correctly.

## Benefits

1. **Maintainability**: Each module is ~200-800 lines instead of 3,979
2. **Clarity**: Clear separation of concerns
3. **Testability**: Can test each module independently
4. **Collaboration**: Multiple developers can work on different modules
5. **Reusability**: States can be reused in other flows if needed

## Challenges

1. **State Dependencies**: States reference each other via transitions
2. **Context Schema**: Shared across all states
3. **Testing**: Need to ensure all transitions still work
4. **Migration**: Need to carefully extract without breaking anything

## Next Steps

1. Complete extraction of remaining state modules
2. Create merge file
3. Test thoroughly
4. Update documentation

## Estimated Time

- **Current Progress**: 2/6 modules (33%)
- **Remaining Work**: ~4-6 hours for careful extraction and testing
- **Risk Level**: Medium (requires careful state transition validation)

---

**Status**: In Progress (2/6 modules created)
**Last Updated**: February 6, 2026
