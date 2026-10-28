import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { validateDeliverySignatureStrokes } from '../lib/validateDeliverySignatureStrokes';
import { tUi } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';

function pointsToPath(points) {
  if (!points?.length) return '';
  const [first, ...rest] = points;
  let d = `M ${first.x} ${first.y}`;
  for (const p of rest) {
    d += ` L ${p.x} ${p.y}`;
  }
  return d;
}

const DeliverySignaturePad = forwardRef(function DeliverySignaturePad(
  { locale, textAlign, onValidationChange },
  ref,
) {
  const captureRefView = useRef(null);
  const activeStrokeRef = useRef(null);
  const [strokes, setStrokes] = useState([]);

  const notifyValidation = useCallback(
    (nextStrokes) => {
      const result = validateDeliverySignatureStrokes(nextStrokes);
      onValidationChange?.(result);
      return result;
    },
    [onValidationChange],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          const newStroke = { points: [{ x: locationX, y: locationY }] };
          activeStrokeRef.current = newStroke;
          setStrokes((prev) => {
            const next = [...prev, newStroke];
            notifyValidation(next);
            return next;
          });
        },
        onPanResponderMove: (evt) => {
          const stroke = activeStrokeRef.current;
          if (!stroke) return;
          const { locationX, locationY } = evt.nativeEvent;
          const last = stroke.points[stroke.points.length - 1];
          if (Math.hypot(locationX - last.x, locationY - last.y) < 1.5) return;
          stroke.points.push({ x: locationX, y: locationY });
          setStrokes((prev) => {
            const next = prev.slice();
            next[next.length - 1] = { points: [...stroke.points] };
            return next;
          });
        },
        onPanResponderRelease: () => {
          activeStrokeRef.current = null;
          setStrokes((prev) => {
            notifyValidation(prev);
            return prev;
          });
        },
        onPanResponderTerminate: () => {
          activeStrokeRef.current = null;
        },
      }),
    [notifyValidation],
  );

  const clear = useCallback(() => {
    activeStrokeRef.current = null;
    setStrokes([]);
    notifyValidation([]);
  }, [notifyValidation]);

  const exportPngBase64 = useCallback(async () => {
    const validation = validateDeliverySignatureStrokes(strokes);
    if (!validation.ok) {
      const err = new Error(validation.code || 'invalid');
      err.code = validation.code;
      throw err;
    }
    const uri = await captureRef(captureRefView, {
      format: 'png',
      quality: 1,
      result: 'base64',
    });
    const base64 = String(uri || '').trim();
    if (!base64) throw new Error('capture_failed');
    return `data:image/png;base64,${base64}`;
  }, [strokes]);

  useImperativeHandle(ref, () => ({ exportPngBase64, clear }), [clear, exportPngBase64]);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.hint, { textAlign }]}>{tUi('deliverySignatureHint', locale)}</Text>
      <View
        ref={captureRefView}
        style={styles.padOuter}
        collapsable={false}
        {...panResponder.panHandlers}
      >
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          {strokes.map((stroke, index) => (
            <Path
              key={`stroke-${index}`}
              d={pointsToPath(stroke.points)}
              stroke="#111"
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>
      </View>
      <Pressable style={styles.clearBtn} onPress={clear}>
        <Text style={styles.clearText}>{tUi('deliverySignatureClear', locale)}</Text>
      </Pressable>
    </View>
  );
});

export default DeliverySignaturePad;

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  hint: {
    color: theme.muted,
    fontSize: 14,
    marginBottom: 10,
    lineHeight: 20,
  },
  padOuter: {
    height: 220,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  clearBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  clearText: {
    color: theme.primary,
    fontWeight: '700',
    fontSize: 15,
  },
});
