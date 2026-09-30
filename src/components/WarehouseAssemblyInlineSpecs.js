/** Inline dimensions (cm) + calculated volume (m³). */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { patchWarehouseAssemblyFields } from '../services/warehouseCatalog';
import {
  formatAssemblyDimensions,
  formatAssemblyVolumeAmount,
} from '../utils/warehouseAssemblySpecs';

function volumeSourceAssembly(assembly, dimL, dimW, dimH) {
  const draftComplete = [dimL, dimW, dimH].every((v) => v !== '' && v != null);
  if (draftComplete) {
    return { dim_length: dimL, dim_width: dimW, dim_height: dimH };
  }
  return assembly;
}

function VolumeM3Value({ assembly, dimL, dimW, dimH }) {
  const source = volumeSourceAssembly(assembly, dimL, dimW, dimH);
  const amount = formatAssemblyVolumeAmount(source);
  if (amount == null) return '—';
  return (
    <>
      {amount}{' '}
      m<sup>3</sup>
    </>
  );
}

function numOrEmpty(value) {
  if (value == null || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : '';
}

export default function WarehouseAssemblyInlineSpecs({
  assembly,
  canEdit,
  onUpdated,
  onError,
}) {
  const [dimL, setDimL] = useState(() => numOrEmpty(assembly?.dim_length));
  const [dimW, setDimW] = useState(() => numOrEmpty(assembly?.dim_width));
  const [dimH, setDimH] = useState(() => numOrEmpty(assembly?.dim_height));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDimL(numOrEmpty(assembly?.dim_length));
    setDimW(numOrEmpty(assembly?.dim_width));
    setDimH(numOrEmpty(assembly?.dim_height));
  }, [assembly?.id, assembly?.dim_length, assembly?.dim_width, assembly?.dim_height]);

  const saveDims = useCallback(async () => {
    if (!canEdit || !assembly?.id || saving) return;
    setSaving(true);
    try {
      const patch = await patchWarehouseAssemblyFields(assembly.id, {
        dim_length: dimL,
        dim_width: dimW,
        dim_height: dimH,
      });
      onUpdated?.(assembly.id, {
        dim_length: patch.dim_length,
        dim_width: patch.dim_width,
        dim_height: patch.dim_height,
      });
    } catch (err) {
      onError?.(err?.message || 'Failed to save dimensions');
    } finally {
      setSaving(false);
    }
  }, [assembly?.id, canEdit, dimH, dimL, dimW, onError, onUpdated, saving]);

  const dimDisplay = formatAssemblyDimensions(assembly) || '—';
  const volumeTitle = useMemo(() => {
    const src = volumeSourceAssembly(assembly, dimL, dimW, dimH);
    const amount = formatAssemblyVolumeAmount(src);
    if (amount == null) {
      return 'Enter length, width, and height in cm; volume is calculated in cubic metres (m³)';
    }
    return `L × W × H (cm) ÷ 1,000,000 = ${amount} m³`;
  }, [assembly, dimH, dimL, dimW]);

  if (!canEdit) {
    return (
      <div className="warehouse-assembly-card__specs">
        <div className="warehouse-inline-spec">
          <span className="warehouse-inline-spec__label">Dimensions:</span>
          <span className="warehouse-inline-spec__value">{dimDisplay}</span>
        </div>
        <div className="warehouse-inline-spec warehouse-inline-spec--locked">
          <span className="warehouse-inline-spec__label">Volume (m³):</span>
          <span className="warehouse-inline-spec__value">
            <VolumeM3Value assembly={assembly} dimL={dimL} dimW={dimW} dimH={dimH} />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="warehouse-assembly-card__specs">
      <div className="warehouse-inline-spec warehouse-inline-spec--edit">
        <span className="warehouse-inline-spec__label">Dimensions:</span>
        <span className="warehouse-inline-spec__dims">
          <input
            type="number"
            min="0"
            step="any"
            className="warehouse-inline-spec__input"
            value={dimL}
            placeholder="L"
            aria-label="Length cm"
            disabled={saving}
            onChange={(e) => setDimL(e.target.value)}
            onBlur={saveDims}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
          <span className="warehouse-inline-spec__sep" aria-hidden>×</span>
          <input
            type="number"
            min="0"
            step="any"
            className="warehouse-inline-spec__input"
            value={dimW}
            placeholder="W"
            aria-label="Width cm"
            disabled={saving}
            onChange={(e) => setDimW(e.target.value)}
            onBlur={saveDims}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
          <span className="warehouse-inline-spec__sep" aria-hidden>×</span>
          <input
            type="number"
            min="0"
            step="any"
            className="warehouse-inline-spec__input"
            value={dimH}
            placeholder="H"
            aria-label="Height cm"
            disabled={saving}
            onChange={(e) => setDimH(e.target.value)}
            onBlur={saveDims}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
          <span className="warehouse-inline-spec__unit">cm</span>
        </span>
      </div>
      <div className="warehouse-inline-spec warehouse-inline-spec--locked">
        <span className="warehouse-inline-spec__label">Volume (m³):</span>
        <span
          className="warehouse-inline-spec__value warehouse-inline-spec__value--calc"
          title={volumeTitle}
        >
          <VolumeM3Value assembly={assembly} dimL={dimL} dimW={dimW} dimH={dimH} />
        </span>
      </div>
    </div>
  );
}
