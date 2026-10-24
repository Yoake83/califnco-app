import React, { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from './src/auth/AuthProvider';
import { useCatalog } from './src/catalog/useCatalog';
import { useOrders } from './src/orders/useOrders';
import { useServices } from './src/services/useServices';
import { bookService as saveService } from '../../packages/core/src/service-store';
import { db } from './src/firebase';
import { checkoutAvailable, commerce } from './src/orders/commerce';
import { accountError, saveAccountProfile } from './src/auth/account-service';
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartItem, categories, isWholesale, money, Order, priceFor, Product, Profile, quote, ServiceRequest, validateAddress } from '@califnco/core';

type Tab = 'Shop' | 'Cart' | 'Orders' | 'Service' | 'Profile';
type Saved = { cart: CartItem[]; orders: Order[]; services: ServiceRequest[] };
const initial: Saved = { cart: [], orders: [], services: [] };
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function Button({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondary, (pressed || disabled) && { opacity: .6 }]}><Text style={[s.buttonText, secondary && { color: '#126d66' }]}>{title}</Text></Pressable>;
}
function Field({ label, value, onChangeText, multiline = false, ...props }: { label: string; value: string; onChangeText: (text: string) => void; multiline?: boolean; placeholder?: string; keyboardType?: 'default' | 'phone-pad'; editable?: boolean }) {
  return <View style={{ marginBottom: 16 }}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} style={[s.input, multiline && { minHeight: 85, textAlignVertical: 'top' }]} value={value} onChangeText={onChangeText} multiline={multiline} {...props} /></View>;
}
function ProfileForm({ profile, onNotice, onLogout }: { profile: Profile; onNotice: (text: string) => void; onLogout: () => void }) {
  const [draft, setDraft] = useState({ name: profile.name, phone: profile.phone, address: profile.address, businessName: profile.businessName ?? '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    if (saving) return;
    setSaving(true); setError('');
    try { await saveAccountProfile(profile, draft); onNotice('Your profile has been saved to your account.'); }
    catch (e) { setError(accountError(e)); }
    finally { setSaving(false); }
  }
  return <View style={[s.card, { padding: 24, marginTop: 20, gap: 8 }]}>
    <Text style={s.badge}>{profile.role} · {profile.approval}</Text>
    <Field label="Your name" value={draft.name} editable={!saving} onChangeText={name => setDraft(d => ({ ...d, name }))} />
    <Text style={s.label}>Account email</Text><Text style={[s.muted, { marginBottom: 16 }]}>{profile.email}</Text>
    {profile.role === 'Dealer' && <Field label="Business name" value={draft.businessName} editable={!saving} onChangeText={businessName => setDraft(d => ({ ...d, businessName }))} />}
    <Field label="Mobile number" value={draft.phone} editable={!saving} onChangeText={phone => setDraft(d => ({ ...d, phone }))} keyboardType="phone-pad" />
    <Field label={profile.role === 'Dealer' ? 'Business address' : 'Default address'} value={draft.address} editable={!saving} onChangeText={address => setDraft(d => ({ ...d, address }))} multiline />
    {!!error && <Text accessibilityRole="alert" style={{ color: '#a74433', marginBottom: 12 }}>{error}</Text>}
    <Button title={saving ? 'Saving…' : 'Save profile'} disabled={saving} onPress={save} />
    <Text style={s.small}>Profile changes save to Firebase. Account role and dealer approval are managed separately.</Text>
    <Button secondary title="Find your address on OpenStreetMap ↗" onPress={() => { Linking.openURL(`https://www.openstreetmap.org/search?query=${encodeURIComponent(draft.address || 'India')}`).catch(() => onNotice('Unable to open the map.')); }} />
    <Text style={s.small}>Map link only. Address selection and push alerts are pending integration.</Text>
    <Button title="Sign out" disabled={saving} onPress={onLogout} />
  </View>;
}

function Photo({ product, large = false }: { product: Product; large?: boolean }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const failed = failedImage === product.image;
  return failed ? <View style={[s.photo, s.center]}><Text style={s.muted}>{product.category}</Text><Text style={s.small}>Photo unavailable</Text></View> : <Image accessibilityLabel={product.name} source={{ uri: product.image }} style={[s.photo, large && { height: 300 }]} resizeMode="contain" onError={() => setFailedImage(product.image)} />;
}

export default function StoreScreen({ profile }: { profile: Profile }) {
  const { logout } = useAuth();
  const { orders, loading: ordersLoading, error: ordersError, retry: retryOrders } = useOrders(profile.id);
  const [orderBusy, setOrderBusy] = useState('');
  const [placingOrder, setPlacingOrder] = useState(false);
  const { services, loading: servicesLoading, error: servicesError, retry: retryServices } = useServices(profile.id);
  const [serviceBusy, setServiceBusy] = useState(false);
  const bookingId = useRef(`SR-${uid()}-${uid()}`);
  const { products, loading: catalogLoading, error: catalogError, retry: retryCatalog } = useCatalog(profile);
  const params = useLocalSearchParams<{ tab?: string }>();
  const tab: Tab = ['Shop', 'Cart', 'Orders', 'Service', 'Profile'].includes(params.tab ?? '') ? params.tab as Tab : 'Shop';
  const setTab = (next: Tab) => router.setParams({ tab: next });
  const storageKey = `califnco-account-v1:${profile.id}`;
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [data, setData] = useState<Saved>(initial);
  const [ready, setReady] = useState(false);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = products.find(p => p.id === selectedId) ?? null;
  const [notice, setNotice] = useState('');
  const [checkout, setCheckout] = useState(false);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceType, setServiceType] = useState('Repair');
  const [serviceDate, setServiceDate] = useState('');
  const [notes, setNotes] = useState('');
  const [sort, setSort] = useState(false);
  const { width } = useWindowDimensions();
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(storageKey).then(raw => {
      if (!raw || !active) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.cart) && Array.isArray(saved.orders) && Array.isArray(saved.services)) {
        setData({ ...saved, cart: saved.cart.filter((item: CartItem) => typeof item.productId === 'string' && Number.isSafeInteger(item.quantity) && item.quantity > 0) });
      }
    }).catch(() => { if (active) setNotice('Saved cart data could not be read. Starting a new cart.'); }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [storageKey]);
  useEffect(() => { if (ready) AsyncStorage.setItem(storageKey, JSON.stringify(data)).catch(() => setNotice('Unable to save locally. Changes may not survive a restart.')); }, [data, ready, storageKey]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 7000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [tab, profile.id]);
  const role = profile.role;
  const cart = data.cart.filter(item => products.some(p => p.id === item.productId));
  const unavailableItems = data.cart.length - cart.length;
  const wholesale = isWholesale(profile);
  const count = cart.reduce((n, item) => n + item.quantity, 0);
  const missingPrices = wholesale && cart.some(item => products.find(p => p.id === item.productId)?.wholesale === null);
  const displayPrice = (p: Product, quantity = 1) => wholesale && p.wholesale === null ? 'Price unavailable' : money(priceFor(p, profile) * quantity);
  const total = cart.reduce((n, item) => { const p = products.find(p => p.id === item.productId)!; return n + (wholesale ? p.wholesale ?? 0 : p.retail) * item.quantity; }, 0);
  const updateCart = (next: CartItem[]) => setData(d => ({ ...d, cart: next }));
  function add(candidate: Product) {
    const p = products.find(product => product.id === candidate.id);
    if (!p || catalogLoading || catalogError) { setNotice('Refresh the catalog before adding this product.'); return; }
    if (wholesale && p.wholesale === null) { setNotice('Wholesale pricing is unavailable for this product.'); return; }
    if (role === 'Dealer' && !wholesale) { setNotice('Your dealer application must be approved before ordering.'); return; }
    const step = wholesale ? p.minBulk : 1; const existing = cart.find(c => c.productId === p.id);
    if ((existing?.quantity ?? 0) + step > p.stock) { setNotice('You have reached the available stock for this item.'); return; }
    updateCart(existing ? cart.map(c => c.productId === p.id ? { ...c, quantity: c.quantity + step } : c) : [...cart, { productId: p.id, quantity: step }]);
    setNotice(`${step} × ${p.name} added to your cart.`);
  }
  function changeQuantity(p: Product, delta: number) {
    const next = cart.find(c => c.productId === p.id)!.quantity + delta;
    if (next > p.stock) { setNotice(`Only ${p.stock} units available.`); return; }
    updateCart(next <= 0 ? cart.filter(c => c.productId !== p.id) : cart.map(c => c.productId === p.id ? { ...c, quantity: next } : c));
  }
  async function placeOrder() {
    if (placingOrder) return;
    setPlacingOrder(true);
    try {
      if (catalogLoading || catalogError || missingPrices) throw new Error('Refresh the catalog before checking out.');
      if (unavailableItems) throw new Error('Remove unavailable cart items before checking out.');
      validateAddress(address, phone); quote(cart, profile, products);
      const attemptKey = `califnco-checkout:${profile.id}`;
      const signature = JSON.stringify({ items: cart, address: address.trim(), phone: phone.trim() });
      let attempt: { key: string; signature: string; completed?: boolean } | null = null;
      try { attempt = JSON.parse(await AsyncStorage.getItem(attemptKey) || 'null'); } catch { /* Start a new attempt for invalid local data. */ }
      if (!attempt || attempt.completed || attempt.signature !== signature) attempt = { key: `checkout-${uid()}-${uid()}`, signature };
      await AsyncStorage.setItem(attemptKey, JSON.stringify(attempt));
      await commerce({ action: 'create', items: cart, address: address.trim(), phone: phone.trim(), idempotencyKey: attempt.key });
      const next = { ...data, cart: [] };
      await AsyncStorage.setItem(storageKey, JSON.stringify(next));
      await AsyncStorage.setItem(attemptKey, JSON.stringify({ ...attempt, completed: true }));
      setData(next); setCheckout(false); setTab('Orders'); setNotice('Order reserved. Your order history shows its current status.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not reserve your order. Try again.'); }
    finally { setPlacingOrder(false); }
  }
  async function cancelOrder(id: string) {
    if (orderBusy) return;
    setOrderBusy(id);
    try { await commerce({ action: 'cancel', orderId: id }); setNotice('Unpaid order cancelled. Reserved stock has been released.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not cancel your order.'); }
    finally { setOrderBusy(''); }
  }
  async function bookService() {
    if (serviceBusy) return;
    setServiceBusy(true);
    try {
      await saveService(db, bookingId.current, profile, { type: serviceType, date: serviceDate, address, phone, notes });
      bookingId.current = `SR-${uid()}-${uid()}`; setNotes(''); setNotice('Service request saved to your account. We will update its status here.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save your request. Try again.'); }
    finally { setServiceBusy(false); }
  }
  const shown = products.filter(p => (category === 'All' || p.category === category) && `${p.name} ${p.id}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort ? (wholesale ? a.wholesale ?? Infinity : a.retail) - (wholesale ? b.wholesale ?? Infinity : b.retail) : 0);
  const columns = width > 1000 ? 4 : width > 650 ? 3 : 2;
  const openService = () => { setAddress(profile.address); setPhone(profile.phone); setTab('Service'); };
  const screenTitle = { Shop: 'Find your everyday pure.', Cart: 'Your cart', Orders: 'Your orders', Service: 'A little care. A lot of purity.', Profile: 'Make yourself at home.' }[tab];
  if (!ready) return <View style={[s.page, s.center]}><ActivityIndicator color="#137c72" /><Text style={s.muted}>Getting your store ready…</Text></View>;
  return <SafeAreaView style={s.page}><StatusBar style="dark" />
    <View style={s.demoBar}><Text style={s.demoText}>LIVE CATALOG · Ordering setup in progress</Text></View>
    <View style={s.header}><View style={s.row}><View style={s.logoSmall}><Text style={[s.logoText, { fontSize: 25 }]}>c.</Text></View><View><Text style={s.brand}>califnco</Text><Text style={s.small}>PURE WATER. BETTER LIVING.</Text></View></View><Pressable accessibilityRole="button" onPress={() => setTab('Profile')} style={s.avatar}><Text style={{ color: '#126d66', fontWeight: '700' }}>{profile.name.split(' ').filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase()}</Text></Pressable></View>
    <ScrollView ref={scrollRef} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.rowBetween}><Text style={s.eyebrow}>{role === 'Dealer' ? 'DEALER PORTAL' : 'YOUR DAILY DOSE OF PURITY'}</Text><Text style={s.small}>Hello, {profile.name.split(' ')[0]}</Text></View>
      <Text accessibilityRole="header" style={s.title}>{screenTitle}</Text>
      {tab === 'Shop' && <>
        <View style={s.hero}><View style={{ flex: 1, gap: 12 }}><Text style={s.heroTag}>A FRESH START, EVERY DAY</Text><Text style={s.heroTitle}>Good water.{`\n`}Great peace of mind.</Text><Text style={s.heroBody}>Discover essentials for a healthier home,{`\n`}from the first filter to the final drop.</Text><Pressable accessibilityRole="button" onPress={() => setCategory('Purifiers')}><Text style={s.heroLink}>Explore purifiers →</Text></Pressable></View>{width > 450 && <View style={s.waterArt}><Text style={s.drop}>◉</Text><Text style={s.waterLabel}>every drop{`\n`}matters.</Text></View>}</View>
        <View style={s.trustRow}>{['Care for every home', 'Simple, clear pricing', 'Service when you need it'].map(t => <Text key={t} style={s.trust}>✓  {t}</Text>)}</View>
        {role === 'Dealer' && !wholesale && <View style={s.info}><Text style={s.infoText}>{profile.approval === 'rejected' ? 'Your dealer application was not approved. Contact support for the next steps.' : 'Your dealer application is pending review. You can browse products; wholesale ordering starts after approval.'}</Text></View>}
        {wholesale && <View style={s.info}><Text style={s.infoText}>Wholesale prices are active. Minimum quantities apply to each product.</Text></View>}
        <View style={s.searchRow}><TextInput accessibilityLabel="Search products" placeholder="Search purifiers, filters, and more…" value={search} onChangeText={setSearch} style={[s.input, { flex: 1 }]} /><Pressable accessibilityRole="button" onPress={() => setSort(!sort)} style={s.sort}><Text style={s.label}>{sort ? 'Price ↑' : 'Sort ↕'}</Text></Pressable></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 20 }}><View style={[s.row, { gap: 8 }]}>{['All', ...categories].map(c => <Pressable accessibilityRole="button" accessibilityState={{ selected: category === c }} key={c} onPress={() => setCategory(c)} style={[s.chip, category === c && s.chipActive]}><Text style={[s.chipText, category === c && { color: '#fff' }]}>{c}</Text></Pressable>)}</View></ScrollView>
        <View style={s.rowBetween}><Text style={s.section}>{category === 'All' ? 'Essentials, thoughtfully chosen.' : category}</Text><Text style={s.small}>{shown.length} products</Text></View><Text style={[s.small, { marginVertical: 12 }]}>Product prices and availability are managed by Califnco.</Text>
        {catalogLoading && <ActivityIndicator color="#137c72" />}
        {!!catalogError && <View style={s.info}><Text style={s.infoText}>{catalogError}</Text><Button title="Retry catalog" onPress={retryCatalog} /></View>}
        <View style={s.grid}>{shown.map(p => <View key={p.id} style={[s.product, { width: `${100 / columns - 1.5}%` }]}><Pressable accessibilityRole="button" accessibilityLabel={`View ${p.name}`} onPress={() => setSelectedId(p.id)}><Photo product={p} /><View style={s.productBody}><Text style={s.productCategory}>{p.category.toUpperCase()}</Text><Text numberOfLines={2} style={s.productTitle}>{p.name}</Text><Text style={s.small}>{p.id} · {p.stock} in stock</Text></View></Pressable><View style={[s.rowBetween, { padding: 14, paddingTop: 0 }]}><View><Text style={s.price}>{displayPrice(p)}</Text>{wholesale && <Text style={s.small}>Min. {p.minBulk} units</Text>}</View><Pressable accessibilityRole="button" accessibilityLabel={`Add ${p.name} to cart`} style={s.add} onPress={() => add(p)}><Text style={s.addText}>+</Text></Pressable></View></View>)}</View>
        {!catalogLoading && !catalogError && !shown.length && <View style={s.empty}><Text style={s.section}>{products.length ? 'No matches this time.' : 'Products will appear here when the catalog is ready.'}</Text><Button title="Clear filters" secondary onPress={() => { setSearch(''); setCategory('All'); }} /></View>}
        <View style={[s.card, { padding: 24, marginTop: 28, gap: 12 }]}><Text style={s.section}>Keep your purifier at its best.</Text><Text style={s.muted}>Repairs, filter changes and installation, in a few simple steps.</Text><Button title="Book a service →" secondary onPress={openService} /></View>
      </>}
      {tab === 'Cart' && <>{!!unavailableItems && !catalogLoading && <View style={s.info}><Text style={s.infoText}>Some saved items are currently unavailable.</Text><Button title="Remove unavailable items" onPress={() => updateCart(cart)} /></View>}{!cart.length ? <View style={s.empty}><Text style={s.section}>A fresh start for your cart.</Text><Text style={s.muted}>Add a few essentials to get going.</Text><Button title="Explore products" onPress={() => setTab('Shop')} /></View> : <><Text style={s.muted}>{count} units · {wholesale ? 'Wholesale pricing' : 'Customer pricing'}</Text>{cart.map(item => { const p = products.find(p => p.id === item.productId)!; const step = wholesale ? p.minBulk : 1; return <View key={p.id} style={[s.card, s.cartRow]}><View style={{ width: 65 }}><Photo product={p} /></View><View style={{ flex: 1, gap: 8 }}><Text style={s.productTitle}>{p.name}</Text><Text style={s.price}>{displayPrice(p, item.quantity)}</Text><View style={s.row}><Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${p.name}`} style={s.quantity} onPress={() => changeQuantity(p, -step)}><Text>−</Text></Pressable><Text style={s.label}>{item.quantity}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Increase ${p.name}`} style={s.quantity} onPress={() => changeQuantity(p, step)}><Text>+</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Remove ${p.name}`} onPress={() => updateCart(cart.filter(c => c.productId !== p.id))}><Text style={s.remove}>Remove</Text></Pressable></View></View></View>; })}<View style={[s.card, { padding: 24, gap: 18 }]}><View style={s.rowBetween}><Text style={s.section}>Total</Text><Text style={s.price}>{missingPrices ? 'Price unavailable' : money(total)}</Text></View><Text style={s.small}>Estimated total · final prices checked at checkout</Text><Button title="Continue to checkout →" disabled={!checkoutAvailable || catalogLoading || !!catalogError || missingPrices || !!unavailableItems || placingOrder} onPress={() => { setAddress(profile.address); setPhone(profile.phone); setCheckout(true); }} /></View></>}</>}
      {tab === 'Orders' && <>
        {ordersLoading && <ActivityIndicator color="#137c72" />}
        {!!ordersError && <View style={s.info}><Text style={s.infoText}>{ordersError}</Text><Button title="Retry orders" onPress={retryOrders} /></View>}
        {!ordersLoading && !ordersError && !orders.length && <View style={s.empty}><Text style={s.section}>Your orders will appear here.</Text><Button title="Explore products" onPress={() => setTab('Shop')} /></View>}
        {orders.map(o => <View key={o.id} style={[s.card, { padding: 22, marginTop: 16, gap: 12 }]}><View style={s.rowBetween}><Text style={s.label}>{o.id}</Text><Text style={s.badge}>{o.status}</Text></View><Text style={s.small}>{new Date(o.createdAt).toLocaleString('en-IN')} · Payment: {o.paymentState}</Text>{o.items.map(i => <View style={s.rowBetween} key={i.productId}><Text style={[s.muted, { flex: 1 }]}>{i.quantity} × {i.name}</Text><Text style={s.label}>{money(i.unitPrice * i.quantity)}</Text></View>)}<Text style={s.price}>{money(o.total)}</Text><Text style={s.muted}>{o.address}</Text>{o.paymentState === 'pending' && <><Text style={s.small}>Reservation expires {new Date(o.expiresAt).toLocaleString('en-IN')}.</Text><Button secondary title={orderBusy === o.id ? 'Cancelling…' : 'Cancel unpaid order'} disabled={!!orderBusy} onPress={() => { void cancelOrder(o.id); }} /></>}</View>)}
      </>}
      {tab === 'Service' && <><View style={[s.card, { padding: 24, marginTop: 20 }]}><Text style={[s.muted, { marginBottom: 20 }]}>Tell us what needs attention and choose your preferred visit date.</Text><View style={[s.row, { flexWrap: 'wrap', marginBottom: 22 }]}>{['Repair', 'Installation', 'Filter change', 'Maintenance'].map(t => <Pressable accessibilityRole="button" key={t} onPress={() => setServiceType(t)} style={[s.chip, serviceType === t && s.chipActive]}><Text style={[s.chipText, serviceType === t && { color: '#fff' }]}>{t}</Text></Pressable>)}</View><Field editable={!serviceBusy} label="Preferred date (YYYY-MM-DD)" placeholder="2026-10-25" value={serviceDate} onChangeText={setServiceDate} /><Field editable={!serviceBusy} label="Service address" value={address} onChangeText={setAddress} multiline /><Field editable={!serviceBusy} label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><Field editable={!serviceBusy} label="Anything else we should know?" value={notes} onChangeText={setNotes} multiline /><Button title={serviceBusy ? "Saving…" : "Book service"} disabled={serviceBusy} onPress={() => { void bookService(); }} /></View><Text style={[s.section, { marginTop: 28 }]}>Your service requests</Text>{servicesLoading && <ActivityIndicator color="#137c72" />}{!!servicesError && <View style={s.info}><Text style={s.infoText}>{servicesError}</Text><Button title="Retry service requests" onPress={retryServices} /></View>}{services.map(r => <View style={[s.card, { padding: 20, marginTop: 14, gap: 10 }]} key={r.id}><View style={s.rowBetween}><Text style={s.productTitle}>{r.type}</Text><Text style={s.badge}>{r.status}</Text></View><Text style={s.muted}>{r.date} · {r.address}</Text><Text style={s.small}>{r.id}</Text></View>)}</>}
      {tab === 'Profile' && <ProfileForm profile={profile} onNotice={setNotice} onLogout={() => logout().catch(e => setNotice(accountError(e)))} />}
      <Text style={s.footer}>califnco / A little purity goes a long way.</Text>
    </ScrollView>
    <View style={s.nav}>{(['Shop', 'Cart', 'Orders', 'Service', 'Profile'] as Tab[]).map((t, i) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === t }} key={t} style={[s.navItem, tab === t && s.navActive]} onPress={() => t === 'Service' ? openService() : setTab(t)}><Text style={[s.navIcon, tab === t && { color: '#11786e' }]}>{['⌂', '▤', '▣', '◇', '○'][i]}</Text><Text style={[s.navLabel, tab === t && { color: '#11786e', fontWeight: '700' }]}>{t}{t === 'Cart' && count > 0 ? ` (${count})` : ''}</Text></Pressable>)}</View>
    {!!notice && <Pressable accessibilityRole="alert" onPress={() => setNotice('')} style={s.toast}><Text style={s.toastText}>{notice}</Text><Text style={s.toastText}>×</Text></Pressable>}
    <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelectedId(null)}><View style={s.overlay}><ScrollView contentContainerStyle={s.modalWrap}><View style={s.sheet}>{selected && <><View style={s.rowBetween}><Text style={s.eyebrow}>{selected.category}</Text><Button title="Close ×" secondary onPress={() => setSelectedId(null)} /></View><Photo product={selected} large /><Text style={s.title}>{selected.name}</Text><Text style={s.muted}>{selected.description}</Text><Text style={s.small}>{selected.id} · {selected.stock} in stock</Text><Text style={s.price}>{displayPrice(selected)}</Text>{wholesale && <Text style={s.muted}>Minimum wholesale quantity: {selected.minBulk}</Text>}<Button title="Add to cart" onPress={() => { add(selected); setSelectedId(null); }} /></>}</View></ScrollView></View></Modal>
    <Modal visible={checkout} transparent animationType="slide" onRequestClose={() => { if (!placingOrder) setCheckout(false); }}><View style={s.overlay}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.modalWrap}><View style={s.sheet}><View style={s.rowBetween}><Text style={s.section}>Checkout</Text><Button title="Close ×" secondary disabled={placingOrder} onPress={() => setCheckout(false)} /></View><Text style={s.muted}>Your prices and stock are checked before your order is reserved. Payment options will be available soon.</Text><Field label="Delivery address" value={address} onChangeText={setAddress} multiline /><Field label="10-digit mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><View style={s.rowBetween}><Text style={s.section}>Total</Text><Text style={s.price}>{missingPrices ? 'Price unavailable' : money(total)}</Text></View><Button title={placingOrder ? "Reserving…" : "Reserve order"} disabled={!checkoutAvailable || catalogLoading || !!catalogError || missingPrices || !!unavailableItems || placingOrder} onPress={() => { void placeOrder(); }} /></View></ScrollView>{!!notice && <View accessibilityRole="alert" style={s.modalNotice}><Text style={s.toastText}>{notice}</Text></View>}</View></Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f6f8f7' }, center: { alignItems: 'center', justifyContent: 'center', gap: 15 },
  login: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 22, minHeight: '100%' }, logo: { backgroundColor: '#126f66', width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, logoText: { color: '#fff', fontSize: 46, fontWeight: '800' },
  demoBar: { backgroundColor: '#e9f3ee', padding: 7, alignItems: 'center' }, demoText: { color: '#416157', fontSize: 10, letterSpacing: .8 }, header: { paddingHorizontal: 24, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e9eeeb', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, logoSmall: { backgroundColor: '#126f66', width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, brand: { color: '#182f35', fontWeight: '800', fontSize: 24, letterSpacing: -.8 }, avatar: { backgroundColor: '#eaf3ed', borderRadius: 24, height: 42, width: 42, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', alignSelf: 'center', maxWidth: 1180, padding: 22, paddingBottom: 36 }, eyebrow: { color: '#658078', fontSize: 10, fontWeight: '700', letterSpacing: 1.6 }, title: { color: '#18353b', fontWeight: '700', fontSize: 30, letterSpacing: -1, marginTop: 12, marginBottom: 22 }, section: { color: '#203d43', fontSize: 19, fontWeight: '700', flexShrink: 1 }, muted: { color: '#687b7d', fontSize: 14, lineHeight: 22 }, small: { fontSize: 10, lineHeight: 16, color: '#7c8d8b' }, label: { color: '#345053', fontSize: 13, fontWeight: '600', marginBottom: 6 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  hero: { backgroundColor: '#123f43', padding: 28, borderRadius: 22, flexDirection: 'row', minHeight: 235, alignItems: 'center', overflow: 'hidden' }, heroTag: { color: '#a3ceba', fontSize: 9, letterSpacing: 1.6 }, heroTitle: { color: '#fff', fontSize: 30, fontWeight: '600', letterSpacing: -.8, lineHeight: 36 }, heroBody: { color: '#c2d8d4', fontSize: 12, lineHeight: 21 }, heroLink: { color: '#dcf3cc', fontSize: 13, fontWeight: '700', marginTop: 8 }, waterArt: { width: 100, height: 160, borderRadius: 65, backgroundColor: '#275f60', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-9deg' }], marginLeft: 8 }, drop: { color: '#c8e1d6', fontSize: 65 }, waterLabel: { color: '#cde1d8', fontSize: 12, textAlign: 'center' },
  trustRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, paddingVertical: 22 }, trust: { color: '#668078', fontSize: 10 }, info: { padding: 14, backgroundColor: '#e6f2eb', borderRadius: 12, marginBottom: 20 }, infoText: { color: '#287261', fontSize: 12, lineHeight: 20 }, searchRow: { flexDirection: 'row', gap: 10 }, input: { backgroundColor: '#f9fbfa', borderWidth: 1, borderColor: '#dce6e1', borderRadius: 12, padding: 14, color: '#1e3d41', fontSize: 14 }, sort: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce6e1', borderRadius: 12, justifyContent: 'center', paddingHorizontal: 16 }, chip: { paddingHorizontal: 18, paddingVertical: 12, borderWidth: 1, borderColor: '#e0e9e4', borderRadius: 24, backgroundColor: '#fff' }, chipActive: { backgroundColor: '#176e64', borderColor: '#176e64' }, chipText: { color: '#71817d', fontSize: 12 }, grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: '2%', rowGap: 0 }, product: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5ece7', marginBottom: 15, overflow: 'hidden', justifyContent: 'space-between' }, photo: { width: '100%', height: 140, backgroundColor: '#fff', marginVertical: 10 }, productBody: { padding: 14, paddingTop: 5, gap: 7 }, productCategory: { color: '#8c9a8f', fontSize: 8, letterSpacing: 1.5, fontWeight: '700' }, productTitle: { color: '#294348', fontSize: 14, fontWeight: '600', lineHeight: 21 }, price: { color: '#1c665b', fontSize: 18, fontWeight: '700' }, add: { height: 34, width: 34, borderRadius: 11, backgroundColor: '#edf5ee', alignItems: 'center', justifyContent: 'center' }, addText: { color: '#126e61', fontSize: 24 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3ece6', borderRadius: 18 }, cartRow: { flexDirection: 'row', alignItems: 'center', padding: 15, gap: 15, marginVertical: 10 }, quantity: { paddingHorizontal: 13, paddingVertical: 10, backgroundColor: '#edf4ef', borderRadius: 8 }, remove: { color: '#a06557', fontSize: 12 }, empty: { paddingVertical: 70, alignItems: 'center', gap: 20 }, badge: { color: '#287565', backgroundColor: '#e8f3ec', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 6, fontSize: 11, alignSelf: 'flex-start' }, button: { backgroundColor: '#176f64', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 16, alignItems: 'center' }, secondary: { backgroundColor: '#edf5ef' }, buttonText: { color: '#fff', fontSize: 13, fontWeight: '700' }, footer: { color: '#92a19b', fontSize: 10, textAlign: 'center', marginTop: 40, letterSpacing: .7 },
  nav: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#e1e9e3', paddingVertical: 9, justifyContent: 'space-around' }, navItem: { alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }, navActive: { backgroundColor: '#eef6ef' }, navIcon: { color: '#8d9c96', fontSize: 22 }, navLabel: { color: '#8d9c96', fontSize: 10 }, toast: { position: 'absolute', bottom: 90, left: 20, right: 20, backgroundColor: '#254744', borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, toastText: { color: '#fff', fontSize: 13, lineHeight: 20, flexShrink: 1 }, overlay: { flex: 1, backgroundColor: 'rgba(12,37,39,.55)' }, modalWrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }, sheet: { backgroundColor: '#fff', width: '100%', maxWidth: 570, borderRadius: 24, padding: 25, gap: 18 }, modalNotice: { backgroundColor: '#254744', padding: 20, margin: 20, borderRadius: 12 },
});
