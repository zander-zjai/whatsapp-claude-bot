'use strict';

const axios = require('axios');
const PDFDocument = require('pdfkit');
const { logError } = require('./logger');

const PAGE_MARGIN = 50;
const TABLE_LEFT = 50;
const TABLE_RIGHT = 545;
const COL = { item: 50, unit: 280, qty: 360, unitPrice: 420, total: 490 };

const DEFAULT_TERMS =
  'This quote is valid for 7 days from the date of issue. Prices are subject to change after ' +
  'the validity period. A 50% deposit may be required before work begins. All prices are in ' +
  'South African Rand (ZAR).';

function formatCurrency(amount) {
  return `R${(Number(amount) || 0).toFixed(2)}`;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Fetch a logo image as a Buffer. Returns null (and logs) on any failure. */
async function fetchLogo(logoUrl) {
  if (!logoUrl) return null;

  try {
    const response = await axios.get(logoUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
    });
    return Buffer.from(response.data);
  } catch (err) {
    logError('Failed to fetch quote logo:', err.message);
    return null;
  }
}

/**
 * Render a branded PDF quote for a Tier 2 quote record.
 *
 * @param {object} client - the client config (name, brand_color, logo_url, quote_terms)
 * @param {object} quote - the quote record (id, name, line_items, total, valid_until, ...)
 * @returns {Promise<Buffer>}
 */
async function generateQuotePdf(client, quote) {
  const brandColor = client.brand_color || '#1E3A8A';
  const logoBuffer = await fetchLogo(client.logo_url);

  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
  const chunks = [];

  const done = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // Header: logo top-left, business name top-right.
  let headerBottom = PAGE_MARGIN;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, PAGE_MARGIN, PAGE_MARGIN, { fit: [120, 60] });
      headerBottom = Math.max(headerBottom, PAGE_MARGIN + 60);
    } catch (err) {
      logError('Failed to embed quote logo:', err.message);
    }
  }

  doc
    .fillColor(brandColor)
    .font('Helvetica-Bold')
    .fontSize(18)
    .text(client.name || '', PAGE_MARGIN, PAGE_MARGIN, {
      align: 'right',
      width: TABLE_RIGHT - PAGE_MARGIN,
    });
  headerBottom = Math.max(headerBottom, doc.y);

  doc.y = headerBottom + 20;

  // Title.
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(24).text('QUOTE', PAGE_MARGIN, doc.y);
  doc.moveDown(0.5);

  // Quote meta block.
  doc.font('Helvetica').fontSize(10).fillColor('#374151');
  doc.text(`Quote #: ${String(quote.id).slice(0, 8).toUpperCase()}`);
  doc.text(`Date: ${formatDate(quote.created_at)}`);
  doc.text(`Valid until: ${formatDate(quote.valid_until)}`);
  doc.moveDown(0.75);

  // Divider.
  doc
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(TABLE_RIGHT, doc.y)
    .lineWidth(2)
    .strokeColor(brandColor)
    .stroke();
  doc.moveDown(0.75);

  // Customer block.
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Quote For:');
  doc.font('Helvetica').fontSize(10).fillColor('#374151');
  doc.text(quote.name || '');
  if (quote.contact_number) doc.text(quote.contact_number);
  doc.moveDown(1);

  // Line items table.
  const items =
    Array.isArray(quote.line_items) && quote.line_items.length > 0
      ? quote.line_items
      : [
          {
            item: quote.item_description || 'Item',
            unit: '',
            quantity: Number(quote.quantity) || 0,
            unit_price: 0,
            line_total: 0,
          },
        ];

  const rowHeight = 24;
  let tableTop = doc.y;

  function drawTableHeader(y) {
    doc.rect(TABLE_LEFT, y, TABLE_RIGHT - TABLE_LEFT, rowHeight).fill(brandColor);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10);
    doc.text('Item', COL.item + 5, y + 7, { width: COL.unit - COL.item - 10 });
    doc.text('Unit', COL.unit + 5, y + 7, { width: COL.qty - COL.unit - 10 });
    doc.text('Qty', COL.qty + 5, y + 7, { width: COL.unitPrice - COL.qty - 10, align: 'right' });
    doc.text('Unit Price', COL.unitPrice + 5, y + 7, {
      width: COL.total - COL.unitPrice - 10,
      align: 'right',
    });
    doc.text('Total', COL.total + 5, y + 7, {
      width: TABLE_RIGHT - COL.total - 10,
      align: 'right',
    });
    return y + rowHeight;
  }

  let y = drawTableHeader(tableTop);

  items.forEach((item, index) => {
    if (y + rowHeight > doc.page.height - PAGE_MARGIN - 150) {
      doc.addPage();
      y = PAGE_MARGIN;
      y = drawTableHeader(y);
    }

    if (index % 2 === 1) {
      doc.rect(TABLE_LEFT, y, TABLE_RIGHT - TABLE_LEFT, rowHeight).fill('#F3F4F6');
    }

    doc.fillColor('#111827').font('Helvetica').fontSize(10);
    doc.text(item.item || '', COL.item + 5, y + 7, { width: COL.unit - COL.item - 10 });
    doc.text(item.unit || '', COL.unit + 5, y + 7, { width: COL.qty - COL.unit - 10 });
    doc.text(String(item.quantity ?? ''), COL.qty + 5, y + 7, {
      width: COL.unitPrice - COL.qty - 10,
      align: 'right',
    });
    doc.text(formatCurrency(item.unit_price), COL.unitPrice + 5, y + 7, {
      width: COL.total - COL.unitPrice - 10,
      align: 'right',
    });
    doc.text(formatCurrency(item.line_total), COL.total + 5, y + 7, {
      width: TABLE_RIGHT - COL.total - 10,
      align: 'right',
    });

    y += rowHeight;
  });

  // Total row.
  doc.rect(TABLE_LEFT, y, TABLE_RIGHT - TABLE_LEFT, rowHeight).fill(brandColor);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11);
  doc.text('Total', COL.unitPrice + 5, y + 7, {
    width: COL.total - COL.unitPrice - 10,
    align: 'right',
  });
  doc.text(formatCurrency(quote.total), COL.total + 5, y + 7, {
    width: TABLE_RIGHT - COL.total - 10,
    align: 'right',
  });
  y += rowHeight;

  doc.y = y + 30;

  // Terms & conditions.
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Terms & Conditions');
  doc.moveDown(0.25);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#6B7280')
    .text(client.quote_terms || DEFAULT_TERMS, { width: TABLE_RIGHT - PAGE_MARGIN });

  doc.end();
  return done;
}

module.exports = { generateQuotePdf, formatCurrency, formatDate, DEFAULT_TERMS };
