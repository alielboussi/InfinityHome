import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import db from './dataClient';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { applyInventoryBulk } from './utils/inventoryApi';
import { syncProductLocations } from './services/productLocations';
import BackToDashboard from './BackToDashboard';

const FROM_LOCATION_ID = '39ffaa82-8aee-4a33-8de8-06584cbaffcf';
const KITWE_LOCATION_ID = '454a092c-5b12-441e-b99d-216f6fa72198';
const LUSAKA_LOCATION_ID = 'f72aa989-3888-4a45-96ed-15dc45b5d399';
const DEST_LOCATION_IDS = [KITWE_LOCATION_ID, LUSAKA_LOCATION_ID];
const LS_KEY = 'pendingWarehouseTransfer';
const BUCKET = 'WarehouseTransfers';
const OPEN_STOCK_STATUSES = ['open', 'open_locked'];

function getLocalUserId() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return user?.id || null;
  } catch {
    return null;
  }
}

async function sendTransferWhatsAppMessage(message) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    await fetch('/api/whatsapp-transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });
    clearTimeout(t);
  } catch {}
}

function buildTransferMessage({ transferNumber, capturedAt, fromLabel, toLabel, items }) {
  const lines = [
    `Transfer #${transferNumber || '-'}`,
    `Date: ${toDMY(capturedAt)}`,
    `From: ${fromLabel}`,
    `To: ${toLabel}`,
    'Items',
  ];

  const allItems = Array.isArray(items) ? items : [];
  allItems.forEach((line) => {
    const qty = Number(line?.qty) || 0;
    if (qty <= 0) return;

    if (line?.kind === 'set-parent') {
      lines.push(`${line?.name || 'Set'}`);
      allItems
        .filter((c) => c?.kind === 'set-component' && c?.parent_combo_id === line?.combo_id)
        .forEach((component) => {
          const componentQty = Number(component?.qty) || 0;
          if (componentQty <= 0) return;
          lines.push(`- ${component?.name || component?.sku || 'Component'}: ${componentQty}`);
        });
      return;
    }

    if (line?.kind === 'set-component') return;
    lines.push(`- ${line?.name || line?.sku || 'Item'}: ${qty}`);
  });

  return lines.join('\n');
}

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

export default function WarehouseTransferSummary(){
  const navigate = useNavigate();
  const [transfer,setTransfer]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(null);
  // Removed envChecking/envReport state (unused; CI lint no-unused-vars)
  const [company,setCompany]=useState(null);
  const autoDownloadFlag = useRef(false);
  // const [sourceInventory,setSourceInventory]=useState(new Map()); // product_id -> current qty at FROM location (unused)
  const [remainingPreview,setRemainingPreview]=useState(new Map()); // product_id -> remaining after transfer (using latest pre-transfer stock)
  const [destPreview,setDestPreview]=useState(new Map()); // product_id -> destination current qty BEFORE transfer
  const [fromName, setFromName] = useState('');
  const [toName, setToName] = useState('');
  const [toLocationId, setToLocationId] = useState(KITWE_LOCATION_ID);
  const [locationOptions, setLocationOptions] = useState([]);

  const fromLabel = fromName || 'Factory Warehouse';
  const toLabel = toName || 'Destination';

  useEffect(()=>{try{(async()=>{const raw=localStorage.getItem(LS_KEY);if(raw){const parsed = JSON.parse(raw); setTransfer(parsed); if(parsed?.to){ setToLocationId(parsed.to); }} else {navigate('/All-Transfers');}}
  )();}catch{navigate('/All-Transfers');}},[navigate]);

  // If a previous PDF was generated (e.g., page refreshed after approval before user manually downloaded), auto-download it once.
  useEffect(()=>{
    if(autoDownloadFlag.current) return;
    const metaRaw = localStorage.getItem('lastWarehouseTransferPdf');
    if(metaRaw){
      try {
        const meta = JSON.parse(metaRaw);
        if(meta.url && (!meta.ts || Date.now()-meta.ts < 10*60*1000)){
          triggerDownload(meta.url, meta.filename || 'warehouse_transfer.pdf');
          autoDownloadFlag.current = true;
          // Remove so it doesn't re-trigger on every mount
          localStorage.removeItem('lastWarehouseTransferPdf');
        }
      } catch(e){ /* ignore */ }
    }
  },[]);

  useEffect(()=>{(async()=>{try{const { data } = await db.from('company_settings').select('*').single();setCompany(data||{});}catch{}})();},[]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await db
          .from('locations')
          .select('id, name')
          .in('id', [FROM_LOCATION_ID, ...DEST_LOCATION_IDS]);
        setLocationOptions(data || []);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const fromLoc = (locationOptions || []).find(l => String(l.id) === String(FROM_LOCATION_ID));
    const toLoc = (locationOptions || []).find(l => String(l.id) === String(toLocationId));
    setFromName(fromLoc?.name || '');
    setToName(toLoc?.name || '');
  }, [locationOptions, toLocationId]);

  const refreshLatestStockPreview = useCallback(async (activeTransfer) => {
    if (!activeTransfer) return;
    try {
      const productIds = Array.from(
        new Set(
          (activeTransfer.items || [])
            .filter((i) => i.product_id && i.kind !== 'set-parent')
            .map((i) => i.product_id)
        )
      );
      if (!productIds.length) {
        setRemainingPreview(new Map());
        setDestPreview(new Map());
        return;
      }

      const { data: invRows } = await db
        .from('inventory')
        .select('product_id, location, quantity')
        .in('product_id', productIds)
        .in('location', [FROM_LOCATION_ID, toLocationId]);

      const srcCur = new Map();
      const dstCur = new Map();
      (invRows || []).forEach((r) => {
        const qty = Number(r.quantity) || 0;
        if (r.location === FROM_LOCATION_ID) srcCur.set(r.product_id, qty);
        if (r.location === toLocationId) dstCur.set(r.product_id, qty);
      });

      const rem = new Map();
      const dst = new Map();
      (activeTransfer.items || []).forEach((it) => {
        if (it.kind === 'set-parent' || !it.product_id) return;
        const currentSourceQty = srcCur.get(it.product_id) || 0;
        const currentDestQty = dstCur.get(it.product_id) || 0;
        rem.set(it.product_id, currentSourceQty - (Number(it.qty) || 0));
        dst.set(it.product_id, currentDestQty);
      });

      setRemainingPreview(rem);
      setDestPreview(dst);
    } catch {
      // Keep existing values if a refresh fails.
    }
  }, [toLocationId]);

  // Keep preview values fresh while this page is open so remaining/current always reflect latest pre-transfer stock.
  useEffect(() => {
    if (!transfer) return;

    void refreshLatestStockPreview(transfer);

    const handleFocus = () => { void refreshLatestStockPreview(transfer); };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshLatestStockPreview(transfer);
      }
    };
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshLatestStockPreview(transfer);
      }
    }, 10000);

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [transfer, refreshLatestStockPreview]);

  // Helper: load image from public path to DataURL for jsPDF
  async function loadImageDataUrl(path){
    try {
      const r = await fetch(path, { cache: 'no-store' });
      if(!r.ok) return null; const b = await r.blob();
      return await new Promise(res=>{ const fr = new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(b); });
    } catch { return null; }
  }

  // generatePdf now accepts maps of remaining quantities for source (remaining after transfer)
  // and destination current quantities. Uses jsPDF-AutoTable for a professional grid.
  async function generatePdf(t, remainingSrcMap, destCurrentMap, labels){
    const doc = new jsPDF('p','pt','a4');
    const page = doc.internal.pageSize;
    const width = page.getWidth();
    const height = page.getHeight();
  const cm = 28.346; // 1 cm in pt
  const margin = cm; // keep content within 1cm border
  let y = margin + 12;

    // Draw border and watermark on first page; for additional pages we draw it BEFORE any cells using willDrawCell
    const drawFrame = () => { doc.setLineWidth(2); doc.rect(cm/2, cm/2, width - cm, height - cm); };
    const drawWatermark = () => {
      const label = (company?.company_name || company?.name || 'Best Rest Furniture');
      // Very light, semi-transparent watermark so it never obscures content
      try {
        doc.saveGraphicsState && doc.saveGraphicsState();
      } catch {}
      try {
          // Make watermark fully visible yet still under content
          if(doc.setGState){ doc.setGState(new doc.GState({ opacity: 0.22 })); }
      } catch {}
        doc.setFont('helvetica','bold'); doc.setTextColor(140,150,165); doc.setFontSize(54);
        const stepX = 170, stepY = 130;
      for(let y0 = margin; y0 < height - margin; y0 += stepY){
        for(let x0 = margin; x0 < width - margin; x0 += stepX){
          doc.text(label, x0, y0, { angle: 30 });
        }
      }
      // reset
      doc.setTextColor(0,0,0);
      try { doc.restoreGraphicsState && doc.restoreGraphicsState(); } catch {}
    };
    drawFrame();
    drawWatermark();
    const drawnPages = new Set([1]);

    // Header title
    doc.setFont('helvetica','bold'); doc.setFontSize(18);
    doc.text(`Factory To ${toLabel} Transfer`, width/2, y, { align:'center' }); y += 26;

    // Logo + meta (avoid overlap)
    try {
      const logo = await loadImageDataUrl('/bestrest-logo.png');
      if(logo){
        const logoH = 40; const logoW = 40;
        doc.addImage(logo, 'PNG', margin, y - 20, logoW, logoH);
        const textX = margin + logoW + 12; const topY = y - 6;
        doc.setFontSize(10); doc.setFont('helvetica','normal');
        if(company){ doc.text(company.company_name || company.name || 'Company', textX, topY); }
        doc.text(`Transfer #: ${t.transferNumber||'-'}`, textX, topY + 14);
        doc.text(`From: ${labels.fromLabel}`, textX, topY + 28);
        doc.text(`To: ${labels.toLabel}`, textX, topY + 42);
        doc.text(`Captured At: ${formatDateTimeDMY(t.capturedAt)}`, textX, topY + 56);
        y = topY + 74;
      } else {
        doc.setFontSize(10); doc.setFont('helvetica','normal');
        if(company){ doc.text(company.company_name || company.name || 'Company', margin, y - 6); }
        doc.text(`Transfer #: ${t.transferNumber||'-'}`, margin, y + 8);
        doc.text(`From: ${labels.fromLabel}`, margin, y + 22);
        doc.text(`To: ${labels.toLabel}`, margin, y + 36);
        doc.text(`Captured At: ${formatDateTimeDMY(t.capturedAt)}`, margin, y + 50);
        y += 66;
      }
    } catch {}

    // Table Header
    doc.setFont('helvetica','bold'); doc.text('Products:', margin, y); y += 14; doc.setFont('helvetica','normal'); doc.setFontSize(10);

    // Build table data in requested order: SKU | Product Name | Transfer Qty | Warehouse Remaining Qty | Destination Current Qty
    const fromCol = labels.fromName ? `${labels.fromName} Remaining Qty` : 'From Remaining Qty';
    const toCol = labels.toName ? `${labels.toName} Current Qty` : 'To Current Qty';

    const rows = [];
    let total = 0;
    for(const it of t.items){
      const isParent = it.kind==='set-parent';
      const isComponent = it.kind==='set-component';
      const remainSrc = isParent ? '-' : (remainingSrcMap?.get(it.product_id) ?? '-');
      const destQty = isParent ? '-' : (destCurrentMap?.get(it.product_id) ?? '-');
      const qtyNumber = Number(it.qty)||0;
      const tQty = isParent ? '-' : qtyNumber;
      const name = isComponent ? `- ${it.name}` : (isParent ? `${it.name} (Set)` : it.name);
      rows.push([ it.sku || '-', name || '-', String(tQty), String(remainSrc), String(destQty) ]);
      if(!isParent) total += qtyNumber;
    }

    // Compute column widths to fit inside border
    const printable = width - 2*margin;
    const colWidths = [90, 200, 70, 115, 115];
    const sum = colWidths.reduce((a,b)=>a+b,0);
    const scale = Math.min(1, printable / sum);
    const scaled = colWidths.map(w => w*scale);

    autoTable(doc, {
      startY: y,
      margin: { top: margin, bottom: margin, left: margin, right: margin },
      head: [[ 'SKU', 'Product Name', 'Transfer Qty', fromCol, toCol ]],
      body: rows,
      styles: { font: 'helvetica', fontSize: 10, halign: 'center', cellPadding: 4, lineWidth: 0.4, overflow: 'linebreak' },
      headStyles: { fillColor: [235,235,235], textColor: [0,0,0], halign: 'center' },
      columnStyles: { 0:{cellWidth: scaled[0]}, 1:{cellWidth: scaled[1], halign:'left'}, 2:{cellWidth: scaled[2]}, 3:{cellWidth: scaled[3]}, 4:{cellWidth: scaled[4]} },
      theme: 'grid',
      willDrawCell: () => {
        // When a new page starts, this hook fires for the first cell on that page.
        try {
          const num = doc.internal?.getCurrentPageInfo?.().pageNumber || 1;
          if(!drawnPages.has(num)){
            drawFrame();
            drawWatermark();
            drawnPages.add(num);
          }
        } catch { /* noop */ }
      }
    });

    const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : y;
    doc.setFont('helvetica','bold'); doc.text(`Grand Total: ${total}`, margin, Math.min(finalY + 18, height - margin - 6)); doc.setFont('helvetica','normal');
    const blob = doc.output('blob');
    return blob;
  }

  async function ensureBucket(){
    // Avoid bucket creation from the client in production.
    // This function becomes a no-op; serverless endpoint ensures the bucket.
    return;
  }

  // Email is the supported channel now.

  // Quick serverless environment diagnostics
  // handleCheckEnv removed (unused)

  // Env check banner disabled
  useEffect(()=>{ /* env diagnostics disabled in UI */ },[]);


  // Manual Email PDF flow removed; email is triggered automatically after approval.

  async function handleApprove(){
    if(!transfer || busy) return; setBusy(true); setError(null);
    try {
      const userId = getLocalUserId();
      // Create session
      const todayDate = new Date().toISOString().slice(0,10);
      const createdAtIso = new Date().toISOString();
      const baseSessionInsert = {
        from_location: FROM_LOCATION_ID,
        to_location: toLocationId,
        // Write UUID to new column; keep legacy int column out to avoid type mismatch
        user_uid: userId,
        transfer_date: todayDate,
        created_at: createdAtIso,
        transfer_datetime: createdAtIso,
        delivery_number: transfer.transferNumber || null,
        // optimistic writes for columns that may exist after migration
        status: 'approved',
        total_qty: transfer.items.reduce((s,i)=>s + (Number(i.qty)||0),0)
      };
      const { data: session, error: sessErr } = await db.from('stock_transfer_sessions').insert(baseSessionInsert).select().single();
      if(sessErr) throw sessErr;
      const sessionId = session.id;
      // Filter valid items (qty>0). Require at least one tangible line to proceed.
      const lineItems = transfer.items
        .map(it => ({ ...it, qty: Number(it.qty)||0 }))
        .filter(it => it.qty > 0 && it.kind !== 'set-parent'); // only tangible product or set components
      if(!lineItems.length){
        throw new Error('No positive quantity items to process. Please adjust quantities before approval.');
      }

  // 1) Batch insert entries (only if there are positive-qty items)
      if(lineItems.length){
        const entryRows = lineItems.map(it => ({ session_id: sessionId, product_id: it.product_id, quantity: it.qty }));
        const { error: entriesErr } = await db.from('stock_transfer_entries').insert(entryRows);
        if(entriesErr) throw entriesErr;
      }

      await refreshLatestStockPreview(transfer);
      try {
        const msg = buildTransferMessage({
          transferNumber: transfer.transferNumber,
          capturedAt: transfer.capturedAt,
          fromLabel,
          toLabel,
          items: transfer.items,
        });
        void sendTransferWhatsAppMessage(msg);
      } catch {}

      // 2) Inventory adjustments (minimize round trips)
      // Prepare remaining maps and adjust inventory
      const remainingSourceMap = new Map();
      const remainingDestMap = new Map();
      if(lineItems.length){
        // Collect product ids
        const productIds = [...new Set(lineItems.map(i => i.product_id))];
        // Fetch existing inventory rows for both locations in a single query
        const { data: existingInv, error: invFetchErr } = await db
          .from('inventory')
          .select('id, product_id, location, quantity')
          .in('product_id', productIds)
          .in('location', [FROM_LOCATION_ID, toLocationId]);
        if(invFetchErr) throw invFetchErr;

        const invByKey = new Map(); // key: product_id|location
        (existingInv||[]).forEach(r => invByKey.set(`${r.product_id}|${r.location}`, r));

        const inventoryUpdates = [];
        const inventoryInserts = [];
        lineItems.forEach(it => {
          const srcKey = `${it.product_id}|${FROM_LOCATION_ID}`;
          const dstKey = `${it.product_id}|${toLocationId}`;
          const srcExisting = invByKey.get(srcKey);
          const dstExisting = invByKey.get(dstKey);
          // Source (subtract qty, allow negative)
          if(srcExisting){
            const newQty = (Number(srcExisting.quantity)||0) - it.qty;
            inventoryUpdates.push({ id: srcExisting.id, quantity: newQty });
            remainingSourceMap.set(it.product_id, newQty);
          } else {
            inventoryInserts.push({ product_id: it.product_id, location: FROM_LOCATION_ID, quantity: -it.qty });
            remainingSourceMap.set(it.product_id, -it.qty);
          }
          // Destination (add qty)
          if(dstExisting){
            const newQtyDst = (Number(dstExisting.quantity)||0) + it.qty;
            inventoryUpdates.push({ id: dstExisting.id, quantity: newQtyDst });
            remainingDestMap.set(it.product_id, newQtyDst);
          } else {
            inventoryInserts.push({ product_id: it.product_id, location: toLocationId, quantity: it.qty });
            remainingDestMap.set(it.product_id, it.qty);
          }
        });

        // Apply inventory changes (updates first, then inserts)
        if (inventoryUpdates.length || inventoryInserts.length) {
          await applyInventoryBulk({
            updates: inventoryUpdates,
            inserts: inventoryInserts,
          }, db);
        }
      }

      try {
        const { data: periodRows } = await db
          .from('stock_periods')
          .select('id, status')
          .eq('location_id', toLocationId)
          .in('status', OPEN_STOCK_STATUSES)
          .order('opened_at', { ascending: false })
          .limit(1);
        const period = periodRows?.[0];
        if (period) {
          const qtyByProduct = new Map();
          lineItems.forEach((item) => {
            const prev = qtyByProduct.get(item.product_id) || 0;
            qtyByProduct.set(item.product_id, prev + item.qty);
          });
          const productIds = Array.from(qtyByProduct.keys());
          if (productIds.length) {
            const { data: existingRows } = await db
              .from('opening_stock_entries')
              .select('product_id')
              .eq('session_id', period.id)
              .in('product_id', productIds);
            const existing = new Set((existingRows || []).map(r => String(r.product_id)));
            const openingRows = productIds
              .filter(pid => !existing.has(String(pid)))
              .map(pid => ({
                session_id: period.id,
                product_id: pid,
                qty: qtyByProduct.get(pid) || 0,
              }));
            if (openingRows.length) {
              await db.from('opening_stock_entries').insert(openingRows);
            }
          }
        }
      } catch {}

      // Always fill remaining maps for ALL tangible items (even if their qty<=0),
      // so the PDF shows remaining quantities rather than '-'. For items not processed
      // in this approval (qty<=0), remaining is simply the current inventory.
      try {
        // Build a lookup of current inventory for all items in the transfer at both locations
        const allItemProductIds = Array.from(new Set(transfer.items.filter(i => i.kind !== 'set-parent' && i.product_id).map(i => i.product_id)));
        if(allItemProductIds.length){
          const { data: allInv } = await db
            .from('inventory')
            .select('product_id, location, quantity')
            .in('product_id', allItemProductIds)
            .in('location', [FROM_LOCATION_ID, toLocationId]);
          const latestByKey = new Map();
          (allInv||[]).forEach(r => latestByKey.set(`${r.product_id}|${r.location}`, Number(r.quantity)||0));
          for(const pid of allItemProductIds){
            if(!remainingSourceMap.has(pid)){
              const curSrc = latestByKey.get(`${pid}|${FROM_LOCATION_ID}`);
              remainingSourceMap.set(pid, curSrc !== undefined ? curSrc : 0);
            }
            if(!remainingDestMap.has(pid)){
              const curDst = latestByKey.get(`${pid}|${toLocationId}`);
              remainingDestMap.set(pid, curDst !== undefined ? curDst : 0);
            }
          }
        }
      } catch (e) { /* non-fatal; PDF will show '-' for missing */ }

      // 3) Ensure product_locations for destination in one upsert batch
      const productLocationRows = lineItems.map(it => ({ product_id: it.product_id, location_id: toLocationId }));
      const uniquePL = Array.from(new Map(productLocationRows.map(r => [r.product_id, r])).values());
      await syncProductLocations({ rows: uniquePL }, db);

      // Generate PDF and upload via secure serverless endpoint (Firebase Admin SDK)
      const pdfBlob = await generatePdf(transfer, remainingSourceMap, remainingDestMap, { fromLabel, toLabel, fromName, toName });
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  const datePart = new Date(transfer.capturedAt).toISOString().slice(0,10);
  const fileLabel = String(toLabel || 'Destination').trim().replace(/\s+/g, '_');
  const fileName = `Warehouse_To_${fileLabel}_${datePart}.pdf`;
      let pdfUrl = null;
      try {
        const controller = new AbortController();
        const t = setTimeout(()=>controller.abort(), 10000);
        const resp = await fetch('/api/transfer', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action: 'upload-pdf', sessionId, fileName, pdfBase64 }), signal: controller.signal
        });
        clearTimeout(t);
        if(resp.ok){ const json = await resp.json(); pdfUrl = json.publicUrl || null; }
        else {
          let detail = '';
          try { detail = await resp.text(); } catch {}
          console.warn('Upload service returned non-OK', resp.status, detail);
        }
      } catch (e) { console.warn('Upload service failed', e.message||e); }

      // Fallback for local dev or missing serverless env: try client-side Firebase Storage upload
      if(!pdfUrl){
        try {
          await ensureBucket();
          const path = `${sessionId}/${fileName}`;
          const { error: upErr } = await db.storage.from(BUCKET).upload(path, pdfBlob, { upsert: true, contentType: 'application/pdf' });
          if(!upErr){ const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path); pdfUrl = pub?.publicUrl || null; }
          else { console.warn('Client upload error', upErr.message || upErr); }
        } catch (e){ console.warn('Client upload failed', e.message || e); }
      }
      // Persist PDF reference into dedicated columns + legacy notes/metadata fallback
      if(pdfUrl){
        try {
          const updatePayload = {
            pdf_url: pdfUrl,
            metadata: { pdf_url: pdfUrl, transfer_number: transfer.transferNumber || null },
            notes: JSON.stringify({ pdf_url: pdfUrl, transfer_number: transfer.transferNumber || null })
          };
          await db.from('stock_transfer_sessions').update(updatePayload).eq('id', sessionId);
        } catch (e){ console.warn('Failed to update session with pdf url', e.message || e); }
      }


      // Clear draft
      localStorage.removeItem(LS_KEY);
      // Immediate forced download if we have a public URL (do not open in a new tab)
      if(pdfUrl){
        await triggerDownload(pdfUrl, fileName, true);
      }
      // Navigate back to All-Transfers transfer start for a fresh transfer
      navigate('/All-Transfers');
    } catch (err) {
      console.error(err); setError(err.message||String(err));
    } finally { setBusy(false); }
  }

  if(!transfer) return <div className="wt-summary-page wt-summary-loading">Loading transfer...</div>;
  const totalQty = transfer.items.filter(i=>i.kind !== 'set-parent').reduce((s,i)=>s + (Number(i.qty)||0),0);

  // Test PDF button removed; Approve & Process uses this final layout.

  return (
    <div className="wt-summary-page">
  <div className="page-header-row">
    <BackToDashboard />
    <h1 className="wt-summary-title">Transfer Summary</h1>
  </div>
      {/* Env diagnostics UI removed per request */}
      <div className="wt-summary-meta">
        <div className="wt-summary-box"> <b>Transfer #:</b> {transfer.transferNumber||'-'} </div>
        <div className="wt-summary-box"> <b>From:</b> {fromLabel} </div>
        <div className="wt-summary-box"> <b>To:</b> {toLabel} </div>
        <div className="wt-summary-box"> <b>Captured:</b> {new Date(transfer.capturedAt).toLocaleString()} </div>
        <div className="wt-summary-box"> <b>Total Qty:</b> {totalQty} </div>
      </div>
      <h2 className="wt-summary-section-title">Products</h2>
      <div className="wt-summary-table-wrap">
        <table className="wt-summary-table">
          <thead>
            <tr>
              <th className="wt-summary-th wt-summary-col-sku">SKU</th>
              <th className="wt-summary-th wt-summary-col-name">Product Name</th>
              <th className="wt-summary-th wt-summary-col-qty">Transfer Qty</th>
              <th className="wt-summary-th wt-summary-col-qty">Warehouse Remaining Qty</th>
              <th className="wt-summary-th wt-summary-col-qty">{toLabel} Current Qty</th>
            </tr>
          </thead>
          <tbody>
            {transfer.items.map(it=> {
              const isParent = it.kind==='set-parent';
              const isComponent = it.kind==='set-component';
              const remainingSrc = it.product_id ? (remainingPreview.get(it.product_id) ?? '-') : '-';
              const destCurrent = it.product_id ? (destPreview.get(it.product_id) ?? '-') : '-';
              const tQty = isParent ? '-' : (Number(it.qty)||0);
              return (
                <tr key={it.product_id || it.id} className={isParent ? 'wt-summary-row-parent' : 'wt-summary-row-default'}>
                  <td className="wt-summary-td wt-summary-td-ellipsis">{it.sku||'-'}</td>
                  <td className="wt-summary-td wt-summary-td-name" style={{paddingLeft:isComponent?28:8,fontStyle:isParent?'italic':'normal'}}>
                    <div className="wt-summary-name-cell">{isComponent? '↳ '+it.name : it.name}{isParent?' (Set)':''}</div>
                  </td>
                  <td className="wt-summary-td">{tQty}</td>
                  <td className="wt-summary-td">{isParent? '-' : remainingSrc}</td>
                  <td className="wt-summary-td">{isParent? '-' : destCurrent}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="wt-summary-foot">
              <td className="wt-summary-td wt-summary-td-total" colSpan={2}>Grand Total</td>
              <td className="wt-summary-td">{totalQty}</td>
              <td className="wt-summary-td">—</td>
              <td className="wt-summary-td">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {error && <div className="wt-summary-error">Error: {error}</div>}
      <div className="wt-summary-actions">
        <button type="button" disabled={busy} onClick={()=>navigate('/All-Transfers')} className="wt-btn">Back</button>
    <button type="button" disabled={busy} onClick={handleApprove} className="wt-btn wt-btn-primary">{busy ? 'Submitting...' : 'Approve & Process'}</button>
        {/* Test PDF removed: the Approve & Process flow generates and emails the final PDF */}
        {/* Env Check button hidden per request; background banner still appears if something is missing */}
      </div>
      {/* Env diagnostics summary hidden */}
    </div>
  );
}

async function triggerDownload(url, filename, forceBlob=false){
  try {
    let downloadUrl = url;
    let objectUrl = null;
    if(forceBlob && /^https?:/i.test(url)){
      try {
        const resp = await fetch(url, { mode:'cors' });
        const blob = await resp.blob();
        objectUrl = URL.createObjectURL(blob);
        downloadUrl = objectUrl;
      } catch(e){ console.warn('Blob fetch failed, falling back to direct link', e?.message||e); }
    }
    const a=document.createElement('a');
    a.href=downloadUrl; a.download=filename||'warehouse_transfer.pdf'; a.style.display='none';
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ try{ document.body.removeChild(a); if(objectUrl) URL.revokeObjectURL(objectUrl); }catch{} }, 1500);
  } catch(e){ console.warn('Download trigger failed', e); }
}

