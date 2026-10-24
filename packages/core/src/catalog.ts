import { categories, type Product } from './index';

export interface CatalogProduct extends Product { active: boolean; revision: number; }
export type CatalogDraft = Omit<CatalogProduct, 'revision'>;

export function validateProduct(input: CatalogDraft): CatalogDraft {
  const clean = { id: input.id.trim(), name: input.name.trim(), category: input.category, description: input.description.trim(), image: input.image.trim(), retail: input.retail, wholesale: input.wholesale, stock: input.stock, minBulk: input.minBulk, active: input.active };
  if (!/^[A-Za-z0-9_-]{2,60}$/.test(clean.id)) throw new Error('SKU must be 2–60 letters, numbers, underscores or hyphens.');
  if (clean.name.length < 2 || clean.name.length > 160) throw new Error('Product name must be 2–160 characters.');
  if (!categories.includes(clean.category)) throw new Error('Choose a valid category.');
  if (clean.description.length < 2 || clean.description.length > 3000) throw new Error('Description must be 2–3000 characters.');
  if (!/^https:\/\/[^\s]+$/.test(clean.image) || clean.image.length > 2000) throw new Error('Enter an HTTPS product image URL.');
  if (!Number.isSafeInteger(clean.retail) || clean.retail < 1 || clean.retail > 10000000) throw new Error('Retail price must be a whole rupee amount from 1 to 10000000.');
  if (clean.wholesale === null || !Number.isSafeInteger(clean.wholesale) || clean.wholesale < 1 || clean.wholesale > clean.retail) throw new Error('Wholesale price must be a positive whole rupee amount at or below retail.');
  if (!Number.isSafeInteger(clean.stock) || clean.stock < 0 || clean.stock > 1000000) throw new Error('Stock must be a whole number from 0 to 1000000.');
  if (!Number.isSafeInteger(clean.minBulk) || clean.minBulk < 1 || clean.minBulk > 1000000) throw new Error('Minimum bulk quantity must be a whole number from 1 to 1000000.');
  if (typeof clean.active !== 'boolean') throw new Error('Choose whether the product is active.');
  return clean;
}
