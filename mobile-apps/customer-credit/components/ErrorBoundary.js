import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('[customer-ledger] startup error', error);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Ledger</Text>
          <Text style={styles.message}>
            The app could not start. Please reinstall the latest APK or contact support.
          </Text>
          <ScrollView style={styles.detailsWrap}>
            <Text style={styles.details}>{String(this.state.error?.message || this.state.error)}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f8fafc',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  message: {
    color: '#475569',
    marginBottom: 16,
    lineHeight: 22,
  },
  detailsWrap: {
    maxHeight: 180,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  details: {
    color: '#b91c1c',
    fontSize: 13,
  },
});
