import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import StoreScreen from '../../App';
import { useAuth } from '../auth/AuthProvider';

export default function Index() {
  const session = useAuth();
  if (session.status === 'loading') return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#f6f8f7' }}><ActivityIndicator color="#176f64" /><Text>Checking your account…</Text></View>;
  if (session.status !== 'ready' || !session.profile) return <Redirect href="/login" />;
  return <StoreScreen key={session.profile.id} profile={session.profile} />;
}
