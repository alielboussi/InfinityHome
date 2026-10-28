/**
 * Ensures delivery note pagination never splits a product chunk across pages.
 */
const path = require('path');

const {
  paginateDeliveryNoteBlocks,
} = require(path.join(
  __dirname,
  '../src/utils/buildDeliveryNotePrintHtml.js',
));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function run() {
  const manyPackets = {
    assembly_name: 'Sofa A',
    units: 2,
    lines: Array.from({ length: 30 }, (_, i) => ({
      name: `Carton ${i + 1}`,
      packet_number: i + 1,
      qty: 2,
    })),
  };
  const pages = paginateDeliveryNoteBlocks([
    manyPackets,
    { assembly_name: 'Chair B', units: 1, lines: [{ name: 'P1', packet_number: 1, qty: 1 }] },
  ]);
  assert(pages.length >= 2, 'expected multiple pages for large delivery');

  for (const page of pages) {
    let used = 0;
    for (const block of page) {
      assert(block.rowCount === 1 + block.lines.length, 'block rowCount consistent');
      used += block.rowCount;
    }
    assert(used <= 30, 'page within row budget');
  }

  const allLines = pages.flat().flatMap((b) => b.lines);
  assert(allLines.length === 31, 'all packet lines preserved across chunks');

  const chairPage = pages.find((p) => p.some((b) => b.assembly_name === 'Chair B'));
  assert(chairPage, 'chair product present');
  const sofaPages = pages.filter((p) => p.some((b) => b.assembly_name === 'Sofa A'));
  assert(sofaPages.length >= 2, 'large sofa split across pages with repeated product rows');

  const single = paginateDeliveryNoteBlocks([]);
  assert(single.length === 1 && single[0].length === 0, 'empty cart → one page');

  console.log('verifyDeliveryNotePrintPagination: ok');
}

run();
