import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from './supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { applyInventoryBulk } from './utils/inventoryApi';
import { syncProductLocations } from './services/productLocations';

const FROM_LOCATION_ID = '454a092c-5b12-441e-b99d-216f6fa72198';
const TO_LOCATION_ID = 'f72aa989-3888-4a45-96ed-15dc45b5d399';
const LS_KEY = 'pendingOutletTransfer';
const BUCKET = 'WarehouseTransfers';

const toDMY = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
};

const formatDateTimeDMY = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${toDMY(d)} ${time}`;
};

export default function OutletTransferSummary() {
  const navigate = useNavigate();
  const [transfer, setTransfer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [company, setCompany] = useState(null);
  const [toast, setToast] = useState(null);
  const autoDownloadFlag = useRef(false);
  const [remainingPreview, setRemainingPreview] = useState(new Map());
  const [destPreview, setDestPreview] = useState(new Map());
  const [fromName, setFromName] = useState('');
  const [toName, setToName] = useState('');

  const fromLabel = fromName || FROM_LOCATION_ID;
  const toLabel = toName || TO_LOCATION_ID;

  useEffect(() => {
    try {
      (async () => {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) { setTransfer(JSON.parse(raw)); }
        else { navigate('/Kitwe-Lusaka'); }
      })();
    } catch { navigate('/Kitwe-Lusaka'); }
  }, [navigate]);

  useEffect(() => {
    if (autoDownloadFlag.current) return;
    const metaRaw = localStorage.getItem('lastWarehouseTransferPdf');
    if (metaRaw) {
      try {
        const meta = JSON.parse(metaRaw);
        if (meta.url && (!meta.ts || Date.now() - meta.ts < 10 * 60 * 1000)) {
          triggerDownload(meta.url, meta.filename || 'outlet_transfer.pdf');
          autoDownloadFlag.current = true;
          localStorage.removeItem('lastWarehouseTransferPdf');
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('company_settings').select('*').single();
        setCompany(data || {});
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('locations')
          .select('id, name')
          .in('id', [FROM_LOCATION_ID, TO_LOCATION_ID]);
        const fromLoc = (data || []).find(l => String(l.id) === String(FROM_LOCATION_ID));
        const toLoc = (data || []).find(l => String(l.id) === String(TO_LOCATION_ID));
        setFromName(fromLoc?.name || '');
        setToName(toLoc?.name || '');
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!transfer) return;
      try {
        const productIds = Array.from(new Set(transfer.items.filter(i => i.product_id && i.kind !== 'set-parent').map(i => i.product_id)));
        if (!productIds.length) return;
        const { data: invRows } = await supabase
          .from('inventory')
          .select('product_id, location, quantity')
          .in('product_id', productIds)
          .eq('location', FROM_LOCATION_ID);
        const map = new Map();
        (invRows || []).forEach(r => map.set(r.product_id, Number(r.quantity) || 0));
        const rem = new Map();
        transfer.items.forEach(it => {
          if (it.kind === 'set-parent') return;
          const cur = map.get(it.product_id) || 0;
          rem.set(it.product_id, cur - (Number(it.qty) || 0));
        });
        setRemainingPreview(rem);

        const { data: dstRows } = await supabase
          .from('inventory')
          .select('product_id, location, quantity')
          .in('product_id', productIds)
          .eq('location', TO_LOCATION_ID);
        const dstCur = new Map();
        (dstRows || []).forEach(r => dstCur.set(r.product_id, Number(r.quantity) || 0));
        const dstAfter = new Map();
        transfer.items.forEach(it => {
          if (it.kind === 'set-parent') return;
          const curDst = dstCur.get(it.product_id) || 0;
          dstAfter.set(it.product_id, curDst + (Number(it.qty) || 0));
        });
        setDestPreview(dstAfter);
      } catch {}
    })();
  }, [transfer]);

  async function loadImageDataUrl(path) {
    try {
      const r = await fetch(path, { cache: 'no-store' });
      if (!r.ok) return null;
      const b = await r.blob();
      return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
    } catch { return null; }
  }

  async function generatePdf(t, remainingSrcMap, destCurrentMap, labels) {
    const doc = new jsPDF('p', 'pt', 'a4');
    const page = doc.internal.pageSize;
    const width = page.getWidth();
    const height = page.getHeight();
    const cm = 28.346;
    const margin = cm;
    let y = margin + 12;

    const drawFrame = () => { doc.setLineWidth(2); doc.rect(cm / 2, cm / 2, width - cm, height - cm); };
    const drawWatermark = () => {
      const label = (company?.company_name || company?.name || 'Best Rest Furniture');
      try { doc.saveGraphicsState && doc.saveGraphicsState(); } catch {}
      try { if (doc.setGState) { doc.setGState(new doc.GState({ opacity: 0.22 })); } } catch {}
      doc.setFont('helvetica', 'bold'); doc.setTextColor(140, 150, 165); doc.setFontSize(54);
      const stepX = 170, stepY = 130;
      for (let y0 = margin; y0 < height - margin; y0 += stepY) {
        for (let x0 = margin; x0 < width - margin; x0 += stepX) {
          doc.text(label, x0, y0, { angle: 30 });
        }
      }
      doc.setTextColor(0, 0, 0);
      try { doc.restoreGraphicsState && doc.restoreGraphicsState(); } catch {}
    };
    drawFrame();
    drawWatermark();
    const drawnPages = new Set([1]);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.text('Kitwe To Lusaka Transfer', width / 2, y, { align: 'center' }); y += 26;

    try {
      const logo = await loadImageDataUrl('/bestrest-logo.png');
      if (logo) {
        const logoH = 40; const logoW = 40;
        doc.addImage(logo, 'PNG', margin, y - 20, logoW, logoH);
        const textX = margin + logoW + 12; const topY = y - 6;
        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        if (company) { doc.text(company.company_name || company.name || 'Company', textX, topY); }
        doc.text(`Transfer #: ${t.transferNumber || '-'}`, textX, topY + 14);
        doc.text(`From: ${labels.fromLabel}`, textX, topY + 28);
        doc.text(`To: ${labels.toLabel}`, textX, topY + 42);
        doc.text(`Captured At: ${formatDateTimeDMY(t.capturedAt)}`, textX, topY + 56);
        y = topY + 74;
      } else {
        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        if (company) { doc.text(company.company_name || company.name || 'Company', margin, y - 6); }
        doc.text(`Transfer #: ${t.transferNumber || '-'}`, margin, y + 8);
        doc.text(`From: ${labels.fromLabel}`, margin, y + 22);
        doc.text(`To: ${labels.toLabel}`, margin, y + 36);
        doc.text(`Captured At: ${formatDateTimeDMY(t.capturedAt)}`, margin, y + 50);
        y += 66;
      }
    } catch {}

    doc.setFont('helvetica', 'bold'); doc.text('Products:', margin, y); y += 14; doc.setFont('helvetica', 'normal'); doc.setFontSize(10);

    const fromCol = labels.fromName ? `${labels.fromName} Remaining Qty` : 'From Remaining Qty';
    const toCol = labels.toName ? `${labels.toName} Current Qty` : 'To Current Qty';

    const rows = [];
    let total = 0;
    for (const it of t.items) {
      const isParent = it.kind === 'set-parent';
      const isComponent = it.kind === 'set-component';
      const remainSrc = isParent ? '-' : (remainingSrcMap?.get(it.product_id) ?? '-');
      const destQty = isParent ? '-' : (destCurrentMap?.get(it.product_id) ?? '-');
      const qtyNumber = Number(it.qty) || 0;
      const tQty = isParent ? '-' : qtyNumber;
      const name = isComponent ? `- ${it.name}` : (isParent ? `${it.name} (Set)` : it.name);
      rows.push([it.sku || '-', name || '-', String(tQty), String(remainSrc), String(destQty)]);
      if (!isParent) total += qtyNumber;
    }

    const printable = width - 2 * margin;
    const colWidths = [90, 200, 70, 115, 115];
    const sum = colWidths.reduce((a, b) => a + b, 0);
    const scale = Math.min(1, printable / sum);
    const scaled = colWidths.map(w => w * scale);

    autoTable(doc, {
      startY: y,
      margin: { top: margin, bottom: margin, left: margin, right: margin },
      head: [[ 'SKU', 'Product Name', 'Transfer Qty', fromCol, toCol ]],
      body: rows,
      styles: { font: 'helvetica', fontSize: 10, halign: 'center', cellPadding: 4, lineWidth: 0.4, overflow: 'linebreak' },
      headStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0], halign: 'center' },
      columnStyles: { 0: { cellWidth: scaled[0] }, 1: { cellWidth: scaled[1], halign: 'left' }, 2: { cellWidth: scaled[2] }, 3: { cellWidth: scaled[3] }, 4: { cellWidth: scaled[4] } },
      theme: 'grid',
      willDrawCell: () => {
        try {
          const num = doc.internal?.getCurrentPageInfo?.().pageNumber || 1;
          if (!drawnPages.has(num)) {
            drawFrame();
            drawWatermark();
            drawnPages.add(num);
          }
        } catch {}
      }
    });

    const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : y;
    doc.setFont('helvetica', 'bold');
    doc.text(`Grand Total: ${total}`, margin, Math.min(finalY + 18, height - margin - 6));
    doc.setFont('helvetica', 'normal');
    const blob = doc.output('blob');
    return blob;
  }

  async function ensureBucket() {
    return;
  }

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  async function handleApprove() {
    if (!transfer || busy) return; setBusy(true); setError(null);
    try {
      const autoApprove = false;
      const userId = (() => { try { const u = JSON.parse(localStorage.getItem('user') || 'null'); return u?.id || null; } catch { return null; } })();
      let capturedAt = transfer?.capturedAt ? new Date(transfer.capturedAt) : new Date();
      if (Number.isNaN(capturedAt.getTime())) capturedAt = new Date();
      const todayDate = capturedAt.toISOString().slice(0, 10);
      const createdAtIso = capturedAt.toISOString();
      const baseSessionInsert = {
        from_location: FROM_LOCATION_ID,
        to_location: TO_LOCATION_ID,
        user_uid: userId,
        transfer_date: todayDate,
        created_at: createdAtIso,
        transfer_datetime: createdAtIso,
        delivery_number: transfer.transferNumber || null,
        // transfer_status enum in DB does not accept 'pending'; align with existing mobile flow
        status: 'approved',
        total_qty: transfer.items.reduce((s, i) => s + (Number(i.qty) || 0), 0)
      };
      const { data: session, error: sessErr } = await supabase.from('stock_transfer_sessions').insert(baseSessionInsert).select().single();
      if (sessErr) throw sessErr;
      const sessionId = session.id;
      const lineItems = transfer.items
        .map(it => ({ ...it, qty: Number(it.qty) || 0 }))
        .filter(it => it.qty > 0 && it.kind !== 'set-parent');
      if (!lineItems.length) {
        throw new Error('No positive quantity items to process. Please adjust quantities before approval.');
      }

      if (lineItems.length) {
        const entryRows = lineItems.map(it => ({ session_id: sessionId, product_id: it.product_id, quantity: it.qty }));
        const { error: entriesErr } = await supabase.from('stock_transfer_entries').insert(entryRows);
        if (entriesErr) throw entriesErr;
      }

      if (!autoApprove) {
        try {
          const updatePayload = {
            notes: JSON.stringify({ transfer_number: transfer.transferNumber || null, status: 'pending' }),
            metadata: { transfer_number: transfer.transferNumber || null, status: 'pending' },
          };
          await supabase.from('stock_transfer_sessions').update(updatePayload).eq('id', sessionId);
        } catch {}
        localStorage.removeItem(LS_KEY);
        navigate('/Kitwe-Lusaka');
        return;
      }

      const remainingSourceMap = new Map();
      const remainingDestMap = new Map();
      if (lineItems.length) {
        const productIds = [...new Set(lineItems.map(i => i.product_id))];
        const { data: existingInv, error: invFetchErr } = await supabase
          .from('inventory')
          .select('id, product_id, location, quantity')
          .in('product_id', productIds)
          .in('location', [FROM_LOCATION_ID, TO_LOCATION_ID]);
        if (invFetchErr) throw invFetchErr;

        const invByKey = new Map();
        (existingInv || []).forEach(r => invByKey.set(`${r.product_id}|${r.location}`, r));

        const inventoryUpdates = [];
        const inventoryInserts = [];
        lineItems.forEach(it => {
          const srcKey = `${it.product_id}|${FROM_LOCATION_ID}`;
          const dstKey = `${it.product_id}|${TO_LOCATION_ID}`;
          const srcExisting = invByKey.get(srcKey);
          const dstExisting = invByKey.get(dstKey);
          if (srcExisting) {
            const newQty = (Number(srcExisting.quantity) || 0) - it.qty;
            inventoryUpdates.push({ id: srcExisting.id, quantity: newQty });
            remainingSourceMap.set(it.product_id, newQty);
          } else {
            inventoryInserts.push({ product_id: it.product_id, location: FROM_LOCATION_ID, quantity: -it.qty });
            remainingSourceMap.set(it.product_id, -it.qty);
          }
          if (dstExisting) {
            const newQtyDst = (Number(dstExisting.quantity) || 0) + it.qty;
            inventoryUpdates.push({ id: dstExisting.id, quantity: newQtyDst });
            remainingDestMap.set(it.product_id, newQtyDst);
          } else {
            inventoryInserts.push({ product_id: it.product_id, location: TO_LOCATION_ID, quantity: it.qty });
            remainingDestMap.set(it.product_id, it.qty);
          }
        });

        if (inventoryUpdates.length || inventoryInserts.length) {
          await applyInventoryBulk({
            updates: inventoryUpdates,
            inserts: inventoryInserts,
          }, supabase);
        }
      }

      try {
        const allItemProductIds = Array.from(new Set(transfer.items.filter(i => i.kind !== 'set-parent' && i.product_id).map(i => i.product_id)));
        if (allItemProductIds.length) {
          const { data: allInv } = await supabase
            .from('inventory')
            .select('product_id, location, quantity')
            .in('product_id', allItemProductIds)
            .in('location', [FROM_LOCATION_ID, TO_LOCATION_ID]);
          const latestByKey = new Map();
          (allInv || []).forEach(r => latestByKey.set(`${r.product_id}|${r.location}`, Number(r.quantity) || 0));
          for (const pid of allItemProductIds) {
            if (!remainingSourceMap.has(pid)) {
              const curSrc = latestByKey.get(`${pid}|${FROM_LOCATION_ID}`);
              remainingSourceMap.set(pid, curSrc !== undefined ? curSrc : 0);
            }
            if (!remainingDestMap.has(pid)) {
              const curDst = latestByKey.get(`${pid}|${TO_LOCATION_ID}`);
              remainingDestMap.set(pid, curDst !== undefined ? curDst : 0);
            }
          }
        }
      } catch {}

      const productLocationRows = lineItems.map(it => ({ product_id: it.product_id, location_id: TO_LOCATION_ID }));
      const uniquePL = Array.from(new Map(productLocationRows.map(r => [r.product_id, r])).values());
      await syncProductLocations({ rows: uniquePL }, supabase);

      const pdfBlob = await generatePdf(transfer, remainingSourceMap, remainingDestMap, { fromLabel, toLabel, fromName, toName });
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const datePart = toDMY(transfer.capturedAt).replace(/\//g, '-');
      const fileName = `Outlet_Transfer_${datePart}.pdf`;
      let pdfUrl = null;
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 10000);
        const resp = await fetch('/api/transfer', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'upload-pdf', sessionId, fileName, pdfBase64 }), signal: controller.signal
        });
        clearTimeout(t);
        if (resp.ok) { const json = await resp.json(); pdfUrl = json.publicUrl || null; }
        else {
          let detail = '';
          try { detail = await resp.text(); } catch {}
          console.warn('Upload service returned non-OK', resp.status, detail);
        }
      } catch (e) { console.warn('Upload service failed', e.message || e); }

      if (!pdfUrl) {
        try {
          await ensureBucket();
          const path = `${sessionId}/${fileName}`;
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, pdfBlob, { upsert: true, contentType: 'application/pdf' });
          if (!upErr) { const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path); pdfUrl = pub?.publicUrl || null; }
          else { console.warn('Client upload error', upErr.message || upErr); }
        } catch (e) { console.warn('Client upload failed', e.message || e); }
      }

      if (pdfUrl) {
        try {
          const updatePayload = {
            pdf_url: pdfUrl,
            metadata: { pdf_url: pdfUrl, transfer_number: transfer.transferNumber || null },
            notes: JSON.stringify({ pdf_url: pdfUrl, transfer_number: transfer.transferNumber || null })
          };
          await supabase.from('stock_transfer_sessions').update(updatePayload).eq('id', sessionId);
        } catch (e) { console.warn('Failed to update session with pdf url', e.message || e); }
      }

      localStorage.removeItem(LS_KEY);
      if (pdfUrl) {
        await triggerDownload(pdfUrl, fileName, true);
      }
      navigate('/Kitwe-Lusaka');
    } catch (err) {
      console.error(err); setError(err.message || String(err));
    } finally { setBusy(false); }
  }

  if (!transfer) return <div style={{ padding: 24, color: '#e0e6ed' }}>Loading transfer...</div>;
  const totalQty = transfer.items.filter(i => i.kind !== 'set-parent').reduce((s, i) => s + (Number(i.qty) || 0), 0);

  const fromColLabel = fromName ? `${fromName} Remaining Qty` : 'From Remaining Qty';
  const toColLabel = toName ? `${toName} Current Qty` : 'To Current Qty';

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto', color: '#e0e6ed' }}>
      <h1 style={{ marginTop: 0 }}>Transfer Summary</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        <div style={box}> <b>Transfer #:</b> {transfer.transferNumber || '-'} </div>
        <div style={box}> <b>From:</b> {fromLabel} </div>
        <div style={box}> <b>To:</b> {toLabel} </div>
        <div style={box}> <b>Captured:</b> {formatDateTimeDMY(transfer.capturedAt)} </div>
        <div style={box}> <b>Total Qty:</b> {totalQty} </div>
      </div>
      <h2 style={{ marginTop: 24 }}>Products</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820, tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: '#23272f' }}>
              <th style={{ ...th, width: '110px' }}>SKU</th>
              <th style={{ ...th, width: '360px' }}>Product Name</th>
              <th style={{ ...th, width: '120px' }}>Transfer Qty</th>
              <th style={{ ...th, width: '140px' }}>{fromColLabel}</th>
              <th style={{ ...th, width: '140px' }}>{toColLabel}</th>
            </tr>
          </thead>
          <tbody>
            {transfer.items.map(it => {
              const isParent = it.kind === 'set-parent';
              const isComponent = it.kind === 'set-component';
              const remainingSrc = it.product_id ? (remainingPreview.get(it.product_id) ?? '-') : '-';
              const destAfter = it.product_id ? (destPreview.get(it.product_id) ?? '-') : '-';
              const tQty = isParent ? '-' : (Number(it.qty) || 0);
              return (
                <tr key={it.product_id || it.id} style={{ background: isParent ? '#2d3642' : '#1a1f27' }}>
                  <td style={{ ...td, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.sku || '-'}</td>
                  <td style={{ ...td, paddingLeft: isComponent ? 28 : 8, fontStyle: isParent ? 'italic' : 'normal', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                    <div style={{ maxWidth: 360 }}>{isComponent ? '-> ' + it.name : it.name}{isParent ? ' (Set)' : ''}</div>
                  </td>
                  <td style={td}>{tQty}</td>
                  <td style={td}>{isParent ? '-' : remainingSrc}</td>
                  <td style={td}>{isParent ? '-' : destAfter}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#23272f', fontWeight: 'bold' }}>
              <td style={{ ...td, textAlign: 'right' }} colSpan={2}>Grand Total</td>
              <td style={td}>{totalQty}</td>
              <td style={td}>-</td>
              <td style={td}>-</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {error && <div style={{ marginTop: 16, color: '#ff7675' }}>Error: {error}</div>}
      <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
        <button disabled={busy} onClick={() => navigate('/Kitwe-Lusaka')} style={btn}>Back</button>
        <button disabled={busy} onClick={handleApprove} style={{ ...btn, background: '#43aa8b' }}>{busy ? 'Submitting...' : 'Submit for Approval'}</button>
      </div>
      {toast && (
        <div style={{ position: 'fixed', right: 16, bottom: 16, background: '#1f2d2b', border: '1px solid #2dc653', color: '#d8f3dc', padding: '10px 14px', borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

async function triggerDownload(url, filename, forceBlob = false) {
  try {
    let downloadUrl = url;
    let objectUrl = null;
    if (forceBlob && /^https?:/i.test(url)) {
      try {
        const resp = await fetch(url, { mode: 'cors' });
        const blob = await resp.blob();
        objectUrl = URL.createObjectURL(blob);
        downloadUrl = objectUrl;
      } catch (e) { console.warn('Blob fetch failed, falling back to direct link', e?.message || e); }
    }
    const a = document.createElement('a');
    a.href = downloadUrl; a.download = filename || 'outlet_transfer.pdf'; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { try { document.body.removeChild(a); if (objectUrl) URL.revokeObjectURL(objectUrl); } catch {} }, 1500);
  } catch (e) { console.warn('Download trigger failed', e); }
}

const box = { padding: '10px 14px', background: '#1a1f27', border: '1px solid #00b4d8', borderRadius: 8 };
const th = { padding: '10px 8px', borderBottom: '1px solid #00b4d8' };
const td = { padding: '8px 8px', borderBottom: '1px solid #123' };
const btn = { background: '#23272f', color: '#e0e6ed', border: '1px solid #00b4d8', padding: '10px 18px', borderRadius: 8, fontWeight: 'bold', fontSize: 16, cursor: 'pointer' };
