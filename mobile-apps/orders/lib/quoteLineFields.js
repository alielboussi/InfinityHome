export const CARPENTRY_WOOD_OPTIONS = [
  'Laminated',
  'Rosewood',
  'Mukwa',
  'Hardwood',
  'Sprayed Wood',
  'Melamine Wood',
  'MDF',
];

export const UPHOLSTERY_FOAM_OPTIONS = [
  'High density (HD)',
  'Medium density (MD)',
  'Soft / low density',
  'Memory foam',
  'Rebonded',
  'Spring foam',
  'Coconut fibre (coir)',
  'Wrap / Dacron',
];

export const CARPENTRY_ACCESSORY_GROUPS = [
  { category: 'Kitchen Units', items: ['Granite', 'Quartz Countertop', 'Marble Countertop', 'Sink', 'Double Bowl Sink', 'Mixer', 'Pull-Out Spray Mixer', 'Soft-Close Hinges', 'Soft-Close Drawer Runners', 'Cabinet Handles / Knobs', 'Cutlery Tray', 'Spice Rack Pull-Out', 'Corner Carousel / Magic Corner', 'Dish Rack Insert', 'Pull-Out Waste Bin', 'Plinth / Kickboard', 'Under-Cabinet LED Strip', 'Gas Struts / Lift-Up Stay'] },
  { category: 'Doors', items: ['Door Lock Set', 'Mortise Lock & Cylinder', 'Door Handle Set', 'Flush Pull Handle', 'Heavy-Duty Hinges', 'Concealed Hinges', 'Door Closer', 'Door Stopper', 'Tower Bolt / Flush Bolt', 'Peephole / Door Viewer', 'Weather Strip / Seal', 'Architrave / Door Frame Trim'] },
  { category: 'Beds', items: ['Orthopedic Slats / Base', 'Hydraulic Storage Lift Mechanism', 'Under-Bed Storage Drawers', 'Upholstered Headboard Cushion', 'Bedside Reading Light', 'Built-In USB / Power Socket', 'Mattress Support Center Rail', 'Bedside Floating Shelf'] },
  { category: 'Dining Tables', items: ['Tempered Glass Top', 'Marble / Granite Table Top', 'Extension Leaf Mechanism', 'Lazy Susan Turntable', 'Metal / Brass Leg Caps', 'Adjustable Floor Glides'] },
  { category: 'Dining Chairs', items: ['Upholstered Seat Pad', 'Fabric / Leather Seat Cover', 'Felt Floor Protectors', 'Brass / Chrome Footrest Trim', 'Armrest Pads'] },
  { category: 'Buffets & Buffet Mirrors', items: ['Beveled Mirror Glass', 'LED Backlight Strip', 'Glass Shelves', 'Wine / Stemware Rack Insert', 'Push-to-Open Latches', 'Soft-Close Buffet Hinges & Runners', 'Heavy-Duty Wall Mounting Brackets'] },
  { category: 'Dresser Tables & Dresser Mirrors', items: ['Hollywood LED Mirror Bulbs', 'Touch-Sensor LED Mirror Light', 'Velvet Jewelry Tray Insert', 'Cosmetic Drawer Dividers', 'Glass Top Protector', 'Dresser Stool / Pouf', 'Hair Dryer / Styling Holder'] },
  { category: 'Conference Tables', items: ['Pop-Up Power & HDMI Box', 'Cable Management Grommet', 'Under-Table Cable Tray', 'Wire Management Spine', 'Modesty Panel', 'Integrated Wireless Charger'] },
  { category: 'Office Desks', items: ['Cable Grommet', 'Desktop Power & USB Outlet', 'Pull-Out Keyboard Tray', 'Lockable 3-Drawer Pedestal', 'Central Drawer Lock', 'CPU Holder', 'Monitor Arm Mount', 'Desk Modesty Panel'] },
  { category: 'Office Chairs', items: ['Gas Lift Cylinder', 'Swivel Tilt Mechanism', 'PU / Nylon Castor Wheels', 'Adjustable 3D Armrests', 'Lumbar Support Cushion', 'Adjustable Headrest', 'Chrome / Aluminum 5-Star Base'] },
];

export function unitLabel(unit) {
  if (!unit) return '';
  const abbr = String(unit.abbreviation || '').trim();
  const name = String(unit.name || '').trim();
  return abbr || name || '';
}

/** Orders app UOM: m, m²/sq, pcs only (no blank “—” unit). */
export function ordersUomBucket(unit) {
  const abbr = String(unit?.abbreviation || '').trim();
  const name = String(unit?.name || '').trim();
  const display = unitLabel(unit);
  if (!display || display === '-' || display === '—') return '';
  const compact = display.toLowerCase().replace(/\s+/g, '').replace(/²/g, '2');
  if (compact === 'm') return 'm';
  if (compact === 'pcs' || compact === 'pc') return 'pcs';
  if (compact === 'm2' || compact === 'sq' || compact === 'sqm') return 'sq';
  if (/^m\s*²$/i.test(abbr)) return 'sq';
  const nameCompact = name.toLowerCase().replace(/[^a-z]/g, '');
  if (nameCompact.includes('squaremeter') || nameCompact.includes('squaremetre') || nameCompact.includes('metersquared')) {
    return 'sq';
  }
  if (nameCompact === 'meter' || nameCompact === 'metre' || nameCompact === 'meters' || nameCompact === 'metres') {
    return 'm';
  }
  if (nameCompact.includes('piece')) return 'pcs';
  return '';
}

export function filterOrdersUomUnits(units) {
  return (units || []).filter((u) => ordersUomBucket(u) !== '');
}

/** Keep a legacy selection visible when editing old rows. */
export function ordersUnitOptions(units, selectedId) {
  const filtered = filterOrdersUomUnits(units);
  const sid = selectedId ? String(selectedId) : '';
  if (sid && !filtered.some((u) => String(u.id) === sid)) {
    const keep = (units || []).find((u) => String(u.id) === sid);
    if (keep) return [...filtered, keep];
  }
  return filtered;
}
