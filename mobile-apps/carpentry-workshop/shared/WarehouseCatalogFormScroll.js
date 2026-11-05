import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import { theme } from './theme';

/**
 * Keeps the soft keyboard open while tapping fields / buttons on catalog forms.
 */
export default function WarehouseCatalogFormScroll({
  children,
  contentContainerStyle,
  keyboardVerticalOffset = 88,
  scrollRef: scrollRefProp,
  ...rest
}) {
  const internalScrollRef = useRef(null);
  const scrollRef = scrollRefProp || internalScrollRef;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const bottomPad =
    keyboardHeight > 0 ? keyboardHeight + (Platform.OS === 'android' ? 48 : 24) : 0;

  const scrollBody = (
    <ScrollView
      ref={scrollRef}
      keyboardShouldPersistTaps="always"
      keyboardDismissMode="none"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={[contentContainerStyle, bottomPad > 0 && { paddingBottom: bottomPad }]}
      {...rest}
    >
      {children}
    </ScrollView>
  );

  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.bg }}
        behavior="padding"
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {scrollBody}
      </KeyboardAvoidingView>
    );
  }

  return <View style={{ flex: 1, backgroundColor: theme.bg }}>{scrollBody}</View>;
}

/** Scroll so lower fields (qty, etc.) stay above the soft keyboard. */
export function useScrollFieldIntoView(scrollRef) {
  return useCallback(
    (layoutY) => {
      const delay = Platform.OS === 'android' ? 120 : 60;
      setTimeout(() => {
        if (layoutY != null && Number.isFinite(layoutY)) {
          scrollRef.current?.scrollTo?.({ y: Math.max(0, layoutY - 24), animated: true });
          return;
        }
        scrollRef.current?.scrollToEnd?.({ animated: true });
      }, delay);
    },
    [scrollRef],
  );
}
