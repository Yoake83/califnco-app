export type Role = 'Customer' | 'Dealer';
export type Category = 'Purifiers' | 'Dispensers' | 'Pumps' | 'Filters' | 'Spares';
export type Approval = 'pending' | 'approved' | 'rejected';
export type OrderStatus = 'Confirmed' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
export interface Product { id: string; name: string; category: Category; description: string; image: string; retail: number; wholesale: number | null; stock: number; minBulk: number; }
export { validateProduct } from './catalog';
export type { CatalogDraft, CatalogProduct } from './catalog';
export interface Profile { id: string; name: string; email: string; role: Role; approval: Approval; phone: string; address: string; businessName?: string; }
export { normalizeRegistration, validateNewPassword } from './registration';
export type { RegistrationInput } from './registration';
export interface CartItem { productId: string; quantity: number; }
export interface CommerceOrder {
  id: string; userId: string; customer: string; role: Role;
  items: (CartItem & { name: string; unitPrice: number })[];
  total: number; address: string; phone: string; status: string;
  paymentState: 'pending' | 'paid' | 'cancelled' | 'expired' | 'refund_pending' | 'refunded'; paymentMode: 'test';
  razorpayOrderId?: string; paymentId?: string; paymentLease?: string; paymentLeaseUntil?: string;
  createdAt: string; updatedAt: string; expiresAt: string; inventoryHeld: boolean; fingerprint: string;
}
export interface Order { id: string; userId: string; customer: string; role: Role; items: (CartItem & { name: string; unitPrice: number })[]; total: number; address: string; phone: string; status: OrderStatus; createdAt: string; payment: 'Demo - no charge'; }
export interface ServiceRequest { id: string; userId: string; customer: string; type: string; date: string; address: string; phone: string; notes: string; status: 'Open' | 'Assigned' | 'Resolved'; createdAt?: string; }
export { serviceTypes, validateService } from './service-booking';
export const categories: Category[] = ['Purifiers', 'Dispensers', 'Pumps', 'Filters', 'Spares'];

// Mock catalog. Photos illustrate each product family; SKUs and prices are sample data.
// Replace with licensed exact-model photos and real inventory before submission.
const families = [
  { category: 'Purifiers' as const, name: 'RO water purifier', retail: 12900, image: 'https://www.kent.co.in/cdn/shop/files/kent-grand-b-1.webp?width=700', description: 'Wall-mounted water purifier. Representative product-family photo; demo model and specifications.' },
  { category: 'Dispensers' as const, name: 'Hot & cold water dispenser', retail: 7900, image: 'https://cdn11.bigcommerce.com/s-6jzqtjaazb/images/stencil/1280x1280/products/790/3062/CK4063_MAIN__51396.1734003390.jpg?c=1', description: 'Floor-standing hot and cold water dispenser. Representative product-family photo; demo model.' },
  { category: 'Pumps' as const, name: 'RO booster pump', retail: 1490, image: 'https://www.lefoogroup.com/uploads/image/20220901/11/04_1662004585.jpg', description: 'Compact booster pump for compatible RO systems. Confirm pressure, voltage and fittings before installation. Representative photo.' },
  { category: 'Filters' as const, name: 'Sediment filter cartridge', retail: 390, image: 'https://nuaquawholesale.com/cdn/shop/products/sedimentfilter5micron_1200x1200.png?v=1709159052', description: 'Replacement sediment filter cartridge. Confirm housing compatibility with your installer. Representative photo.' },
  { category: 'Spares' as const, name: 'RO elbow connector', retail: 90, image: 'https://image.made-in-china.com/2f0j00pwrTFgUnEMbZ/Quick-Connecting-Tube-Connector-for-RO-Water-Purifier.webp', description: 'Quick-connect elbow fitting for compatible water-purifier tubing. Representative photo; demo model.' },
];
export const products: Product[] = families.flatMap((f, family) => Array.from({ length: 11 }, (_, variant) => ({
  ...f, id: `CF-${family + 1}${String(variant + 1).padStart(2, '0')}`, name: `${f.name} ${String.fromCharCode(65 + variant)}${100 + variant}`,
  retail: f.retail + variant * (family < 2 ? 500 : family === 4 ? 10 : 50),
  wholesale: Math.round((f.retail + variant * (family < 2 ? 500 : family === 4 ? 10 : 50)) * 0.74),
  stock: 40 + variant * 3, minBulk: family < 2 ? 2 : 5,
})));
export const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
export const isWholesale = (profile: Pick<Profile, 'role' | 'approval'>) => profile.role === 'Dealer' && profile.approval === 'approved';
export const priceFor = (product: Product, profile: Pick<Profile, 'role' | 'approval'>) => {
  if (isWholesale(profile) && product.wholesale === null) throw new Error('Wholesale pricing is unavailable. Refresh the catalog and try again.');
  return isWholesale(profile) ? product.wholesale! : product.retail;
};
export function quote(cart: CartItem[], profile: Profile, catalog: Product[] = products) {
  if (!cart.length) throw new Error('Your cart is empty.');
  const seen = new Set<string>();
  const items = cart.map(item => {
    const product = catalog.find(p => p.id === item.productId);
    if (!product || seen.has(item.productId)) throw new Error('Invalid or duplicate product.');
    seen.add(item.productId);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > product.stock) throw new Error(`Check the quantity for ${product.name}. Available: ${product.stock}.`);
    if (profile.role === 'Dealer' && profile.approval !== 'approved') throw new Error('Your dealer account needs approval before ordering.');
    if (isWholesale(profile) && item.quantity < product.minBulk) throw new Error(`Wholesale minimum for ${product.name}: ${product.minBulk} units.`);
    return { ...item, name: product.name, unitPrice: priceFor(product, profile) };
  });
  return { items, total: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) };
}
export function validateAddress(address: string, phone: string) {
  if (address.trim().length < 12) throw new Error('Enter a full delivery address (at least 12 characters).');
  if (!/^[6-9]\d{9}$/.test(phone.trim())) throw new Error('Enter a valid 10-digit Indian mobile number.');
}
export function demoProfile(role: Role): Profile {
  return { id: role === 'Customer' ? 'demo-customer' : 'demo-dealer', name: role === 'Customer' ? 'Alex Sharma' : 'Pure Water Traders', email: role === 'Customer' ? 'alex@example.com' : 'dealer@example.com', role, approval: 'approved', phone: '', address: '' };
}
export const orderStatuses: OrderStatus[] = ['Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
