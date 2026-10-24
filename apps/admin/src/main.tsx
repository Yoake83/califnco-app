import React, { useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { signOut, type User } from 'firebase/auth';
import { AdminGate, accountError } from './AdminGate';
import { DealerPanel } from './DealerPanel';
import { CatalogPanel } from './CatalogPanel';
import { OrderPanel } from './OrderPanel';
import { ServicePanel } from './ServicePanel';
import { subscribeOrders } from '../../../packages/core/src/order-store';
import { subscribeServices } from '../../../packages/core/src/service-store';
import type { CommerceOrder } from '@califnco/core';
import { subscribeDealers } from './dealer-service';
import { createRoot } from 'react-dom/client';
import { ArrowDownToLine, ArrowUpRight, Boxes, ChevronRight, ClipboardList, Droplets, LayoutDashboard, Settings2, ShieldCheck, ShoppingBag, Users, Wrench, X } from 'lucide-react';
import { money, type Profile, type ServiceRequest } from '@califnco/core';
import './style.css';

type Section = 'Overview' | 'Orders' | 'Dealers' | 'Service desk' | 'Catalog' | 'Setup';
function App({ user }: { user: User }) {
  const [orders, setOrders] = useState<CommerceOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState('');
  const [orderSubscription, setOrderSubscription] = useState(0);
  useEffect(() => subscribeOrders(db, null, records => { setOrders(records); setOrdersLoading(false); setOrdersError(''); }, error => { setOrders([]); setOrdersLoading(false); setOrdersError(accountError(error)); }), [user.uid, orderSubscription]);
  const [services, setServices] = useState<ServiceRequest[]>([]);
  useEffect(() => subscribeServices(db, null, setServices, () => setServices([])), [user.uid]);
  const [dealers, setDealers] = useState<Profile[]>([]);
  const [dealerLoading, setDealerLoading] = useState(true);
  const [dealerError, setDealerError] = useState('');
  const [subscription, setSubscription] = useState(0);
  useEffect(() => {
    setDealers([]); setDealerLoading(true); setDealerError('');
    return subscribeDealers(db, records => { setDealers(records); setDealerLoading(false); }, error => { setDealers([]); setDealerLoading(false); setDealerError(accountError(error)); });
  }, [user.uid, subscription]);
  const [section, setSection] = useState<Section>('Overview');
  const [message, setMessage] = useState('');
  const navigate = (next: Section) => setSection(next);
  const pending = dealers.filter(d => d.approval === 'pending').length;
  const open = services.filter(r => r.status !== 'Resolved').length;
  const revenue = orders.filter(o => o.paymentState === 'paid').reduce((n, o) => n + o.total, 0);
  function exportData() { const url = URL.createObjectURL(new Blob([JSON.stringify({ orders, dealers, services }, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'califnco-admin-export.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  const orderTable = () => <div className="table-scroll"><table><thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Status</th><th>Placed</th></tr></thead><tbody>{orders.slice(0, 5).map(o => <tr key={o.id}><td><strong>{o.id}</strong><small>{o.paymentState}</small></td><td>{o.customer}<small>{o.role}</small></td><td>{money(o.total)}</td><td>{o.status}</td><td>{new Date(o.createdAt).toLocaleDateString('en-IN')}</td></tr>)}</tbody></table>{!orders.length && <p className="empty">No orders yet.</p>}</div>;
  return <div className="app"><aside className="sidebar"><a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('Overview'); }}><span className="logo">c.</span><span>califnco<small>OPERATIONS STUDIO</small></span></a><p className="nav-label">WORKSPACE</p><nav>{([[LayoutDashboard, 'Overview'], [ShoppingBag, 'Orders'], [Users, 'Dealers'], [Wrench, 'Service desk'], [Boxes, 'Catalog']] as const).map(([Icon, name]) => <button key={name} className={section === name ? 'active' : ''} onClick={() => navigate(name)}><Icon size={18} />{name}{name === 'Dealers' && <span className="count">{pending}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="care-note"><Droplets size={24} /><strong>Good water. Better days.</strong><p>A little care in every order.</p></div><button className="setup" onClick={() => navigate('Setup')}><Settings2 size={18} />Integration setup<ChevronRight size={15} /></button><div className="admin-person"><span>AD</span><div><strong>{user.email}</strong><small>Authorized admin</small></div><ShieldCheck size={18} /></div></div></aside>
    <div className="main"><div className="demo-banner">LIVE DATA <span>Razorpay Test Mode · no real charges</span></div><header><div className="breadcrumb">Workspace <ChevronRight size={14} /> <strong>{section}</strong></div><div className="header-right"><span className="live-dot" /> Admin access <button className="outline" onClick={() => void signOut(auth).catch(error => setMessage(accountError(error)))}>Sign out</button><span className="mini-avatar">AD</span></div></header><main><div className="page-heading"><div><p className="eyebrow">A CLEARER VIEW OF YOUR BUSINESS</p><h1>{section === 'Overview' ? 'Every drop, accounted for.' : section}</h1><p className="subtitle">{section === 'Overview' ? 'Orders, partners and service. Everything flowing in one place.' : 'Manage your shared orders, partners, products and service requests.'}</p></div><button className="outline" onClick={exportData}><ArrowDownToLine size={16} />Export data</button></div>
    {message && <div role="status" className="notice">{message}<button aria-label="Dismiss notice" onClick={() => setMessage('')}><X size={16} /></button></div>}
    {section === 'Overview' && <><div className="stats">{[[ShoppingBag, 'Orders', String(orders.length), 'Across customer & dealer accounts'], [ClipboardList, 'Paid order value', money(revenue), 'Verified payments only · no revenue collected'], [Users, 'Pending dealers', String(pending), 'Ready for your review'], [Wrench, 'Open service requests', String(open), 'A little care goes a long way']].map(([Icon, label, value, detail]) => { const I = Icon as typeof ShoppingBag; return <article className="stat" key={String(label)}><div><span>{String(label)}</span><I size={18} /></div><strong>{String(value)}</strong><small>{String(detail)}</small></article>; })}</div><div className="overview-grid"><section className="panel"><div className="panel-heading"><div><h2>Recent orders</h2><p>A snapshot of your latest activity.</p></div><button className="text-button" onClick={() => navigate('Orders')}>View all <ArrowUpRight size={15} /></button></div>{orderTable()}</section><section className="panel attention"><span className="icon-box"><Users size={21} /></span><p className="eyebrow">GROWING TOGETHER</p><h2>Good partners.<br />Greater possibilities.</h2><p>{pending} dealer applications are waiting for a decision. Review their details to get them started.</p><button className="primary" onClick={() => navigate('Dealers')}>Review applications <ArrowUpRight size={16} /></button><div className="partner-avatars"><span>CW</span><span>AR</span><small>Your next chapter starts here.</small></div></section></div><section className="service-strip"><div className="icon-box"><Wrench size={24} /></div><div><h2>A little service goes a long way.</h2><p>{open} service requests need attention.</p></div><button className="outline" onClick={() => navigate('Service desk')}>Open service desk <ArrowUpRight size={16} /></button></section></>}
    {section === 'Orders' && <OrderPanel orders={orders} loading={ordersLoading} error={ordersError} retry={() => setOrderSubscription(n => n + 1)} />}
    {section === 'Dealers' && <DealerPanel dealers={dealers} loading={dealerLoading} error={dealerError} retry={() => setSubscription(n => n + 1)} />}
    {section === 'Service desk' && <ServicePanel />}
    {section === 'Catalog' && <CatalogPanel />}
    {section === 'Setup' && <section className="panel setup-panel"><h2>Integration setup</h2><p>Dealer approvals, catalog, orders and service requests use Firebase. The protected order API and Razorpay test webhook are deployed.</p><ol><li>Admin panel and protected API are deployed to Vercel.</li><li>Server credentials are stored privately in Vercel; allowed browser origins are configured there.</li><li>Razorpay Test Mode and webhook verification are configured. Verify a complete test purchase before building the Android APK.</li><li>Configure push, email and SMS notifications and verify delivery on a device.</li></ol></section>}
    <footer><span>califnco / Pure water. Better living.</span><span>Operations studio · First build</span></footer></main></div></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><AdminGate>{user => <App key={user.uid} user={user} />}</AdminGate></React.StrictMode>);
