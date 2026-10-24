import { useState } from 'react';
import type { CommerceOrder } from '@califnco/core';
import { money } from '@califnco/core';
import { auth } from './firebase';
import { accountError } from './AdminGate';

export function OrderPanel({ orders, loading, error, retry }: { orders: CommerceOrder[]; loading: boolean; error: string; retry: () => void }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const nextStatus: Record<string, string> = { Confirmed: 'Processing', Processing: 'Shipped', Shipped: 'Delivered' };
  async function change(order: CommerceOrder, cancel: boolean) {
    if (busy) return;
    setBusy(order.id); setMessage('');
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Sign in again.');
      const response = await fetch(import.meta.env.VITE_COMMERCE_API_URL || '/api/commerce', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: cancel ? 'cancel' : 'status', orderId: order.id, status: nextStatus[order.status] }), signal: AbortSignal.timeout(25000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to update the order.');
      setMessage(cancel ? 'Unpaid order cancelled and stock released.' : 'Order status updated.');
    } catch (failure) { setMessage(accountError(failure)); } finally { setBusy(''); }
  }
  const visible = orders.filter(o => (filter === 'All' || o.status === filter) && `${o.id} ${o.customer}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="panel"><div className="toolbar"><label className="search">Search<input aria-label="Search orders" value={search} onChange={e => setSearch(e.target.value)} placeholder="Order ID or customer" /></label><select aria-label="Filter order status" value={filter} onChange={e => setFilter(e.target.value)}>{['All', 'Awaiting payment', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Expired'].map(status => <option key={status}>{status}</option>)}</select></div>
    {loading && <p role="status" className="empty">Loading orders…</p>}
    {error && <p role="alert" className="notice">{error}<button className="outline" onClick={retry}>Retry</button></p>}
    {message && <p role="status" className="notice">{message}</p>}
    {!error && <div className="table-scroll"><table><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Delivery</th><th>Manage</th></tr></thead><tbody>{visible.map(order => <tr key={order.id}><td><strong>{order.id}</strong><small>{new Date(order.createdAt).toLocaleString('en-IN')}</small></td><td>{order.customer}<small>{order.role} · {order.phone}</small></td><td>{order.items.map(item => <small key={item.productId}>{item.quantity} × {item.name}</small>)}</td><td>{money(order.total)}</td><td>{order.paymentState}<small>Test mode</small></td><td>{order.status}</td><td>{order.address}</td><td>{order.paymentState === 'pending' ? <button disabled={!!busy} className="outline" onClick={() => void change(order, true)}>Cancel unpaid order</button> : order.paymentState === 'paid' && nextStatus[order.status] ? <button disabled={!!busy} className="primary" onClick={() => void change(order, false)}>Mark {nextStatus[order.status]}</button> : '—'}</td></tr>)}</tbody></table></div>}
    {!loading && !error && !visible.length && <p className="empty">No matching orders.</p>}
  </section>;
}
