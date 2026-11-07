/* eslint-disable react/jsx-filename-extension */
import React from 'react';
import db from '../../dataClient';
import { formatDateOnly, formatDateTime } from './productsListDateFormat';

export default function ProductsListHeavyModals(p) {
  return (
    <>
{p.factoryStorageModalOpen && p.factoryStorageModalProduct && (
        <div className="factory-storage-overlay">
          <div className="factory-storage-modal">
            <div className="factory-storage-modal__header">
              <div>
                <h3 style={{margin:'0 0 4px'}}>Sold Products — {p.factoryStorageModalLabel}</h3>
                {p.factoryStorageModalIsCombo ? (
                  <div className="factory-storage-modal__subtitle">
                    Approx. holds: <b style={{color:'#e0e6ed'}}>{Number(p.factoryStorageComboHoldSets || 0).toLocaleString()}</b> set(s) (components tracked individually)
                  </div>
                ) : (
                  <div className="factory-storage-modal__subtitle">
                    Holds at warehouse: <b style={{color:'#e0e6ed'}}>{Number(p.modalFactoryHoldQty || 0).toLocaleString()}</b> units
                  </div>
                )}
              </div>
              <button onClick={p.closeFactoryStorageModal} className="factory-storage-close">Close</button>
            </div>
            {p.factoryStorageModalError && (
              <div className="factory-storage-modal__error">
                {p.factoryStorageModalError}
              </div>
            )}
            <div className="factory-storage-card">
              <h4 className="factory-storage-card__title">Record New Hold</h4>
              {!p.canEditFactoryHolds && (
                <div className="factory-storage-modal__subtitle" style={{ color: '#f4d35e', marginBottom: 8 }}>
                  Factory holds are view-only for your account.
                </div>
              )}
              <div className="factory-storage-form-grid">
                <div className="factory-storage-field">
                  <label className="factory-storage-field__label">{p.factoryStorageModalIsCombo ? 'Sets to Hold' : 'Quantity'}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={p.factoryStorageForm.quantity}
                    onChange={e => p.handleFactoryStorageFormChange('quantity', e.target.value)}
                    style={p.factoryModalInputStyle}
                    className="factory-storage-input"
                    disabled={!p.canEditFactoryHolds}
                  />
                </div>
                <div className="factory-storage-field">
                  <label className="factory-storage-field__label">Expected Release</label>
                  <input
                    type="date"
                    value={p.factoryStorageForm.expectedReleaseDate}
                    onChange={e => p.handleFactoryStorageFormChange('expectedReleaseDate', e.target.value)}
                    style={p.factoryModalInputStyle}
                    className="factory-storage-input"
                    disabled={!p.canEditFactoryHolds}
                  />
                </div>
                <div className="factory-storage-field">
                  <label className="factory-storage-field__label">Sale ID (optional)</label>
                  <input
                    value={p.factoryStorageForm.saleId}
                    onChange={e => p.handleFactoryStorageFormChange('saleId', e.target.value)}
                    style={p.factoryModalInputStyle}
                    className="factory-storage-input"
                    disabled={!p.canEditFactoryHolds}
                  />
                </div>
                <div className="factory-storage-field">
                  <label className="factory-storage-field__label">Sale Item ID</label>
                  <input
                    value={p.factoryStorageForm.saleItemId}
                    onChange={e => p.handleFactoryStorageFormChange('saleItemId', e.target.value)}
                    style={p.factoryModalInputStyle}
                    className="factory-storage-input"
                    disabled={!p.canEditFactoryHolds}
                  />
                </div>
                <div className="factory-storage-field">
                  <label className="factory-storage-field__label">Customer Name</label>
                  <input
                    value={p.factoryStorageForm.customerName}
                    onChange={e => p.handleFactoryStorageFormChange('customerName', e.target.value)}
                    style={p.factoryModalInputStyle}
                    className="factory-storage-input"
                    disabled={!p.canEditFactoryHolds}
                  />
                </div>
                <div className="factory-storage-field">
                  <label className="factory-storage-field__label">Customer Phone</label>
                  <input
                    value={p.factoryStorageForm.customerPhone}
                    onChange={e => p.handleFactoryStorageFormChange('customerPhone', e.target.value)}
                    style={p.factoryModalInputStyle}
                    className="factory-storage-input"
                    disabled={!p.canEditFactoryHolds}
                  />
                </div>
              </div>
              {p.factoryStorageModalIsCombo && (
                <div className="factory-storage-combo-preview">
                  <div style={{color:'#9aa4b2',fontSize:'0.9rem',marginBottom:8}}>Each set adds holds for every component:</div>
                  {!p.factoryStorageComboComponents.length ? (
                    <div style={{color:'#f4a261'}}>No components are linked to this set yet.</div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Component</th>
                          <th style={{textAlign:'center'}}>Qty / Set</th>
                          <th style={{textAlign:'center'}}>Hold Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.factoryStorageComboPreview.map(component => (
                          <tr key={component.product_id}>
                            <td>
                              <div style={{fontWeight:600}}>{component.productName}</div>
                              {component.sku && <div style={{color:'#9aa4b2',fontSize:'0.8rem'}}>SKU: {component.sku}</div>}
                            </td>
                            <td style={{textAlign:'center'}}>{Number(component.perSetQty || 0).toLocaleString()}</td>
                            <td style={{textAlign:'center'}}>{Number(component.holdQty || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
              <div className="factory-storage-field" style={{marginTop:12}}>
                <label className="factory-storage-field__label">Notes</label>
                <textarea
                  value={p.factoryStorageForm.notes}
                  onChange={e => p.handleFactoryStorageFormChange('notes', e.target.value)}
                  style={{...p.factoryModalInputStyle, minHeight:'70px'}}
                  className="factory-storage-input factory-storage-note"
                  placeholder="Optional remarks (e.g., who dropped the item off)"
                  disabled={!p.canEditFactoryHolds}
                />
              </div>
              <div className="factory-storage-actions">
                <button
                  onClick={p.handleCreateFactoryStorageEntry}
                  disabled={!p.canEditFactoryHolds || p.factoryStorageSubmitting}
                  style={{
                    background:'#2a9d8f',
                    color:'#fff',
                    border:'none',
                    borderRadius:'6px',
                    padding:'10px 18px',
                    fontWeight:'bold',
                    cursor: (!p.canEditFactoryHolds || p.factoryStorageSubmitting) ? 'not-allowed' : 'pointer',
                    opacity: p.canEditFactoryHolds ? 1 : 0.6
                  }}
                >{p.factoryStorageSubmitting ? 'Saving…' : 'Save Hold'}</button>
              </div>
            </div>
            <div className="factory-storage-active">
              <h4 style={{margin:'0 0 12px'}}>Active Holds</h4>
              {p.factoryStorageRowsLoading ? (
                <div>Loading storage rows…</div>
              ) : p.factoryStorageModalRows.length === 0 ? (
                <div style={{color:'#9aa4b2'}}>No active holds recorded for this item.</div>
              ) : (
                <div className="factory-storage-active__table-wrapper">
                  <table className="factory-storage-active__table">
                    <thead>
                      <tr style={{background:'#223040'}}>
                        <th style={{padding:8,textAlign:'left',borderBottom:'1px solid #2b3a4f'}}>Status</th>
                        <th style={{padding:8,textAlign:'left',borderBottom:'1px solid #2b3a4f'}}>{p.factoryStorageModalItemHeader}</th>
                        <th style={{padding:8,borderBottom:'1px solid #2b3a4f'}}>Stored</th>
                        <th style={{padding:8,borderBottom:'1px solid #2b3a4f'}}>Released</th>
                        <th style={{padding:8,borderBottom:'1px solid #2b3a4f'}}>Remaining</th>
                        <th style={{padding:8,textAlign:'left',borderBottom:'1px solid #2b3a4f'}}>Stored At</th>
                        <th style={{padding:8,textAlign:'left',borderBottom:'1px solid #2b3a4f'}}>Expected Release</th>
                        <th style={{padding:8,textAlign:'left',borderBottom:'1px solid #2b3a4f'}}>Customer</th>
                        <th style={{padding:8,textAlign:'left',borderBottom:'1px solid #2b3a4f'}}>Reference</th>
                        <th style={{padding:8,textAlign:'left',borderBottom:'1px solid #2b3a4f'}}>Notes</th>
                        <th style={{padding:8,textAlign:'center',borderBottom:'1px solid #2b3a4f'}}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.factoryStorageModalRows.map((row) => {
                        const storedQty = Number(row.quantity || 0);
                        const releasedQty = Number(row.quantity_released || 0);
                        const remainingQty = Math.max(0, storedQty - releasedQty);
                        const itemLabel = p.factoryStorageModalIsCombo
                          ? (p.factoryStorageComboComponentMap.get(String(row.product_id))?.productName || `Product ${row.product_id}`)
                          : 'Base product';
                        const componentMeta = p.factoryStorageModalIsCombo
                          ? p.factoryStorageComboComponentMap.get(String(row.product_id))
                          : null;
                        const isDraft = p.factoryStorageReleaseDraft.storageId === row.id;
                        const isEditingRow = p.factoryStorageEditDraft?.storageId === row.id;
                        return (
                          <tr key={row.id} style={{background:'#121a27'}}>
                            <td style={{padding:8,textTransform:'capitalize'}}>{row.status}</td>
                            <td style={{padding:8}}>
                              {itemLabel}
                              {componentMeta?.sku && (
                                <div style={{color:'#9aa4b2',fontSize:'0.8rem'}}>SKU: {componentMeta.sku}</div>
                              )}
                            </td>
                            <td style={{padding:8,textAlign:'center'}}>{storedQty.toLocaleString()}</td>
                            <td style={{padding:8,textAlign:'center'}}>{releasedQty.toLocaleString()}</td>
                            <td style={{padding:8,textAlign:'center',color: remainingQty > 0 ? '#f4d35e' : '#9aa4b2'}}>{remainingQty.toLocaleString()}</td>
                            <td style={{padding:8}}>{formatDateTime(row.stored_at)}</td>
                            <td style={{padding:8}}>{formatDateOnly(row.expected_release_date)}</td>
                            <td style={{padding:8}}>{row.customer_name || '-'}</td>
                            <td style={{padding:8}}>{row.release_reference || '-'}</td>
                            <td style={{padding:8}}>{row.notes || '-'}</td>
                            <td style={{padding:8,width:'190px'}}>
                              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                                <button
                                  style={{background:'#ffb703',color:'#1b1b1b',border:'none',borderRadius:'6px',padding:'6px 10px',fontWeight:'bold',cursor: remainingQty > 0 && !p.factoryStorageReleaseBusy ? 'pointer' : 'not-allowed'}}
                                  disabled={!p.canEditFactoryHolds || remainingQty <= 0 || p.factoryStorageReleaseBusy}
                                  onClick={() => p.startFactoryStorageRelease(row)}
                                >Release</button>
                                <button
                                  style={{background:'#457b9d',color:'#fff',border:'none',borderRadius:'6px',padding:'6px 10px',fontWeight:'bold',cursor: p.factoryStorageEditBusy && isEditingRow ? 'wait' : 'pointer'}}
                                  disabled={!p.canEditFactoryHolds || (p.factoryStorageEditBusy && isEditingRow)}
                                  onClick={() => p.startFactoryStorageEdit(row)}
                                >Edit</button>
                                {isDraft && (
                                  <div className="factory-storage-release-draft">
                                    <div style={{fontSize:'0.85rem',color:'#9aa4b2'}}>Available: {remainingQty.toLocaleString()}</div>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={p.factoryStorageReleaseDraft.qty}
                                      onChange={e => p.setFactoryStorageReleaseDraft(prev => ({ ...prev, qty: e.target.value }))}
                                      style={{...p.factoryModalInputStyle}}
                                      className="factory-storage-input"
                                      disabled={!p.canEditFactoryHolds}
                                    />
                                    <input
                                      value={p.factoryStorageReleaseDraft.reference}
                                      onChange={e => p.setFactoryStorageReleaseDraft(prev => ({ ...prev, reference: e.target.value }))}
                                      placeholder="Release reference"
                                      style={{...p.factoryModalInputStyle}}
                                      className="factory-storage-input"
                                      disabled={!p.canEditFactoryHolds}
                                    />
                                    <textarea
                                      value={p.factoryStorageReleaseDraft.note}
                                      onChange={e => p.setFactoryStorageReleaseDraft(prev => ({ ...prev, note: e.target.value }))}
                                      placeholder="Notes"
                                      style={{...p.factoryModalInputStyle, minHeight:'60px'}}
                                      className="factory-storage-input"
                                      disabled={!p.canEditFactoryHolds}
                                    />
                                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                                      <button
                                        onClick={p.submitFactoryStorageRelease}
                                        disabled={!p.canEditFactoryHolds || p.factoryStorageReleaseBusy}
                                        style={{
                                          background:'#2a9d8f',
                                          color:'#fff',
                                          border:'none',
                                          borderRadius:'6px',
                                          padding:'6px 12px',
                                          fontWeight:'bold',
                                          cursor: (!p.canEditFactoryHolds || p.factoryStorageReleaseBusy) ? 'not-allowed' : 'pointer',
                                          opacity: p.canEditFactoryHolds ? 1 : 0.6
                                        }}
                                      >{p.factoryStorageReleaseBusy ? 'Saving…' : 'Confirm'}</button>
                                      <button
                                        onClick={p.cancelFactoryStorageRelease}
                                        style={{background:'#e63946',color:'#fff',border:'none',borderRadius:'6px',padding:'6px 12px',fontWeight:'bold',cursor:'pointer'}}
                                      >Cancel</button>
                                    </div>
                                  </div>
                                )}
                                {isEditingRow && (
                                  <div className="factory-storage-edit-draft">
                                    <div className="factory-storage-edit-grid">
                                      <div className="factory-storage-field">
                                        <label className="factory-storage-field__label">Expected Release</label>
                                        <input
                                          type="date"
                                          value={p.factoryStorageEditDraft.expectedReleaseDate}
                                          onChange={e => p.handleFactoryStorageEditChange('expectedReleaseDate', e.target.value)}
                                          style={p.factoryModalInputStyle}
                                          className="factory-storage-input"
                                          disabled={!p.canEditFactoryHolds}
                                        />
                                      </div>
                                      <div className="factory-storage-field">
                                        <label className="factory-storage-field__label">Sale ID</label>
                                        <input
                                          value={p.factoryStorageEditDraft.saleId}
                                          onChange={e => p.handleFactoryStorageEditChange('saleId', e.target.value)}
                                          style={p.factoryModalInputStyle}
                                          className="factory-storage-input"
                                          disabled={!p.canEditFactoryHolds}
                                        />
                                      </div>
                                      <div className="factory-storage-field">
                                        <label className="factory-storage-field__label">Sale Item ID</label>
                                        <input
                                          value={p.factoryStorageEditDraft.saleItemId}
                                          onChange={e => p.handleFactoryStorageEditChange('saleItemId', e.target.value)}
                                          style={p.factoryModalInputStyle}
                                          className="factory-storage-input"
                                          disabled={!p.canEditFactoryHolds}
                                        />
                                      </div>
                                      <div className="factory-storage-field">
                                        <label className="factory-storage-field__label">Customer Name</label>
                                        <input
                                          value={p.factoryStorageEditDraft.customerName}
                                          onChange={e => p.handleFactoryStorageEditChange('customerName', e.target.value)}
                                          style={p.factoryModalInputStyle}
                                          className="factory-storage-input"
                                          disabled={!p.canEditFactoryHolds}
                                        />
                                      </div>
                                      <div className="factory-storage-field">
                                        <label className="factory-storage-field__label">Customer Phone</label>
                                        <input
                                          value={p.factoryStorageEditDraft.customerPhone}
                                          onChange={e => p.handleFactoryStorageEditChange('customerPhone', e.target.value)}
                                          style={p.factoryModalInputStyle}
                                          className="factory-storage-input"
                                          disabled={!p.canEditFactoryHolds}
                                        />
                                      </div>
                                    </div>
                                    <div className="factory-storage-field">
                                      <label className="factory-storage-field__label">Notes</label>
                                      <textarea
                                        value={p.factoryStorageEditDraft.notes}
                                        onChange={e => p.handleFactoryStorageEditChange('notes', e.target.value)}
                                        style={{...p.factoryModalInputStyle, minHeight:'60px'}}
                                        className="factory-storage-input"
                                        disabled={!p.canEditFactoryHolds}
                                      />
                                    </div>
                                    <div className="factory-storage-edit-actions">
                                      <button
                                        onClick={p.submitFactoryStorageEdit}
                                        disabled={!p.canEditFactoryHolds || p.factoryStorageEditBusy}
                                        style={{
                                          background:'#2a9d8f',
                                          color:'#fff',
                                          border:'none',
                                          borderRadius:'6px',
                                          padding:'6px 12px',
                                          fontWeight:'bold',
                                          cursor: (!p.canEditFactoryHolds || p.factoryStorageEditBusy) ? 'not-allowed' : 'pointer',
                                          opacity: p.canEditFactoryHolds ? 1 : 0.6
                                        }}
                                      >{p.factoryStorageEditBusy ? 'Saving…' : 'Save Changes'}</button>
                                      <button
                                        onClick={p.cancelFactoryStorageEdit}
                                        style={{background:'#e63946',color:'#fff',border:'none',borderRadius:'6px',padding:'6px 12px',fontWeight:'bold',cursor:'pointer'}}
                                      >Cancel</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Edit Modal (Product, Set, or bulk products) */}
      {p.imageEditModalOpen && (p.imageEditProduct || (p.imageEditBulkProducts && p.imageEditBulkProducts.length > 0)) && (
        <div className="products-image-modal-overlay">
          <div className="products-image-modal">
            <h3 className="products-image-modal__title">
              {p.imageEditBulkProducts?.length > 1
                ? `Apply Image to ${p.imageEditBulkProducts.length} Products`
                : (p.imageEditProduct?.__isCombo ? 'Edit Set Image' : 'Edit Product Image')}
            </h3>
            <div className="products-image-modal__meta">
              {p.imageEditBulkProducts?.length > 1 ? (
                <>
                  <div>Selected products:</div>
                  <ul className="products-image-modal__bulk-list">
                    {p.imageEditBulkProducts.map((row) => (
                      <li key={row.id}>
                        <b>{row.name}</b>
                        {row.sku ? ` (${row.sku})` : ''}
                      </li>
                    ))}
                  </ul>
                </>
              ) : p.imageEditProduct?.__isCombo ? (
                <>Set: <b>{p.imageEditProduct.combo_name}</b></>
              ) : (
                <>Product: <b>{p.imageEditProduct?.name || p.imageEditBulkProducts?.[0]?.name}</b></>
              )}
            </div>
            <input type="file" accept="image/*" onChange={e => p.setImageEditFile(e.target.files[0])} className="products-image-modal__file" />
            {!p.imageEditBulkProducts?.length && (p.imageEditProduct?.__isCombo ? p.imageEditProduct.picture_url : p.imageEditProduct?.image_url) && (
              <div className="products-image-modal__preview-row">
                <img src={p.imageEditProduct.__isCombo ? p.imageEditProduct.picture_url : p.imageEditProduct.image_url} alt="Current" className="products-image-modal__preview" />
                <button
                  onClick={async () => {
                    p.setImageEditLoading(true);
                    try {
                      if (p.imageEditProduct.__isCombo) {
                        await db.from('combos').update({ picture_url: '' }).eq('id', p.imageEditProduct.id);
                      } else {
                        await db.from('product_images').delete().eq('product_id', p.imageEditProduct.id);
                        await db.from('products').update({ image_url: '' }).eq('id', p.imageEditProduct.id);
                      }
                      await p.purgeExistingStorageImages(p.imageEditProduct.id, Boolean(p.imageEditProduct.__isCombo));
                      p.setImageEditModalOpen(false);
                      p.setImageEditProduct(null);
                      p.setImageEditBulkProducts(null);
                      p.setImageEditFile(null);
                      await p.fetchAll();
                    } catch (err) {
                      alert('Failed to remove image: ' + (err.message || err));
                    } finally {
                      p.setImageEditLoading(false);
                    }
                  }}
                  className="products-image-modal__btn products-image-modal__btn--danger"
                  disabled={p.imageEditLoading}
                >Remove Image</button>
              </div>
            )}
            <div className="products-image-modal__actions">
              <button
                disabled={!p.imageEditFile || p.imageEditLoading}
                onClick={async () => {
                  if (!p.imageEditFile) return;
                  p.setImageEditLoading(true);
                  try {
                    const file = p.imageEditFile;
                    if (p.imageEditBulkProducts?.length > 1) {
                      for (let i = 0; i < p.imageEditBulkProducts.length; i += 1) {
                        const row = p.imageEditBulkProducts[i];
                        await p.applyImageFileToItem({
                          itemId: row.id,
                          isCombo: false,
                          file,
                          fileNonce: `${Date.now()}-${i}`,
                        });
                      }
                      const appliedIds = p.imageEditBulkProducts.map((row) => String(row.id));
                      p.setBulkSelectionMap((prev) => {
                        const next = { ...prev };
                        appliedIds.forEach((id) => {
                          delete next[`prod:${id}`];
                        });
                        return next;
                      });
                      p.setToolbarNotice(`Image applied to ${p.imageEditBulkProducts.length} products.`);
                    } else {
                      const target = p.imageEditProduct || {
                        id: p.imageEditBulkProducts[0].id,
                        __isCombo: false,
                      };
                      const isCombo = Boolean(target.__isCombo);
                      await p.applyImageFileToItem({
                        itemId: target.id,
                        isCombo,
                        file,
                      });
                    }
                    p.setImageEditModalOpen(false);
                    p.setImageEditProduct(null);
                    p.setImageEditBulkProducts(null);
                    p.setImageEditFile(null);
                    await p.fetchAll();
                  } catch (err) {
                    alert('Failed to upload image: ' + (err.message || err));
                  } finally {
                    p.setImageEditLoading(false);
                  }
                }}
                className="products-image-modal__btn products-image-modal__btn--primary"
              >{p.imageEditBulkProducts?.length > 1 ? 'Apply to All' : 'Save'}</button>
              <button
                onClick={() => {
                  p.setImageEditModalOpen(false);
                  p.setImageEditProduct(null);
                  p.setImageEditBulkProducts(null);
                  p.setImageEditFile(null);
                }}
                className="products-image-modal__btn products-image-modal__btn--secondary"
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Planner UI removed */}

      {/* Manual Inventory Adjust / Set Assembly Modal */}
      {p.adjustModalOpen && p.adjustProduct && (
        <div className="products-adjust-modal-overlay">
          <div className="products-adjust-modal">
            <h3 className="products-adjust-modal__title">{p.adjustProduct.__isCombo ? (p.adjustSetMode === 'assemble' ? 'Assemble Set' : 'Receive Sets') : (p.transferMode==='transfer' ? 'Transfer Between Locations' : 'Adjust Inventory')}</h3>
            <div className="products-adjust-modal__meta">
              {p.adjustProduct.__isCombo ? (
                <>Set: <b>{p.adjustProduct.combo_name}</b> (SKU: {p.adjustProduct.sku})</>
              ) : (
                <>Product: <b>{p.adjustProduct.name}</b> (SKU: {p.adjustProduct.sku})</>
              )}
            </div>
            <div className="products-adjust-modal__row">
              <label className="products-adjust-modal__label">Location:</label>
              <select
                value={p.selectedLocation}
                onChange={(e) => {
                  const lid = e.target.value;
                  p.setSelectedLocation(lid);
                  if (p.adjustProduct) {
                    if (p.adjustProduct.__isCombo) {
                      if (p.adjustSetMode === 'assemble') {
                        const b = p.computeComboMaxQty(p.adjustProduct.id, lid);
                        p.setAdjustQty(b > 0 ? 1 : 0);
                      } else {
                        p.setAdjustQty(1);
                      }
                    } else {
                      p.setAdjustQty(p.getStockForProduct(p.adjustProduct.id, lid));
                    }
                  }
                }}
                className="products-adjust-modal__control"
              >
                {p.locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            {false && !p.adjustProduct.__isCombo && p.transferMode === 'transfer' && (
              <div className="products-adjust-modal__transfer-block">
                <div className="products-adjust-modal__hint">Move stock between locations</div>
                <div className="products-adjust-modal__transfer-row">
                  <label className="products-adjust-modal__label">From:</label>
                  <select value={p.transferFrom} onChange={e=>p.setTransferFrom(e.target.value)} className="products-adjust-modal__control">
                    <option value="">-- From --</option>
                    {p.locations.map(l=> <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <span className="products-adjust-modal__hint">
                    {(() => {
                      if (!p.transferFrom) return 'Select from';
                      const fromUuid = p.resolveLocationUuid(p.transferFrom);
                      const inv = p.inventory.find(r => String(r.location)===String(fromUuid) && String(r.product_id)===String(p.adjustProduct.id));
                      const q = inv ? Number(inv.quantity)||0 : 0;
                      return `Qty: ${q}`;
                    })()}
                  </span>
                </div>
                <div className="products-adjust-modal__transfer-row">
                  <label className="products-adjust-modal__label">To:</label>
                  <select value={p.transferTo} onChange={e=>p.setTransferTo(e.target.value)} className="products-adjust-modal__control">
                    <option value="">-- To --</option>
                    {p.locations.map(l=> <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <span className="products-adjust-modal__hint">
                    {(() => {
                      if (!p.transferTo) return 'Select to';
                      const toUuid = p.resolveLocationUuid(p.transferTo);
                      const inv = p.inventory.find(r => String(r.location)===String(toUuid) && String(r.product_id)===String(p.adjustProduct.id));
                      const q = inv ? Number(inv.quantity)||0 : 0;
                      return `Qty: ${q}`;
                    })()}
                  </span>
                </div>
                {/* Date selection only (no time) */}
                <div className="products-adjust-modal__date-group">
                  <div className="products-adjust-modal__transfer-row products-adjust-modal__transfer-row--wrap">
                    <label className="products-adjust-modal__label">Transfer time:</label>
                    <div className="products-adjust-modal__transfer-row">
                      <label className="products-adjust-modal__label">Date:</label>
                      <input
                        type="date"
                        required
                        value={p.manualTransferDate}
                        onChange={e=>p.setManualTransferDate(e.target.value)}
                        className="products-adjust-modal__control products-adjust-modal__date-input"
                      />
                    </div>
                  </div>
                </div>
                <div className="products-adjust-modal__transfer-row">
                  <label className="products-adjust-modal__label">Amount:</label>
                  <input type="number" min={0} className="products-adjust-modal__control products-adjust-modal__qty-input" value={p.transferQty} onChange={e=>p.setTransferQty(e.target.value)} />
                  <button disabled={p.transferBusy || !p.transferFrom || !p.transferTo || !p.transferQty || Number(p.transferQty)<=0 || p.transferFrom===p.transferTo}
                    onClick={async ()=>{
                      if (!p.adjustProduct) return;
                      p.setTransferBusy(true);
                      try {
                        const qty = Number(p.transferQty);
                        if (!Number.isFinite(qty) || qty<=0) throw new Error('Enter a valid amount');
                        if (p.transferFrom===p.transferTo) throw new Error('Select different locations');
                        // Resolve UUIDs for session/product_locations tables
                        const fromUuid = p.resolveLocationUuid(p.transferFrom);
                        const toUuid = p.resolveLocationUuid(p.transferTo);
                        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                        if (!UUID_RE.test(fromUuid) || !UUID_RE.test(toUuid)) {
                          throw new Error('Location IDs are not UUIDs. Please ensure locations use UUID IDs.');
                        }
                        // Create a minimal transfer session and entry for one product
                        // Read current app user from localStorage
                        let userId = null; // Firebase Auth UID
                        let legacyUserIntId = null; // optional legacy int id for compatibility
                        try {
                          const raw = localStorage.getItem('user');
                          const u = raw ? JSON.parse(raw) : null;
                          userId = u?.id ?? null;
                          const email = u?.email || '';
                          if (email) {
                            try {
                              const { data: legacyUser } = await db
                                .from('users')
                                .select('id')
                                .eq('email', email)
                                .maybeSingle();
                              if (legacyUser && legacyUser.id != null) legacyUserIntId = legacyUser.id;
                            } catch {}
                          }
                        } catch {}
                        // Determine transfer date (no time component)
                        let sessionCreatedAtIso = new Date().toISOString();
                        let sessionTransferDate = new Date().toISOString().slice(0,10);
                        if (p.manualTransferDate) {
                          const dtLocal = new Date(`${p.manualTransferDate}T00:00:00`);
                          if (!isNaN(dtLocal.getTime())) {
                            sessionCreatedAtIso = dtLocal.toISOString();
                            sessionTransferDate = p.manualTransferDate;
                          }
                        }
                        const payload = {
                          from_location: fromUuid,
                          to_location: toUuid,
                          // write UUID into new column; avoid integer user_id mismatch
                          user_uid: userId,
                          transfer_date: sessionTransferDate,
                          created_at: sessionCreatedAtIso,
                          transfer_datetime: sessionCreatedAtIso
                        };
                        // Add legacy user_id if required by the schema (best-effort)
                        if (legacyUserIntId != null) payload.user_id = legacyUserIntId;
                        const { data: session, error: sessErr } = await db
                          .from('stock_transfer_sessions')
                          .insert(payload)
                          .select()
                          .single();
                        if (sessErr) throw sessErr;
                        const sessionId = session.id;
                        const { error: entryErr } = await db.from('stock_transfer_entries').insert({
                          session_id: sessionId,
                          product_id: p.adjustProduct.id,
                          quantity: qty
                        });
                        if (entryErr) throw entryErr;
                        // Apply inventory changes
                        const nowIso = new Date().toISOString();
                        const { data: invFrom } = await db.from('inventory').select('id, quantity').eq('product_id', p.adjustProduct.id).eq('location', fromUuid).maybeSingle();
                        if (invFrom) {
                          await p.applyInventoryBulk({
                            updates: [{ id: invFrom.id, quantity: Math.max(0, Number(invFrom.quantity || 0) - qty), updated_at: nowIso }],
                          }, db);
                        }
                        const { data: invTo } = await db.from('inventory').select('id, quantity').eq('product_id', p.adjustProduct.id).eq('location', toUuid).maybeSingle();
                        if (invTo) {
                          await p.applyInventoryBulk({
                            updates: [{ id: invTo.id, quantity: Number(invTo.quantity || 0) + qty, updated_at: nowIso }],
                          }, db);
                        } else {
                          await p.applyInventoryBulk({
                            inserts: [{ product_id: p.adjustProduct.id, location: toUuid, quantity: qty, updated_at: nowIso }],
                          }, db);
                        }
                        // Ensure product_locations link exists for the destination
                        await p.syncProductLocations({ rows: [{ product_id: p.adjustProduct.id, location_id: toUuid }] }, db);
                        await p.refreshInventoryForLocations([fromUuid, toUuid]);
                        p.setAdjustModalOpen(false);
                      } catch (err) {
                        try {
                          const msg = (err && (err.message || err.error_description)) ? String(err.message || err.error_description) : 'Failed to transfer';
                          const details = (err && (err.details || err.hint)) ? `\n${err.details || err.hint}` : '';
                          const debug = (err && typeof err === 'object') ? `\n${JSON.stringify(err, null, 2)}` : '';
                          alert(`${msg}${details}${debug}`);
                        } catch {
                          alert('Failed to transfer');
                        }
                      } finally {
                        p.setTransferBusy(false);
                      }
                    }}
                    className="products-adjust-modal__btn products-adjust-modal__btn--primary"
                  >Transfer</button>
                </div>
              </div>
            )}
            {p.adjustProduct.__isCombo ? (
              <div className="products-adjust-modal__hint products-adjust-modal__hint--bottom">
                {p.selectedLocation ? (
                  (() => {
                    const b = p.computeComboMaxQty(p.adjustProduct.id, p.selectedLocation);
                    const locName = p.locations.find(l => String(l.id) === String(p.selectedLocation))?.name || '';
                    return <span>Buildable Sets at {locName}: <b style={{color:'#e0e6ed'}}>{b}</b></span>;
                  })()
                ) : (
                  <span>Select a location to view buildable sets</span>
                )}
              </div>
            ) : (
              <div className="products-adjust-modal__hint products-adjust-modal__hint--bottom">
                {p.selectedLocation
                  ? (
                    (() => {
                      const qty = p.getStockForProduct(p.adjustProduct.id, p.selectedLocation);
                      const locName = p.locations.find(l => String(l.id) === String(p.selectedLocation))?.name || '';
                      return <span>Current Qty at {locName}: <b style={{color:'#e0e6ed'}}>{qty}</b></span>;
                    })()
                  )
                  : (<span>Select a location to view current quantity</span>)}
              </div>
            )}
            {p.adjustProduct.__isCombo && (
              <div className="products-adjust-modal__row">
                <label className="products-adjust-modal__label">Mode:</label>
                <select value={p.adjustSetMode} onChange={e => {
                  const mode = e.target.value;
                  p.setAdjustSetMode(mode);
                  if (mode === 'assemble') {
                    const b = p.computeComboMaxQty(p.adjustProduct.id, p.selectedLocation || '');
                    p.setAdjustQty(b > 0 ? 1 : 0);
                  } else {
                    p.setAdjustQty(1);
                  }
                }} className="products-adjust-modal__control">
                  <option value="receive">Receive (increase components)</option>
                  <option value="assemble">Assemble (consume components)</option>
                </select>
              </div>
            )}
            <div className="products-adjust-modal__row">
              {p.adjustProduct.__isCombo ? (
                <>
                  <label className="products-adjust-modal__label">{p.adjustSetMode === 'assemble' ? 'Assemble Sets:' : 'Receive Sets:'}</label>
                  <input type="number" min={1} value={p.adjustQty} onChange={e => p.setAdjustQty(e.target.value)} className="products-adjust-modal__control products-adjust-modal__qty-input" />
                </>
              ) : (
                <>
                  <label className="products-adjust-modal__label">Quantity:</label>
                  <input type="number" value={p.adjustQty} onChange={e => p.setAdjustQty(e.target.value)} className="products-adjust-modal__control products-adjust-modal__qty-input" />
                </>
              )}
            </div>
            <div className="products-adjust-modal__actions">
              {p.transferMode!=='transfer' && (
                <button onClick={p.handleAdjustInventory} disabled={p.adjustLoading || !p.adjustQty} className="products-adjust-modal__btn products-adjust-modal__btn--primary">
                  {p.adjustLoading ? 'Saving...' : 'Save'}
                </button>
              )}
              <button onClick={()=>p.setAdjustModalOpen(false)} className="products-adjust-modal__btn products-adjust-modal__btn--secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
      
    </>
  );
}
