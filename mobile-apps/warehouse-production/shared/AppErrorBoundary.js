import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[AppErrorBoundary]', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Something went wrong</Text>
        <ScrollView style={styles.scroll}>
          <Text style={styles.message}>{String(error?.message || error)}</Text>
        </ScrollView>
        <Pressable
          style={styles.btn}
          onPress={() => this.setState({ error: null })}
        >
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: theme.bg,
    padding: theme.space.xl,
    justifyContent: 'center',
  },
  title: { color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: theme.space.md },
  scroll: { maxHeight: 200, marginBottom: theme.space.lg },
  message: { color: theme.danger, fontSize: 14, lineHeight: 20 },
  btn: {
    alignSelf: 'center',
    paddingHorizontal: theme.space.xl,
    paddingVertical: theme.space.md,
    backgroundColor: theme.surface,
    borderRadius: theme.radiusSm,
    borderWidth: 1,
    borderColor: theme.border,
  },
  btnText: { color: theme.text, fontWeight: '600' },
});
