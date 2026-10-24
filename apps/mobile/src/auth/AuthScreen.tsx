import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { RegistrationInput, Role } from '@califnco/core';
import { useAuth } from './AuthProvider';
import { accountError, completeRegistration, login, registerAccount, resetPassword } from './account-service';

export default function AuthScreen() {
  const session = useAuth();
  const params = useLocalSearchParams<{ mode?: string; role?: string }>();
  const role: Role = params.role === 'Dealer' ? 'Dealer' : 'Customer';
  const mode = params.mode === 'register' ? 'register' : params.mode === 'reset' ? 'reset' : 'login';
  const finishing = session.status === 'needsProfile';
  const registering = mode === 'register' || finishing;
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', businessName: '', password: '', confirmation: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const change = (key: keyof typeof form, value: string) => setForm(f => ({ ...f, [key]: value }));
  function navigate(next: 'login' | 'register' | 'reset', nextRole = role) {
    setForm(f => ({ ...f, password: '', confirmation: '' })); setError(''); setMessage('');
    router.setParams({ mode: next, role: nextRole });
  }
  async function submit() {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    const input: RegistrationInput = { name: form.name, email: session.user?.email ?? form.email, role, phone: form.phone, address: form.address, businessName: form.businessName };
    try {
      if (finishing) await completeRegistration(input);
      else if (mode === 'register') await registerAccount(input, form.password, form.confirmation);
      else if (mode === 'reset') { await resetPassword(form.email); setMessage('If an account exists for this email, a password reset link will arrive shortly.'); }
      else await login(form.email, form.password);
      setForm(f => ({ ...f, password: '', confirmation: '' }));
    } catch (e) { setError(accountError(e)); }
    finally { setBusy(false); }
  }
  const field = (key: keyof typeof form, label: string, options: { password?: boolean; multiline?: boolean; phone?: boolean; email?: boolean } = {}) => <View style={styles.field} key={key}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={form[key]} onChangeText={value => change(key, value)} editable={!busy} secureTextEntry={options.password} autoCapitalize={options.email || options.password ? 'none' : 'sentences'} autoCorrect={!options.email && !options.password} keyboardType={options.email ? 'email-address' : options.phone ? 'phone-pad' : 'default'} autoComplete={options.password ? registering ? 'new-password' : 'current-password' : options.email ? 'email' : options.phone ? 'tel' : key === 'name' ? 'name' : 'off'} multiline={options.multiline} style={[styles.input, options.multiline && { minHeight: 80, textAlignVertical: 'top' }]} /></View>;
  if (session.status === 'ready') return <Redirect href="/" />;
  if (session.status === 'loading' && !busy) return <View style={styles.loading}><ActivityIndicator color="#176f64" /><Text style={styles.muted}>Checking your account…</Text></View>;
  return <SafeAreaView style={styles.page}><StatusBar style="dark" /><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}><View style={styles.logo}><Text style={styles.logoText}>c.</Text></View><Text style={styles.eyebrow}>CALIFNCO / WATER & WELLNESS</Text><Text style={styles.title}>{finishing ? 'Finish your account' : mode === 'reset' ? 'Reset your password' : registering ? role === 'Dealer' ? 'Become a dealer' : 'Create your account' : `${role} sign in`}</Text><View style={styles.card}>
    {session.status === 'error' ? <><Text accessibilityRole="alert" style={styles.error}>{session.error}</Text><Pressable accessibilityRole="button" style={styles.button} onPress={session.retry}><Text style={styles.buttonText}>Retry connection</Text></Pressable><Pressable accessibilityRole="button" style={styles.secondary} onPress={() => session.logout().catch(e => setError(accountError(e)))}><Text style={styles.link}>Sign out</Text></Pressable></> : <>
      {mode !== 'reset' && <View style={styles.row}>{(['Customer', 'Dealer'] as Role[]).map(r => <Pressable accessibilityRole="button" accessibilityState={{ selected: r === role }} disabled={busy} key={r} onPress={() => navigate(mode === 'login' && !finishing ? 'login' : 'register', r)} style={[styles.role, r === role && styles.roleSelected]}><Text style={{ color: r === role ? '#fff' : '#176f64', fontWeight: '600' }}>{r}</Text></Pressable>)}</View>}
      <Text style={styles.muted}>{finishing ? 'Your sign-in exists. Save the details below to finish setup.' : mode === 'reset' ? 'Enter the email address you use to sign in.' : registering && role === 'Dealer' ? 'Submit your business details for review. Wholesale ordering starts after approval.' : registering ? 'Sign up to save your profile and access your customer account.' : 'Use your registered email and password. Your saved account determines your access.'}</Text>
      {registering && field('name', 'Your name')}
      {finishing ? <View><Text style={styles.label}>Account email</Text><Text style={styles.muted}>{session.user?.email}</Text></View> : field('email', 'Email address', { email: true })}
      {registering && role === 'Dealer' && field('businessName', 'Business name')}
      {registering && field('phone', role === 'Dealer' ? 'Business mobile number' : 'Mobile number (optional)', { phone: true })}
      {registering && role === 'Dealer' && field('address', 'Business address', { multiline: true })}
      {mode !== 'reset' && !finishing && field('password', registering ? 'Password (at least 8 characters)' : 'Password', { password: true })}
      {registering && !finishing && field('confirmation', 'Confirm password', { password: true })}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}{!!message && <Text accessibilityRole="alert" style={styles.success}>{message}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} style={[styles.button, busy && { opacity: .6 }]} onPress={submit}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{finishing ? 'Save account details' : mode === 'reset' ? 'Send reset link' : registering ? role === 'Dealer' ? 'Submit dealer application' : 'Create customer account' : 'Sign in'}</Text>}</Pressable>
      {finishing ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => session.logout().catch(e => setError(accountError(e)))}><Text style={styles.link}>Sign out and finish later</Text></Pressable> : <>
        {mode === 'login' && <Pressable accessibilityRole="button" disabled={busy} onPress={() => navigate('reset')}><Text style={styles.link}>Forgot password?</Text></Pressable>}
        <Pressable accessibilityRole="button" disabled={busy} style={styles.secondary} onPress={() => navigate(mode === 'login' ? 'register' : 'login')}><Text style={styles.link}>{mode === 'login' ? `Create a ${role.toLowerCase()} account` : 'Already registered? Sign in'}</Text></Pressable>
      </>}
    </>}
  </View><Text style={styles.small}>Shared catalog and orders · Razorpay Test Mode · no real charges.</Text></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f6f8f7' }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: '#f6f8f7' },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }, logo: { backgroundColor: '#126f66', width: 66, height: 66, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, logoText: { color: '#fff', fontSize: 42, fontWeight: '800' },
  eyebrow: { fontSize: 10, letterSpacing: 1.6, color: '#658078' }, title: { color: '#18353b', fontSize: 30, fontWeight: '700', textAlign: 'center' }, card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3ece6', borderRadius: 18, padding: 24, width: '100%', maxWidth: 440, gap: 18 }, row: { flexDirection: 'row', gap: 10 }, role: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: '#edf5ef' }, roleSelected: { backgroundColor: '#176f64' }, field: { gap: 8 }, label: { fontSize: 13, color: '#345053', fontWeight: '600' }, input: { borderWidth: 1, borderColor: '#dce6e1', borderRadius: 12, padding: 14, fontSize: 14, color: '#1e3d41', backgroundColor: '#f9fbfa' }, muted: { color: '#687b7d', fontSize: 13, lineHeight: 21 }, button: { backgroundColor: '#176f64', borderRadius: 12, padding: 16, alignItems: 'center', minHeight: 48 }, buttonText: { color: '#fff', fontSize: 13, fontWeight: '700' }, secondary: { padding: 14, borderRadius: 12, backgroundColor: '#edf5ef' }, link: { color: '#176f64', fontSize: 13, textAlign: 'center' }, error: { color: '#a74433', fontSize: 13, lineHeight: 20 }, success: { color: '#176f64', fontSize: 13, lineHeight: 20 }, small: { color: '#7c8d8b', fontSize: 11, textAlign: 'center', lineHeight: 18 },
});
