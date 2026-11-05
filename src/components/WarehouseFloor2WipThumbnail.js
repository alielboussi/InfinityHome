import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  removeWarehouseFloor2WipFamilyImage,
  removeWarehouseFloor2WipImage,
  uploadWarehouseFloor2WipFamilyImage,
  uploadWarehouseFloor2WipImage,
} from '../services/warehouseCatalog';
import {
  readWarehouseFloor2WipFamilyImageUrl,
  readWarehouseFloor2WipImageUrl,
} from '../utils/warehouseFloor2WipImage';
import { rewriteLegacyStorageUrl } from '../utils/storageImageUrl';
import { fileToSquareCatalogImage } from '../utils/squareCatalogImage';

const ZOOM_MAX_PX = 512;

function clampZoomPosition(rect, displayPx) {
  const margin = 12;
  const maxSize = Math.min(
    displayPx,
    window.innerWidth - margin * 2,
    window.innerHeight - margin * 2,
  );
  let left = rect.right + margin;
  let top = rect.top + rect.height / 2 - maxSize / 2;
  if (left + maxSize > window.innerWidth - margin) {
    left = rect.left - margin - maxSize;
  }
  if (left < margin) {
    left = Math.max(margin, (window.innerWidth - maxSize) / 2);
  }
  top = Math.max(margin, Math.min(top, window.innerHeight - maxSize - margin));
  return { left, top, size: maxSize };
}

/**
 * Floor 2 WIP photo — production apps only (not Floor 1 image_url).
 * @param {'component'|'family'} imageKind — variant vs shared family cover
 * @param {string[]} [familyAssemblyIds] — all variant ids when imageKind is family
 */
export default function WarehouseFloor2WipThumbnail({
  assembly,
  imageKind = 'component',
  familyAssemblyIds,
  canEdit,
  onUpdated,
  onFamilyUpdated,
  onError,
  compactLabel,
}) {
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(null);
  const isFamily = imageKind === 'family';
  const rawUrl = isFamily
    ? readWarehouseFloor2WipFamilyImageUrl(assembly)
    : readWarehouseFloor2WipImageUrl(assembly);
  const displayUrl = rawUrl
    ? rewriteLegacyStorageUrl(rawUrl, { bucket: 'productimages' })
    : '';

  const siblingIds = (familyAssemblyIds && familyAssemblyIds.length
    ? familyAssemblyIds
    : [assembly?.id]).filter(Boolean).map(String);

  const openPicker = () => {
    if (!canEdit || busy) return;
    inputRef.current?.click();
  };

  const onRemovePhoto = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canEdit || busy || !assembly?.id || !displayUrl) return;
    const msg = isFamily
      ? 'Remove the family WIP photo for all variants?'
      : 'Remove this variant WIP photo?';
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      if (isFamily) {
        await removeWarehouseFloor2WipFamilyImage(siblingIds);
        onFamilyUpdated?.(siblingIds, '');
      } else {
        await removeWarehouseFloor2WipImage(assembly.id);
        onUpdated?.(assembly.id, '');
      }
    } catch (err) {
      onError?.(err?.message || 'Failed to remove image');
    } finally {
      setBusy(false);
    }
  };

  const onFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !assembly?.id) return;
    setBusy(true);
    try {
      const squareFile = await fileToSquareCatalogImage(file, undefined, { fit: 'contain' });
      if (isFamily) {
        const url = await uploadWarehouseFloor2WipFamilyImage(siblingIds, squareFile);
        onFamilyUpdated?.(siblingIds, url);
      } else {
        const url = await uploadWarehouseFloor2WipImage(assembly.id, squareFile);
        onUpdated?.(assembly.id, url);
      }
    } catch (err) {
      onError?.(err?.message || 'Failed to upload image');
    } finally {
      setBusy(false);
    }
  };

  const placeholder = compactLabel || (isFamily ? 'Family' : 'Variant');
  const label = canEdit
    ? (displayUrl
      ? (isFamily ? 'Change family WIP photo' : 'Change variant WIP photo')
      : (isFamily ? 'Add family WIP photo' : 'Add variant WIP photo'))
    : (displayUrl ? 'WIP photo' : 'No WIP photo');

  const showZoom = useCallback(() => {
    if (!displayUrl || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const displayPx = ZOOM_MAX_PX;
    setZoom({ ...clampZoomPosition(rect, displayPx), url: displayUrl, displayPx });
  }, [displayUrl]);

  const hideZoom = useCallback(() => {
    setZoom(null);
  }, []);

  return (
    <>
      <div
        ref={wrapRef}
        className={`warehouse-assembly-thumb-wrap${displayUrl ? ' has-image' : ''}`}
        onMouseEnter={displayUrl ? showZoom : undefined}
        onMouseLeave={displayUrl ? hideZoom : undefined}
        onFocus={displayUrl ? showZoom : undefined}
        onBlur={displayUrl ? hideZoom : undefined}
      >
        <button
          type="button"
          className={`warehouse-assembly-thumb${displayUrl ? ' has-image' : ''}${busy ? ' is-busy' : ''}`}
          onClick={openPicker}
          disabled={!canEdit || busy}
          aria-label={label}
          title={canEdit ? label : undefined}
        >
          {displayUrl ? (
            <img
              src={displayUrl}
              alt=""
              className="warehouse-assembly-thumb__img"
            />
          ) : (
            <span className="warehouse-assembly-thumb__placeholder">
              <span className="warehouse-assembly-thumb__placeholder-icon" aria-hidden>▦</span>
              <span>{canEdit ? placeholder : '—'}</span>
            </span>
          )}
          {busy ? <span className="warehouse-assembly-thumb__busy" aria-hidden>…</span> : null}
        </button>
        {canEdit && displayUrl ? (
          <button
            type="button"
            className="warehouse-assembly-thumb__remove"
            onClick={onRemovePhoto}
            disabled={busy}
          >
            Remove
          </button>
        ) : null}
      </div>
      {zoom && typeof document !== 'undefined'
        ? createPortal(
          <div
            className="warehouse-assembly-thumb-flyout"
            style={{
              position: 'fixed',
              left: zoom.left,
              top: zoom.top,
              width: zoom.displayPx,
              height: zoom.displayPx,
              zIndex: 10050,
            }}
            aria-hidden
          >
            <img
              src={zoom.url}
              alt=""
              className="warehouse-assembly-thumb-flyout__img"
              width={zoom.displayPx}
              height={zoom.displayPx}
            />
          </div>,
          document.body,
        )
        : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onFileChange}
      />
    </>
  );
}
