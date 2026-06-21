'use strict';

const axios = require('axios');
const PDFDocument = require('pdfkit');
const { logError } = require('./logger');

const PAGE_MARGIN = 50;
const TABLE_LEFT = 50;
const TABLE_RIGHT = 545;
const COL = { item: 50, unit: 260, qty: 330, unitPrice: 390, total: 460 };

const INK = '#111827';
const MUTED = '#6B7280';
const SUBTLE = '#9CA3AF';

const DEFAULT_TERMS =
  'This quote is valid for 7 days from the date of issue. Prices are subject to change after ' +
  'the validity period. A 50% deposit may be required before work begins. All prices are in ' +
  'South African Rand (ZAR).';

function formatCurrency(amount) {
  const value = (Number(amount) || 0).toFixed(2);
  const [whole, cents] = value.split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `R${withCommas}.${cents}`;
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

function drawFooter(doc, brandColor, clientName) {
  // Stay safely inside the bottom margin boundary — pdfkit auto-paginates
  // text that would overflow past it, which previously stranded the
  // footer alone on a blank second page.
  const footerY = doc.page.height - PAGE_MARGIN - 26;
  doc
    .moveTo(PAGE_MARGIN, footerY)
    .lineTo(TABLE_RIGHT, footerY)
    .lineWidth(0.5)
    .strokeColor('#E5E7EB')
    .stroke();

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(SUBTLE)
    .text(`Thank you for choosing ${clientName || 'us'}.`, PAGE_MARGIN, footerY + 8, {
      width: TABLE_RIGHT - PAGE_MARGIN,
    });
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

  // Top accent band.
  doc.rect(0, 0, doc.page.width, 8).fill(brandColor);

  // Header: logo top-left, business name + "QUOTE" badge top-right.
  let headerBottom = PAGE_MARGIN + 20;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, PAGE_MARGIN, PAGE_MARGIN + 20, { fit: [130, 60] });
      headerBottom = Math.max(headerBottom, PAGE_MARGIN + 20 + 60);
    } catch (err) {
      logError('Failed to embed quote logo:', err.message);
    }
  }

  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(client.name || '', PAGE_MARGIN, PAGE_MARGIN + 20, {
      align: 'right',
      width: TABLE_RIGHT - PAGE_MARGIN,
    });
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(brandColor)
    .text('QUOTATION', PAGE_MARGIN, doc.y + 2, {
      align: 'right',
      width: TABLE_RIGHT - PAGE_MARGIN,
      characterSpacing: 1.5,
    });
  headerBottom = Math.max(headerBottom, doc.y);

  doc.x = PAGE_MARGIN;
  doc.y = headerBottom + 30;

  // Divider under header.
  doc
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(TABLE_RIGHT, doc.y)
    .lineWidth(1.5)
    .strokeColor(brandColor)
    .stroke();
  doc.y += 20;

  // Two-column meta block: "Quote For" on the left, quote details on the right.
  const metaTop = doc.y;
  const colWidth = (TABLE_RIGHT - PAGE_MARGIN - 20) / 2;

  doc.font('Helvetica-Bold').fontSize(9).fillColor(SUBTLE).text('QUOTE FOR', PAGE_MARGIN, metaTop, {
    characterSpacing: 1,
  });
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor(INK)
    .text(quote.name || '', PAGE_MARGIN, doc.y + 4, { width: colWidth });
  if (quote.contact_number) {
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(quote.contact_number, PAGE_MARGIN, doc.y + 2);
  }

  const metaRightX = PAGE_MARGIN + colWidth + 20;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(SUBTLE).text('QUOTE DETAILS', metaRightX, metaTop, {
    width: colWidth,
    align: 'right',
    characterSpacing: 1,
  });
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(MUTED)
    .text(`Quote #: ${String(quote.id).slice(0, 8).toUpperCase()}`, metaRightX, doc.y + 4, {
      width: colWidth,
      align: 'right',
    })
    .text(`Date: ${formatDate(quote.created_at)}`, metaRightX, doc.y + 2, {
      width: colWidth,
      align: 'right',
    })
    .text(`Valid until: ${formatDate(quote.valid_until)}`, metaRightX, doc.y + 2, {
      width: colWidth,
      align: 'right',
    });

  doc.x = PAGE_MARGIN;
  doc.y += 30;

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

  const rowHeight = 26;
  let tableTop = doc.y;

  function drawTableHeader(y) {
    doc.rect(TABLE_LEFT, y, TABLE_RIGHT - TABLE_LEFT, rowHeight).fill(brandColor);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
    doc.text('ITEM', COL.item + 10, y + 9, { width: COL.unit - COL.item - 10, characterSpacing: 0.5 });
    doc.text('UNIT', COL.unit + 5, y + 9, { width: COL.qty - COL.unit - 10, characterSpacing: 0.5 });
    doc.text('QTY', COL.qty + 5, y + 9, {
      width: COL.unitPrice - COL.qty - 10,
      align: 'right',
      characterSpacing: 0.5,
    });
    doc.text('UNIT PRICE', COL.unitPrice + 5, y + 9, {
      width: COL.total - COL.unitPrice - 10,
      align: 'right',
      characterSpacing: 0.5,
    });
    doc.text('TOTAL', COL.total + 5, y + 9, {
      width: TABLE_RIGHT - COL.total - 10,
      align: 'right',
      characterSpacing: 0.5,
    });
    return y + rowHeight;
  }

  let y = drawTableHeader(tableTop);

  items.forEach((item, index) => {
    if (y + rowHeight > doc.page.height - PAGE_MARGIN - 160) {
      drawFooter(doc, brandColor, client.name);
      doc.addPage();
      doc.rect(0, 0, doc.page.width, 8).fill(brandColor);
      y = PAGE_MARGIN + 20;
      y = drawTableHeader(y);
    }

    if (index % 2 === 1) {
      doc.rect(TABLE_LEFT, y, TABLE_RIGHT - TABLE_LEFT, rowHeight).fill('#F9FAFB');
    }

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10);
    doc.text(item.item || '', COL.item + 10, y + 8, { width: COL.unit - COL.item - 10 });
    doc.font('Helvetica').fillColor(MUTED);
    doc.text(item.unit || '', COL.unit + 5, y + 8, { width: COL.qty - COL.unit - 10 });
    doc.text(String(item.quantity ?? ''), COL.qty + 5, y + 8, {
      width: COL.unitPrice - COL.qty - 10,
      align: 'right',
    });
    doc.text(formatCurrency(item.unit_price), COL.unitPrice + 5, y + 8, {
      width: COL.total - COL.unitPrice - 10,
      align: 'right',
    });
    doc.fillColor(INK).font('Helvetica-Bold');
    doc.text(formatCurrency(item.line_total), COL.total + 5, y + 8, {
      width: TABLE_RIGHT - COL.total - 10,
      align: 'right',
    });

    y += rowHeight;
  });

  // Thin separator, then the total row sits below the table rather than
  // inside it — reads more like an invoice total than another line item.
  doc
    .moveTo(TABLE_LEFT, y)
    .lineTo(TABLE_RIGHT, y)
    .lineWidth(1)
    .strokeColor('#E5E7EB')
    .stroke();
  y += 14;

  const totalAmountWidth = 150;
  const totalAmountX = TABLE_RIGHT - totalAmountWidth;
  const totalLabelWidth = 100;
  const totalLabelX = totalAmountX - totalLabelWidth - 10;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(INK);
  doc.text('TOTAL', totalLabelX, y, {
    width: totalLabelWidth,
    align: 'right',
    characterSpacing: 0.5,
  });
  doc.fillColor(brandColor).fontSize(14);
  doc.text(formatCurrency(quote.total), totalAmountX, y - 2, {
    width: totalAmountWidth,
    align: 'right',
  });
  y += 30;

  doc.x = PAGE_MARGIN;
  doc.y = y + 20;

  // Terms & conditions.
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Terms & Conditions', PAGE_MARGIN, doc.y);
  doc.moveDown(0.3);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text(client.quote_terms || DEFAULT_TERMS, PAGE_MARGIN, doc.y, { width: TABLE_RIGHT - PAGE_MARGIN });

  drawFooter(doc, brandColor, client.name);

  doc.end();
  return done;
}

module.exports = { generateQuotePdf, formatCurrency, formatDate, DEFAULT_TERMS };
