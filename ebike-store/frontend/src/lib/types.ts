export interface Me { id: number; email: string; full_name: string | null; phone: string | null; role: string; permissions: string[] }
export interface Category { id: number; name: string; slug: string; description: string | null; image_url: string | null; product_count: number }
export interface Specs {
  motor_power_w: number | null; battery_wh: number | null; range_km: number | null; max_speed_kmh: number | null; charge_hours: number | null
  frame_material: string | null; wheel_size: string | null; weight_kg: number | null; brakes: string | null; suspension: string | null
  colors: string[]; warranty: string | null
}
export interface ProductImage { id: number; url: string; alt_text: string; is_primary: boolean; position: number }
export interface ProductCardData {
  id: number; slug: string; name: string; price_minor: number; original_price_minor: number | null; currency: string
  category: { name: string; slug: string } | null; image_url: string | null; stock_status: 'in_stock' | 'low_stock' | 'out_of_stock'
  available_quantity: number; is_featured: boolean; range_km: number | null; motor_power_w: number | null
}
export interface ProductDetailData extends ProductCardData { description: string; sku: string; images: ProductImage[]; specs: Specs | null; related?: ProductCardData[] }
export interface AdminProduct extends ProductDetailData {
  is_published: boolean; is_archived: boolean; category_id: number | null; stock_quantity: number; low_stock_threshold: number; updated_at: string | null
}
export interface Paged<T> { items: T[]; total: number; page: number; page_size: number; pages: number }
export interface CartItem { product_id: number; slug: string | null; name: string; image_url: string | null; unit_price_minor: number; quantity: number; line_total_minor: number; available: number; issue: string | null }
export interface Cart { items: CartItem[]; subtotal_minor: number; item_count: number; currency: string; checkout_ready: boolean }
export interface Quote { subtotal_minor: number; discount_minor: number; shipping_minor: number; tax_minor: number; total_minor: number; currency: string; discount_code: string | null; checkout_ready: boolean; items: CartItem[] }
export interface OrderItem { product_name: string; sku: string; image_url: string | null; unit_price_minor: number; quantity: number; line_total_minor: number }
export interface Order {
  number: string; status: string; payment_status: string; currency: string; subtotal_minor: number; discount_minor: number; shipping_minor: number
  tax_minor: number; total_minor: number; discount_code: string | null; shipping_method: string; created_at: string; paid_at: string | null
  items: OrderItem[]; shipping_address: { full_name: string; line1: string; line2: string | null; city: string; region: string; country: string; postal_code: string | null }
  tracking: { carrier: string | null; tracking_number: string | null } | null
  email?: string; phone?: string; customer_name?: string; payments?: { provider: string; status: string; amount_minor: number; failure_reason: string | null; provider_ref: string }[]
}
export interface Address { id: number; label: string | null; full_name: string; phone: string | null; line1: string; line2: string | null; city: string; region: string; country: string; postal_code: string | null }
export interface Review { rating: number; title: string | null; body: string; author: string; created_at: string; product_name?: string; product_slug?: string }
