import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';

/**
 * Snapshot every `.page` inside the on-screen Cut Sheet preview and
 * assemble them into a multi-page A4 PDF, preserving exactly what the
 * user sees. We bypass the browser print dialog entirely — the print
 * pipeline applies @media print rules and "Background graphics" toggles
 * that have caused subtle inconsistencies (missing tiles, clipping, etc.).
 *
 * Each page is rasterized to a canvas at a high DPR for crisp marble
 * texture, then placed as a single image on its own A4 page in the PDF.
 */
export async function exportCutSheetPdfFromDOM(): Promise<void> {
  const sheetEl = document.querySelector<HTMLElement>(
    '[class*="cutSheetOnScreen"]'
  );
  if (!sheetEl) {
    throw new Error(
      'Cut Mode is not visible. Toggle Cut Mode on, then export.'
    );
  }
  const pageEls = Array.from(
    sheetEl.querySelectorAll<HTMLElement>(':scope > div, :scope > section')
  ).filter((el) => /(^|\s|_)page(\s|$|_)/.test(el.className));

  if (pageEls.length === 0) {
    throw new Error('No pages found inside the Cut Mode preview.');
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pageW = pdf.internal.pageSize.getWidth(); // 210
  const pageH = pdf.internal.pageSize.getHeight(); // 297

  for (let i = 0; i < pageEls.length; i++) {
    const el = pageEls[i];
    // Render at 2x device pixel ratio for crisp tile patterns + small text.
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    // JPEG at 0.85 instead of PNG. Marble patterns are photographic and
    // compress losslessly very poorly — a typical PNG cut sheet was
    // ~10 MB per page (= ~230 MB for a 23-page export). JPEG at this
    // quality is visually indistinguishable for these images and ~10x
    // smaller. addImage's last "FAST" arg further reduces overhead.
    const imgData = canvas.toDataURL('image/jpeg', 0.85);
    const imgWmm = pageW;
    const imgHmm = (canvas.height / canvas.width) * imgWmm;

    if (i > 0) pdf.addPage();
    pdf.addImage(
      imgData,
      'JPEG',
      0,
      0,
      imgWmm,
      Math.min(imgHmm, pageH),
      undefined,
      'FAST'
    );
  }

  pdf.save('cut-sheet.pdf');
}
