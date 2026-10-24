import { useEffect, useState } from 'react';
import { categories, money, type CatalogDraft, type CatalogProduct, type Category } from '@califnco/core';
import { saveProduct, subscribeCatalog } from '../../../packages/core/src/catalog-store';
import { db } from './firebase';
import { accountError } from './AdminGate';

const blank = (): CatalogDraft => ({ id: '', name: '', category: 'Purifiers', description: '', image: '', retail: 0, wholesale: 0, stock: 0, minBulk: 1, active: true });
export function CatalogPanel() {
  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<CatalogDraft>(blank);
  const [revision, setRevision] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    setLoading(true); setError(''); setItems([]);
    return subscribeCatalog(db, 'admin', records => { setItems(records); setLoading(false); }, failure => { setItems([]); setLoading(false); setError(accountError(failure)); });
  }, [retry]);
  const edit = (product?: CatalogProduct) => { setDraft(product ? { ...product } : blank()); setRevision(product?.revision ?? null); setEditing(true); setMessage(''); };
  const textFields = [['id', 'SKU'], ['name', 'Product name'], ['image', 'Product image URL (HTTPS)']] as const;
  const numbers = [['retail', 'Retail price (₹)'], ['wholesale', 'Wholesale price (₹)'], ['stock', 'Stock units'], ['minBulk', 'Minimum wholesale quantity']] as const;
  return <>
    <div className="toolbar panel"><label className="search">Search<input aria-label="Search catalog" value={search} onChange={e => setSearch(e.target.value)} placeholder="Product name, SKU or category" /></label><button className="primary" onClick={() => edit()} disabled={busy}>Add product</button></div>
    {message && <p role="status" className="notice">{message}</p>}
    {loading && <p role="status">Loading catalog…</p>}
    {error && <div role="alert" className="notice">{error}<button className="outline" onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
    {editing && <form className="panel catalog-form" onSubmit={async e => {
      e.preventDefault(); if (busy) return; setBusy(true); setMessage('');
      try { await saveProduct(db, draft, revision); setEditing(false); setMessage('Product saved. Active products appear in the app automatically.'); }
      catch (failure) { setMessage(accountError(failure)); }
      finally { setBusy(false); }
    }}><h2>{revision === null ? 'Add a product' : `Edit ${draft.id}`}</h2><div className="catalog-fields">
      {textFields.map(([key, label]) => <label key={key}>{label}<input required disabled={busy || (key === 'id' && revision !== null)} value={draft[key]} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} /></label>)}
      <label>Category<select disabled={busy} value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value as Category }))}>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
      {numbers.map(([key, label]) => <label key={key}>{label}<input type="number" step="1" min={key === 'stock' ? 0 : 1} required disabled={busy} value={Number.isFinite(draft[key]) ? draft[key] ?? '' : ''} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value === '' ? NaN : Number(e.target.value) }))} /></label>)}
      <label className="wide">Description<textarea required disabled={busy} value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} /></label>
      <label className="wide"><span><input type="checkbox" disabled={busy} checked={draft.active} onChange={e => setDraft(d => ({ ...d, active: e.target.checked }))} /> Show in shop</span></label>
    </div><button className="primary" type="submit" disabled={busy || !!error}>{busy ? 'Saving…' : 'Save product'}</button><button type="button" className="outline" disabled={busy} onClick={() => setEditing(false)}>Cancel</button></form>}
    {!loading && !error && <section className="panel"><div className="table-scroll"><table><thead><tr><th>Product</th><th>Category</th><th>Retail</th><th>Wholesale</th><th>Stock</th><th>Min. bulk</th><th>Visibility</th><th>Manage</th></tr></thead><tbody>{items.filter(p => `${p.name} ${p.id} ${p.category}`.toLowerCase().includes(search.toLowerCase())).map(p => <tr key={p.id}><td><strong>{p.name}</strong><small>{p.id}</small></td><td>{p.category}</td><td>{money(p.retail)}</td><td>{p.wholesale === null ? 'Unavailable' : money(p.wholesale)}</td><td>{p.stock}</td><td>{p.minBulk}</td><td>{p.active ? 'Active' : 'Hidden'}</td><td><button className="outline" disabled={busy} onClick={() => edit(p)}>Edit</button></td></tr>)}</tbody></table></div>{!items.length && <div className="empty">No products yet. Add your first product to show it in the shop.</div>}</section>}
  </>;
}
