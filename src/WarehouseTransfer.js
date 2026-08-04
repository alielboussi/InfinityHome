/* eslint-disable no-unused-vars */
import React, { useEffect, useRef, useState } from 'react';
import db from './dataClient';
import { useNavigate } from 'react-router-dom';
import BackToDashboard from './BackToDashboard';

/*
  WarehouseTransfer.js
  Touch-friendly dedicated warehouse transfer capture page.
  Requirements implemented:
  - Transfer # manual entry with on-screen keyboard (not persisted until save)
  - From/To locked to specified locations
  - Auto date/time (display only, captured at save)
  - Product search by name / sku / scanned code (scanner will dump into input)
  - Selected products table with +/- and direct qty edit (default 1)
  - Allow adding even if source qty is 0 (we do not block, we just show current qty)
  - Save button navigates to summary with state persisted in localStorage (key: pendingWarehouseTransfer)
*/

const FROM_LOCATION_ID = '39ffaa82-8aee-4a33-8de8-06584cbaffcf'; // Factory Warehouse
const KITWE_LOCATION_ID = '454a092c-5b12-441e-b99d-216f6fa72198';
const LUSAKA_LOCATION_ID = 'f72aa989-3888-4a45-96ed-15dc45b5d399';
const DEST_LOCATION_IDS = [KITWE_LOCATION_ID, LUSAKA_LOCATION_ID];
const LS_KEY = 'pendingWarehouseTransfer';

function blockNumberInputWheel(event) {
  if (event.target instanceof HTMLInputElement && event.target.type === 'number') {
    event.preventDefault();
  }
}

function useNowTick(ms=1000){
  const [now,setNow]=useState(new Date());
  useEffect(()=>{const id=setInterval(()=>setNow(new Date()),ms);return()=>clearInterval(id);},[ms]);
  return now;
}

// Inline phone-style search keyboard (compact, always fits 1024x768 when shown)
function PhoneSearchKeyboard({ value, onChange, onEnter, onClose }) {
  const rows = [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L','-'],
    ['Z','X','C','V','B','N','M','/','.','#']
  ];
  const containerRef = useRef(null);
  const innerRef = useRef(null);
  const [narrow,setNarrow]=useState(false);
  const [scale,setScale]=useState(1);
  useEffect(()=>{
    function calc(){
      if(!containerRef.current || !innerRef.current) return;
      const avail = containerRef.current.offsetWidth;
      const contentW = innerRef.current.scrollWidth;
      let rawScale = contentW>0? Math.min(1, avail / contentW) : 1;
      // Clamp scale so it never gets too tiny (which made keys appear to vanish)
      if(rawScale < 0.88) rawScale = 0.88;
      const snap = rawScale > 0.995 ? 1 : rawScale;
      setScale(snap);
      setNarrow(avail < 840);
    }
    calc();
    const ro = new ResizeObserver(calc);
    if(containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize',calc);
    return ()=>{ window.removeEventListener('resize',calc); ro.disconnect(); };
  },[]);
  const keyH = narrow? 40 : 44; // slightly smaller when narrow
  return (
    <div ref={containerRef} className="wt-inline-kb" data-narrow={narrow? '1':'0'} data-scale={scale.toFixed(3)} aria-label="Search Keyboard" style={{minHeight:200}}>
  <div ref={innerRef} style={{width:'100%', position:'relative', padding:'0', boxSizing:'border-box', minHeight:180}}>
        <div className="wt-inline-kb-header">
          <span>Search Keyboard</span>
          <button className="wt-kb-close wt-kb-close-abs" onClick={onClose}>×</button>
        </div>
  <div className="wt-inline-kb-rows" style={{gap:2,padding:'2px 4px'}}>
        {rows.map((row,i)=>(
          <div key={i} className="wt-inline-kb-row" style={{display:'flex', flexWrap:'nowrap'}}>
            {row.map(k=> <button key={k} className="wt-kb-key" style={{height:keyH, flex:'1 1 0', minWidth:0, margin:'0 1px'}} onPointerDown={(e)=>{
                const el=e.currentTarget; el.classList.add('wt-kb-pressed');
              }} onPointerUp={(e)=>{ e.currentTarget.classList.remove('wt-kb-pressed'); }} onPointerLeave={(e)=>{ e.currentTarget.classList.remove('wt-kb-pressed'); }} onClick={()=>onChange(value + k)}>{k}</button>)}
          </div>
        ))}
        <div className="wt-inline-kb-row wt-inline-kb-controls" style={{display:'flex', marginTop:4}}>
          <button className="wt-kb-key wt-kb-space" style={{height:keyH, flex:2, marginRight:2}} onPointerDown={(e)=>e.currentTarget.classList.add('wt-kb-pressed')} onPointerUp={(e)=>e.currentTarget.classList.remove('wt-kb-pressed')} onPointerLeave={(e)=>e.currentTarget.classList.remove('wt-kb-pressed')} onClick={()=>onChange(value+' ')}>Space</button>
          <button className="wt-kb-key wt-kb-warn" style={{height:keyH, flex:1, marginRight:2}} onPointerDown={(e)=>e.currentTarget.classList.add('wt-kb-pressed')} onPointerUp={(e)=>e.currentTarget.classList.remove('wt-kb-pressed')} onPointerLeave={(e)=>e.currentTarget.classList.remove('wt-kb-pressed')} onClick={()=>onChange(value.slice(0,-1))}>Bksp</button>
          <button className="wt-kb-key wt-kb-danger" style={{height:keyH, flex:1, marginRight:2}} onPointerDown={(e)=>e.currentTarget.classList.add('wt-kb-pressed')} onPointerUp={(e)=>e.currentTarget.classList.remove('wt-kb-pressed')} onPointerLeave={(e)=>e.currentTarget.classList.remove('wt-kb-pressed')} onClick={()=>onChange('')}>Clear</button>
          <button className="wt-kb-key wt-kb-primary" style={{height:keyH, flex:1}} onPointerDown={(e)=>e.currentTarget.classList.add('wt-kb-pressed')} onPointerUp={(e)=>e.currentTarget.classList.remove('wt-kb-pressed')} onPointerLeave={(e)=>e.currentTarget.classList.remove('wt-kb-pressed')} onClick={()=>{ onEnter && onEnter(); onClose(); }}>OK</button>
        </div>
        </div>{/* end rows */}
      </div>{/* end innerRef scaled wrapper */}
    </div>
  );
}

// Numeric pad for transfer number
function PhoneNumPad({ value, onChange, onClose, inline=false }) {
  // Digits 1-9 + 0 bottom center; control row with Clear / Backspace
  const wrapRef = useRef(null);
  const [narrow,setNarrow]=useState(false);
  useEffect(()=>{
    function calc(){ if(wrapRef.current){ setNarrow(wrapRef.current.offsetWidth < 380); } }
    calc(); window.addEventListener('resize',calc); return ()=>window.removeEventListener('resize',calc);
  },[]);
  const keyH = narrow? 50 : 56;
  return (
    <div ref={wrapRef} className={"wt-inline-numpad" + (inline? ' wt-inline-numpad-inline':'')} data-narrow={narrow? '1':'0'} aria-label="Number Pad">
      <button className="wt-kb-close" style={{position:'absolute',top:6,right:6}} onClick={onClose}>×</button>
      <div className="wt-numpad" aria-label="Digits">
        <div className="wt-numpad-row">
          {['1','2','3'].map(d=> <button key={d} className="wt-numpad-btn" onClick={()=>onChange(value + d)}>{d}</button>)}
        </div>
        <div className="wt-numpad-row">
          {['4','5','6'].map(d=> <button key={d} className="wt-numpad-btn" onClick={()=>onChange(value + d)}>{d}</button>)}
        </div>
        <div className="wt-numpad-row">
          {['7','8','9'].map(d=> <button key={d} className="wt-numpad-btn" onClick={()=>onChange(value + d)}>{d}</button>)}
        </div>
        <div className="wt-numpad-row">
          <button className="wt-numpad-btn wt-wide" onClick={()=>onChange(value + '0')}>0</button>
        </div>
        <div className="wt-numpad-actions">
          <button className="wt-numpad-btn wt-danger" onClick={()=>onChange('')}>Clear</button>
          <button className="wt-numpad-btn wt-warn" onClick={()=>onChange(value.slice(0,-1))}>⌫</button>
          <button className="wt-numpad-btn wt-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// Base button inline style (legacy uses). Most moved to CSS.
const btnStyle = {background:'#23272f',color:'#e0e6ed',border:'1px solid #00b4d8',padding:'10px 8px',borderRadius:8,fontWeight:'bold',fontSize:16,cursor:'pointer'};

export default function WarehouseTransfer(){
  const navigate = useNavigate();
  const now = useNowTick();
  const [transferNumber,setTransferNumber]=useState('');
  const [products,setProducts]=useState([]); // all products for search
  const [combos,setCombos]=useState([]); // set / combo parent definitions
  const [comboItemsMap,setComboItemsMap]=useState(new Map()); // combo_id -> [{product_id, quantity, name, sku}]
  const [inventory,setInventory]=useState([]);
  const [search,setSearch]=useState('');
  const [selected,setSelected]=useState([]); // {product_id, sku, name, qty}
  const searchRef = useRef(null);
  const transferInputRef = useRef(null);
  const wtWrapperRef = useRef(null);
  const [activeKeyboard,setActiveKeyboard]=useState(null); // 'search' | 'numpad' | null
  const [lastAdded,setLastAdded]=useState(null); // product_id highlight
  const highlightTimerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const [scale,setScale]=useState(1); // keyboard scale (reduced default)
  const [pageScale,setPageScale]=useState(1); // overall page scale for very small screens
  const [locationOptions, setLocationOptions] = useState([]);
  const [fromLocationName, setFromLocationName] = useState('');
  const [toLocationName, setToLocationName] = useState('');
  const [toLocationId, setToLocationId] = useState(KITWE_LOCATION_ID);

  const fromLabel = fromLocationName || 'Factory Warehouse';
  const toLabel = toLocationName || 'Destination';
  const destinationOptions = DEST_LOCATION_IDS.map((id) => {
    const match = (locationOptions || []).find(l => String(l.id) === String(id));
    return { id, name: match?.name || String(id) };
  });

  // compute scale for window; force baseline for 1024x768
  useEffect(()=>{
    function handleResize(){
      const w = window.innerWidth;
      if(w<=1024) { setScale(1); setPageScale(1); }
      else if(w>1600) { setScale(1.1); setPageScale(1); } else { setScale(1); setPageScale(1); }
    }
    handleResize();
    window.addEventListener('resize',handleResize);
    return ()=>window.removeEventListener('resize',handleResize);
  },[pageScale]);

  // Always start clean per user request
  useEffect(()=>{ localStorage.removeItem(LS_KEY); setTransferNumber(''); setSelected([]); },[]);

  useEffect(() => {
    const root = wtWrapperRef.current;
    if (!root) return undefined;
    root.addEventListener('wheel', blockNumberInputWheel, { passive: false, capture: true });
    return () => root.removeEventListener('wheel', blockNumberInputWheel, { capture: true });
  }, []);

  // Fetch product catalog + combos + inventory for source/destination
  useEffect(()=>{(async()=>{
    const [{ data: prods }, { data: inv }, { data: cbs } ] = await Promise.all([
      db.from('products').select('id,name,sku'),
      db.from('inventory').select('product_id,location,quantity').in('location',[FROM_LOCATION_ID,toLocationId]),
      db.from('combos').select('id,combo_name,sku')
    ]);
    setProducts(prods||[]);
    setInventory(inv||[]);
    setCombos(cbs||[]);
  })();},[toLocationId]);

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
    setFromLocationName(fromLoc?.name || 'Factory Warehouse');
    setToLocationName(toLoc?.name || '');
  }, [locationOptions, toLocationId]);

  async function ensureComboItemsLoaded(combo){
    if(comboItemsMap.has(combo.id)) return comboItemsMap.get(combo.id);
    const { data: items } = await db.from('combo_items').select('product_id,quantity, products(name,sku)').eq('combo_id', combo.id);
    const mapped = (items||[]).map(it=>({ product_id: it.product_id, quantity: it.quantity, name: it.products?.name, sku: it.products?.sku }));
    setComboItemsMap(prev=>{ const n=new Map(prev); n.set(combo.id,mapped); return n; });
    return mapped;
  }

  const filteredProducts = products.filter(p=>{
    if(!search.trim()) return false; // show nothing until typing/scanning
    const s=search.toLowerCase();
    return (p.name && p.name.toLowerCase().includes(s)) || (p.sku && p.sku.toLowerCase().includes(s)) || p.id===search.trim();
  }).slice(0,30);
  const filteredCombos = combos.filter(c=>{
    if(!search.trim()) return false;
    const s=search.toLowerCase();
    return (c.combo_name && c.combo_name.toLowerCase().includes(s)) || (c.sku && c.sku.toLowerCase().includes(s));
  }).slice(0,20);
  const filtered = [...filteredCombos.map(c=>({...c,_type:'combo'})), ...filteredProducts.map(p=>({...p,_type:'product'}))];

  function beep(){
    try {
      if(!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext||window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type='square';
      o.frequency.value=660;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime+0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.18);
      o.start(); o.stop(ctx.currentTime+0.2);
    }catch{}
  }

  function addProduct(p){
    setSelected(prev=>{
      const existing=prev.find(x=>x.kind==='product' && x.product_id===p.id);
      if(existing){return prev.map(x=>x.kind==='product' && x.product_id===p.id?{...x,qty:x.qty+1}:x);} else {return [...prev,{id:p.id,kind:'product',product_id:p.id,sku:p.sku,name:p.name,qty:1}]}
    });
    setSearch('');
    if(searchRef.current) searchRef.current.focus();
    setLastAdded(p.id);
    beep();
    if(highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(()=>setLastAdded(null),1500);
  }

  async function addSet(combo){
    const items = await ensureComboItemsLoaded(combo);
    setSelected(prev=>{
      // does parent already exist?
      const parent = prev.find(l=>l.kind==='set-parent' && l.combo_id===combo.id);
      if(parent){
        const newQty = parent.qty + 1;
        return prev.map(l=>{
          if(l.kind==='set-parent' && l.combo_id===combo.id) return {...l, qty:newQty};
          if(l.kind==='set-component' && l.parent_combo_id===combo.id) return {...l, qty:l.per_set_qty * newQty};
          return l;
        });
      }
      const parentLine = { id:`set:${combo.id}`, kind:'set-parent', combo_id:combo.id, name:combo.combo_name, sku:combo.sku, qty:1 };
      const componentLines = items.map(it=>({ id:`set:${combo.id}:p:${it.product_id}`, kind:'set-component', parent_combo_id:combo.id, product_id:it.product_id, name:it.name, sku:it.sku, per_set_qty:it.quantity, qty:it.quantity }));
      return [...prev, parentLine, ...componentLines];
    });
    setSearch('');
    if(searchRef.current) searchRef.current.focus();
    beep();
  }

  function updateQtyForLine(lineId, delta){
    // Single pass to adjust target then a second targeted pass only if parent changed
    let parentChangedCombo = null;
    setSelected(prev=>{
      const updated = prev.map(l=>{
        if(l.id===lineId){
          if(l.kind==='set-parent'){
            parentChangedCombo = l.combo_id;
            const newQty = Math.max(0, l.qty + delta);
            return {...l, qty:newQty};
          }
          if(l.kind==='product') return {...l, qty:Math.max(0, l.qty + delta)};
        }
        return l;
      });
      if(parentChangedCombo!==null){
        return updated.map(l=>{
          if(l.kind==='set-component' && l.parent_combo_id===parentChangedCombo){
            const parent = updated.find(p=>p.kind==='set-parent' && p.combo_id===parentChangedCombo);
            if(parent) return {...l, qty:l.per_set_qty * parent.qty};
          }
          return l;
        });
      }
      return updated;
    });
  }
  function setQtyForLine(lineId,val){
    const num=Number(val); if(!Number.isFinite(num)||num<0) return;
    setSelected(prev=>prev.map(l=>{
      if(l.id===lineId){
        if(l.kind==='set-parent') return {...l, qty:num};
        if(l.kind==='product') return {...l, qty:num};
      }
      return l;
    }));
    setSelected(prev=>prev.map(l=>{
      if(l.kind==='set-component'){
        const parent = prev.find(p=>p.kind==='set-parent' && p.combo_id===l.parent_combo_id);
        if(parent) return {...l, qty:l.per_set_qty * parent.qty};
      }
      return l;
    }));
  }
  function removeLine(line){
    if(line.kind==='set-parent'){
      setSelected(prev=>prev.filter(l=>!(l.kind==='set-parent' && l.combo_id===line.combo_id) && !(l.kind==='set-component' && l.parent_combo_id===line.combo_id)));
    } else if(line.kind==='product'){
      setSelected(prev=>prev.filter(l=>!(l.kind==='product' && l.product_id===line.product_id)));
    }
  }
  function removeZeroes(){
    setSelected(prev=>prev.filter(x=>x.qty>0 || x.kind==='set-parent')); // keep parent if components positive? If zero, will be removed next save
  }

  const grandTotal = selected.filter(x=>x.kind!=='set-parent').reduce((s,x)=>s + (Number(x.qty)||0),0);

  function handleSave(){
    // Require at least one product to review
    if(!selected.length){ alert('Add at least one product'); return; }
    const payload={
      transferNumber: transferNumber.trim(),
      from: FROM_LOCATION_ID,
      to: toLocationId,
      capturedAt: new Date().toISOString(),
      // Persist set parents and positive-qty tangible lines
      items: selected.filter(i=> (i.kind==='set-parent') || (Number(i.qty)||0) > 0)
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
    navigate('/All-Transfers-summary');
  }

  function sourceQty(pid){
    const row = inventory.find(r=>r.product_id===pid && r.location===FROM_LOCATION_ID);return row?Number(row.quantity)||0:0;
  }

  // handle Enter key in search input (physical keyboard / scanner sending Enter)
  function handleSearchKey(e){
    if(e.key==='Enter'){
      if(filtered.length>0){
        const first = filtered[0];
        if(first._type==='combo') addSet(first); else addProduct(first);
      }
    }
  }

  return (
    <>
      {/* Background moved OUTSIDE of scaled wrapper to prevent white side gaps */}
  <div className="wt-page-bg" />
  <div className="wt-wrapper" ref={wtWrapperRef} style={{transform:`scale(${pageScale})`,transformOrigin:'top center'}}>
  <div className="page-header-row wt-header-row">
    <BackToDashboard />
    <h1 className="wt-title wt-title-inline">Factory Transfer Entry</h1>
  </div>
  <div className="wt-grid-top">
        {/* Transfer + Keyboard Trigger */}
        <div style={{display:'flex',flexDirection:'column'}}>
          <label className="wt-label">Transfer # (Manual)</label>
          <div className="wt-transfer-group">
            <input 
              ref={transferInputRef} 
              value={transferNumber} 
              onChange={e=>{
                // Allow digits and single dash only
                let v = e.target.value.replace(/[^0-9-]/g,'');
                const firstDash = v.indexOf('-');
                if(firstDash!==-1){
                  // remove subsequent dashes
                  v = v.slice(0, firstDash+1) + v.slice(firstDash+1).replace(/-/g,'');
                }
                setTransferNumber(v);
              }} 
              className="wt-input wt-input-compact" 
              placeholder="Enter transfer reference" 
              inputMode="numeric" 
              onFocus={()=>{ setActiveKeyboard('numpad'); }}
            />
            <button 
              type="button" 
              aria-label="Show Number Pad" 
              onClick={()=>{
                setActiveKeyboard(k=> k==='numpad'? null : 'numpad');
                setTimeout(()=>transferInputRef.current?.focus(),0);
              }} 
              className="wt-btn wt-btn-compact wt-btn-numpad"><span>123</span></button>
            {activeKeyboard==='numpad' && (
              <div className="wt-floating-numpad">
                <PhoneNumPad 
                  value={transferNumber} 
                  onChange={setTransferNumber} 
                  onClose={()=>setActiveKeyboard(null)} 
                  inline
                />
              </div>
            )}
          </div>
          <div style={{marginTop:12, display:'flex', gap:'2cm', alignItems:'flex-end', flexWrap:'nowrap'}}>
            <div style={{maxWidth:220, flex:'0 0 220px'}}>
              <label className="wt-label" style={{textAlign:'center'}}>Grand Qty</label>
              <div className="wt-lock-box wt-grand-small" style={{justifyContent:'center'}}>{grandTotal}</div>
            </div>
          </div>
        </div>
        {/* Locked Info */}
        <div style={{display:'flex',flexDirection:'column'}}>
          <label className="wt-label">From (Locked)</label>
          <div className="wt-lock-box">{fromLabel}</div>
          <label className="wt-label">To</label>
          <select
            className="wt-input wt-input-compact"
            value={toLocationId}
            onChange={(e) => setToLocationId(e.target.value)}
          >
            {destinationOptions.map(loc => (
              <option key={loc.id} value={String(loc.id)}>{loc.name}</option>
            ))}
          </select>
          <label className="wt-label">Current Date/Time</label>
          <div className="wt-lock-box">{now.toLocaleString()}</div>
        </div>
      </div>
      {/* Full-width Product Search */}
      <div className="wt-search-wide">
        <label className="wt-label">Product Search / Scan</label>
        <div className="wt-flex wt-gap-8">
          <input
            ref={searchRef}
            value={search}
            onChange={e=>setSearch(e.target.value)}
            onKeyDown={handleSearchKey}
            className="wt-input wt-input-wide"
            placeholder="Type name, SKU or scan code"
            enterKeyHint="search"
            autoComplete="off"
          />
          <button
            type="button"
            aria-label="Show Search Keyboard"
            onClick={()=>{ setActiveKeyboard(k=> k==='search'? null : 'search'); setTimeout(()=>searchRef.current?.focus(),0); }}
            className="wt-btn wt-btn-compact">⌨
          </button>
        </div>
        {/* Inline Search Keyboard directly below input */}
        {activeKeyboard==='search' && (
          <div className="wt-inline-kb-wrapper" style={{marginTop:12}}>
            <PhoneSearchKeyboard 
              value={search} 
              onChange={setSearch} 
              onEnter={()=>{ if(filtered.length>0) addProduct(filtered[0]); }} 
              onClose={()=>setActiveKeyboard(null)} />
          </div>
        )}
        {search.trim() && (
          <div className="wt-search-results">
            {filtered.length===0 && <div className="wt-search-empty">No matches</div>}
            {filtered.map(p=> (
              <div key={(p._type==='combo'?'combo:':'prod:')+p.id} className="wt-search-row" onClick={()=> p._type==='combo'? addSet(p): addProduct(p)}>
                <b>{p._type==='combo'? '[SET] ' + p.combo_name : p.name}</b> <span className="wt-search-sku">{p.sku}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="wt-selected-wrapper">
        <h2 style={{margin:'0 0 12px'}}>Selected Products</h2>
        <div className="wt-selected-table-wrapper">
          <table className="wt-table">
            <thead style={{position:'sticky',top:0,zIndex:2}}>
              <tr style={{background:'#23272f'}}>
                <th>Name</th>
                <th>SKU</th>
                <th>Source Qty</th>
                <th>Transfer Qty</th>
                <th>Remove</th>
              </tr>
            </thead>
            <tbody>
              {selected.map(item=> {
                const isParent = item.kind==='set-parent';
                const isComponent = item.kind==='set-component';
                const highlight = item.kind==='product' && item.product_id===lastAdded;
                return (
                  <tr key={item.id||item.product_id} className={highlight? 'wt-row-highlight': (isParent?'wt-row-parent':'wt-row-default')} style={{transition:'background 0.3s'}}>
                    <td style={{paddingLeft:isComponent?28:8,fontStyle:isParent?'italic':'normal'}}>{isComponent? '↳ '+item.name : item.name}{isParent?' (Set)':''}</td>
                    <td>{item.sku||'-'}</td>
                    <td>{item.product_id? sourceQty(item.product_id) : '-'}</td>
                    <td>
                      {isComponent ? (
                        <div style={{textAlign:'center'}}>{item.qty}</div>
                      ) : (
                        <div style={{display:'flex',alignItems:'center',gap:6,justifyContent:'center'}}>
                          <button className="wt-qty-btn" onClick={()=>updateQtyForLine(item.id,-1)}>-</button>
                          <input type="number" className="wt-qty-input" value={item.qty} onChange={e=>setQtyForLine(item.id,e.target.value)} />
                          <button className="wt-qty-btn" onClick={()=>updateQtyForLine(item.id,1)}>+</button>
                        </div>
                      )}
                    </td>
                    <td>
                      {isComponent ? <span style={{opacity:0.4}}>-</span> : (
                        <button aria-label="Remove" onClick={()=>removeLine(item)} className="wt-qty-btn" style={{background:'#e74c3c',padding:'6px 10px'}}>X</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {selected.length===0 && (
                <tr><td colSpan={5} style={{textAlign:'center',padding:40,color:'#8ab'}}>No products yet.</td></tr>
              )}
            </tbody>
            {selected.length>0 && (
              <tfoot>
                <tr style={{background:'#23272f',fontWeight:'bold'}}>
                  <td style={{textAlign:'right'}} colSpan={4}>Grand Total</td>
                  <td>{grandTotal}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      {/* Bottom Actions */}
      <div className="wt-bottom-actions">
        <button onClick={handleSave} className="wt-btn wt-btn-primary">Save & Review</button>
        {selected.length>0 && (
          <button onClick={()=>{ if(window.confirm('Clear all selected products?')) setSelected([]); }} className="wt-btn wt-btn-danger">Clear All</button>
        )}
      </div>
      {/* Bottom running totals panel (aligned to content width) */}
      {(!activeKeyboard || activeKeyboard==='numpad') && (
        <div className="wt-bottom-bar">
          <div className="wt-bottom-bar-inner">
            <div>Lines: <b>{selected.length}</b></div>
            <div>Total Qty: <b>{grandTotal}</b></div>
            <div className="wt-bottom-bar-route">From: {fromLabel} ➜ To: {toLabel}</div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}

// Removed old inline style constants (migrated to CSS). Keeping placeholders if future JS-calculated styles needed.
const floatingClose = {}; // replaced by wt-close class
