import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Restores a form draft saved before WarehouseLabelCapture, then applies label OCR field params.
 * Prevents losing in-progress fields when the form screen unmounts during camera OCR.
 */
export function useWarehouseFormOcrReturn({
  navigation,
  route,
  restoreDraft,
  applyOcrField,
}) {
  const lastOcrTokenRef = useRef('');

  useFocusEffect(
    useCallback(() => {
      const draft = route.params?.formDraft;
      if (draft && typeof draft === 'object') {
        restoreDraft(draft);
        navigation.setParams({ formDraft: undefined });
      }

      const field = route.params?.labelOcrField;
      const value = route.params?.labelFieldValue;
      if (field == null || value == null || value === '') return;

      const token = `${field}\0${String(value)}`;
      if (lastOcrTokenRef.current === token) return;
      lastOcrTokenRef.current = token;

      applyOcrField(field, String(value));
      navigation.setParams({
        labelOcrField: undefined,
        labelFieldValue: undefined,
      });
    }, [
      applyOcrField,
      navigation,
      restoreDraft,
      route.params?.formDraft,
      route.params?.labelFieldValue,
      route.params?.labelOcrField,
    ]),
  );
}
