export type QrExportTemplateId = "bimpay-accepted" | "bimpay-donations" | "bimpay-fixed" | "bimpay-landscape" | "bimpay-landscape-donations" | "bimpay-landscape-fixed" | "bimpay-merchant" | "bimpay-landscape-merchant";
export type QrOutputSize = "original" | "a5" | "a4";
export const QR_OUTPUT_SIZES = {
  original: { label: "Original - 1134 x 1701 px", width: 1134, height: 1701 },
  a5: { label: "A5 print - 1748 x 2480 px", width: 1748, height: 2480 },
  a4: { label: "A4 print - 2480 x 3508 px", width: 2480, height: 3508 },
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load QR image."));
    image.crossOrigin = "anonymous";
    image.src = src;
  });
}

export function templateDimensions(templateId: QrExportTemplateId) {
  return templateId.startsWith("bimpay-landscape") ? { width: 1701, height: 1134 } : { width: 1134, height: 1701 };
}

export function outputDimensions(templateId: QrExportTemplateId, size: QrOutputSize) {
  resolveTemplateUrl(templateId);
  const output = QR_OUTPUT_SIZES[size];
  if (!output) throw new Error(`Unknown output size: ${size}`);
  if (!templateId.startsWith("bimpay-landscape")) return output;
  return {
    width: output.height,
    height: output.width,
    label: `${size === "original" ? "Original landscape" : `${size.toUpperCase()} landscape print`} - ${output.height} x ${output.width} px`,
  };
}

export async function renderPaymentCard({
  templateId,
  qr,
  merchantName,
  donationCause = "",
  fixedDescription = "",
  fixedPrice = "",
  outputSize = "original",
  isDonation = false,
  assetUrls,
}: {
  templateId: QrExportTemplateId;
  qr: string;
  merchantName: string;
  donationCause?: string;
  fixedDescription?: string;
  fixedPrice?: string;
  outputSize?: QrOutputSize;
  assetUrls?: Partial<Record<QrExportTemplateId, string>>;
  isDonation?: boolean;
}): Promise<string> {
  resolveTemplateUrl(templateId, assetUrls);
  const { width, height } = templateDimensions(templateId);
  const output = outputDimensions(templateId, outputSize);
  const landscape = templateId.startsWith("bimpay-landscape");
  const fixedTemplate = templateId.endsWith("fixed");
  const donationTemplate = templateId.endsWith("donations");
  const merchantTemplate = templateId.endsWith("merchant");
  const fixedDonation = isDonation && fixedTemplate;
  const exportFont = landscape ? "Arial" : '"Montserrat Variable"';
  if (merchantTemplate || (!landscape && (fixedTemplate || donationTemplate))) {
    await ensurePaymentCardFont();
  }
  const textCenter = landscape ? 453 : width / 2;
  const textWidth = landscape ? 700 : 780;
  const qrSize = landscape ? 580 : 720;
  const exportScale = Math.min(output.width / width, output.height / height);
  const qrImage = await loadImage(qr);
  const canvas = document.createElement("canvas");
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create export canvas.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate((canvas.width - width * exportScale) / 2, (canvas.height - height * exportScale) / 2);
  context.scale(exportScale, exportScale);

  if (templateId.startsWith("bimpay-")) {
    if (fixedTemplate && !fixedPrice) {
      throw new Error("Generate a fixed-amount QR to preview or export this template.");
    }
    if (fixedTemplate && !fixedDonation && fixedDescription.length > 30) {
      throw new Error(
        "Description must be 30 characters or fewer, including spaces."
      );
    }
    const artwork = await loadImage(resolveTemplateUrl(templateId, assetUrls));
    context.drawImage(artwork, 0, 0, width, height);
    // The artwork uses points; this export renders at four pixels per point.
    context.imageSmoothingEnabled = false;
    if (landscape) {
      context.drawImage(qrImage, 959, 148, qrSize, qrSize);
    } else {
      context.fillStyle = "#ffffff";
      context.fillRect(113, 510, 908, 778);
      context.drawImage(qrImage, 207, 539, qrSize, qrSize);
    }
    if (merchantTemplate) {
      context.save();
      // Blank the artwork's fixed heading so the full text block can be centred.
      context.fillStyle = "#dff2f9";
      if (landscape) context.fillRect(100, 150, 780, 590);
      else context.fillRect(114, 160, 906, 340);
      context.fillStyle = "#0114a8";
      context.textAlign = "center";
      context.textBaseline = "middle";
      const name = merchantName.trim().toUpperCase();
      const maxWidth = landscape ? 700 : 780;
      const centerX = landscape ? 497 : width / 2;
      context.font = '700 80px "Montserrat Variable"';
      let lines = [name];
      if (context.measureText(name).width > maxWidth) {
        const spaces = Array.from(name.matchAll(/\s+/g), (match) => match.index);
        const breaks = spaces.length ? spaces : Array.from({ length: name.length - 1 }, (_, index) => index + 1);
        const widest = (index: number) => Math.max(context.measureText(name.slice(0, index).trim()).width, context.measureText(name.slice(index).trim()).width);
        const split = breaks.reduce((best, index) => widest(index) < widest(best) ? index : best, breaks[0]);
        lines = [name.slice(0, split).trim(), name.slice(split).trim()];
      }
      const widestLine = Math.max(maxWidth, ...lines.map((line) => context.measureText(line).width));
      context.font = `700 ${80 * maxWidth / widestLine}px "Montserrat Variable"`;
      const subtitleLines = landscape ? ["ACCEPTS QR", "PAYMENTS"] : ["ACCEPTS QR PAYMENTS"];
      const subtitleSize = landscape ? 56 : 52;
      const nameHeight = lines.length * 96 - 16;
      const subtitleHeight = subtitleLines.length * (subtitleSize + 12) - 12;
      const gap = 32;
      const top = (landscape ? 438 : 312) - (nameHeight + gap + subtitleHeight) / 2;
      lines.forEach((line, index) => context.fillText(line, centerX, top + 40 + index * 96));
      context.font = `700 ${subtitleSize}px "Montserrat Variable"`;
      subtitleLines.forEach((line, index) => context.fillText(line, centerX, top + nameHeight + gap + subtitleSize / 2 + index * (subtitleSize + 12)));
      context.restore();
    }
    if (fixedTemplate) {
      context.save();
    
      context.fillStyle = "#0114a8";
      context.textAlign = "center";
      context.textBaseline = "middle";
    
      if (fixedDonation) {
        const heading = `GIVE ${fixedPrice}`;
        const entity = (donationCause.trim() || merchantName.trim()).toUpperCase();
      
        const centerY = landscape ? 438 : 312;
        const maxWidth = textWidth;
      
        // Split organisation name into two lines if necessary
        context.font = `700 56px ${exportFont}`;
      
        let entityLines = [entity];
      
        if (context.measureText(entity).width > maxWidth) {
          const words = entity.split(/\s+/);
      
          if (words.length > 1) {
            // Find the most balanced two-line split
            let bestSplit = 1;
            let smallestWidth = Infinity;
      
            for (let i = 1; i < words.length; i++) {
              const first = words.slice(0, i).join(" ");
              const second = words.slice(i).join(" ");
      
              const widest = Math.max(
                context.measureText(first).width,
                context.measureText(second).width
              );
      
              if (widest < smallestWidth) {
                smallestWidth = widest;
                bestSplit = i;
              }
            }
      
            entityLines = [
              words.slice(0, bestSplit).join(" "),
              words.slice(bestSplit).join(" ")
            ];
          }
        }
      
        // Centre the entire block vertically
        const lineSpacing = 75;
        const totalLines = 2 + entityLines.length;
        const startY = centerY - ((totalLines - 1) * lineSpacing) / 2;
      
        context.textAlign = "center";
        context.textBaseline = "middle";
      
        // Line 1: Donation amount
        context.font = `700 64px ${exportFont}`;
        context.fillText(
          heading,
          textCenter,
          startY,
          maxWidth
        );
      
        // Line 2: TO
        context.font = `700 48px ${exportFont}`;
        context.fillText(
          "TO",
          textCenter,
          startY + lineSpacing,
          maxWidth
        );
      
        // Lines 3–4: Organisation name
        context.font = `700 56px ${exportFont}`;
      
        entityLines.forEach((line, index) => {
          context.fillText(
            line,
            textCenter,
            startY + (2 + index) * lineSpacing,
            maxWidth
          );
        });
      } else {
        context.font = `700 56px ${exportFont}`;
        const description = fixedDescription.trim().toUpperCase();
        let lines = description ? [description] : [];
        if (context.measureText(description).width > textWidth) {
          const breaks = Array.from(description.matchAll(/\s+/g), (match) => match.index);
          const candidates = breaks.length ? breaks : Array.from({ length: description.length - 1 }, (_, index) => index + 1);
          const split = candidates.reduce((best, index) => {
            const widest = (position: number) => Math.max(
              context.measureText(description.slice(0, position).trim()).width,
              context.measureText(description.slice(position).trim()).width
            );
            return widest(index) < widest(best) ? index : best;
          }, candidates[0]);
          lines = [description.slice(0, split).trim(), description.slice(split).trim()];
        }
        const widestLine = Math.max(textWidth, ...lines.map((line) => context.measureText(line).width));
        context.font = `700 ${56 * textWidth / widestLine}px ${exportFont}`;
        // Centre the entire description/price block within the artwork's header.
        const descriptionHeight = lines.length ? lines.length * 68 - 12 : 0;
        const gap = lines.length ? 40 : 0;
        const top = (landscape ? 438 : 312) - (64 + 20 + descriptionHeight + gap + 80) / 2;
        context.font = `700 64px ${exportFont}`;
        context.fillText(merchantName.trim().toUpperCase(), textCenter, top + 32, textWidth);
        context.font = `700 ${56 * textWidth / widestLine}px ${exportFont}`;
        lines.forEach((line, index) => context.fillText(line, textCenter, top + 84 + 28 + index * 68));
        context.font = `700 80px ${exportFont}`;
        context.fillText(fixedPrice, textCenter, top + 84 + descriptionHeight + gap + 40, textWidth);
      }
    
      context.restore();
    }
    if (donationTemplate) {
      const cause = donationCause.trim().slice(0, 30).toUpperCase();
      context.fillStyle = "#0114a8";
      context.textAlign = "center";
      context.font = `700 80px ${exportFont}`;
      const words = cause.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let line = "";
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (line && context.measureText(next).width > textWidth) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      if (line) lines.push(line);
      const visibleLines = lines.length > 2 ? [lines[0], lines.slice(1).join(" ")] : lines;
      visibleLines.forEach((text, index) => {
        const fontSize = Math.min(80, 80 * textWidth / Math.max(textWidth, context.measureText(text).width));
        context.save();
        context.font = `700 ${fontSize}px ${exportFont}`;
        context.fillText(text, textCenter, (landscape ? 126 : 0) + (visibleLines.length === 1 ? 386 : 344 + index * 96));
        context.restore();
      });
    }
    return canvas.toDataURL("image/png");
  }

  throw new Error("Unknown export template.");
}


export type PaymentCardInput = Parameters<typeof renderPaymentCard>[0];
export function resolveTemplateUrl(id: QrExportTemplateId, overrides?: Partial<Record<QrExportTemplateId, string>>): string {
  if (!(id in TEMPLATE_URLS)) throw new Error(`Unknown payment card template: ${id}`);
  return overrides?.[id] ?? TEMPLATE_URLS[id];
}
const TEMPLATE_URLS = {
  "bimpay-accepted": new URL("../assets/bimpay-accepted.svg", import.meta.url).href,
  "bimpay-donations": new URL("../assets/bimpay-donations.svg", import.meta.url).href,
  "bimpay-fixed": new URL("../assets/bimpay-fixed.svg", import.meta.url).href,
  "bimpay-landscape-donations": new URL("../assets/bimpay-landscape-donations.svg", import.meta.url).href,
  "bimpay-landscape-fixed": new URL("../assets/bimpay-landscape-fixed.svg", import.meta.url).href,
  "bimpay-landscape-merchant": new URL("../assets/bimpay-landscape-merchant.svg", import.meta.url).href,
  "bimpay-landscape": new URL("../assets/bimpay-landscape.svg", import.meta.url).href,
  "bimpay-merchant": new URL("../assets/bimpay-merchant.svg", import.meta.url).href,
};
let fontReady: Promise<void> | undefined;
async function ensurePaymentCardFont(): Promise<void> {
  if (!fontReady) fontReady = (async () => {
    await Promise.all([
    { url: new URL("../assets/montserrat-cyrillic-ext-wght-normal.woff2", import.meta.url).href, unicodeRange: "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F" },
    { url: new URL("../assets/montserrat-cyrillic-wght-normal.woff2", import.meta.url).href, unicodeRange: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116" },
    { url: new URL("../assets/montserrat-vietnamese-wght-normal.woff2", import.meta.url).href, unicodeRange: "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB" },
    { url: new URL("../assets/montserrat-latin-ext-wght-normal.woff2", import.meta.url).href, unicodeRange: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" },
    { url: new URL("../assets/montserrat-latin-wght-normal.woff2", import.meta.url).href, unicodeRange: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" },
    ].map(async ({ url, unicodeRange }) => {
      const font = new FontFace("Montserrat Variable", `url(${url})`, { weight: "100 900", unicodeRange });
      await font.load();
      document.fonts.add(font);
    }));
  })().catch(error => { fontReady = undefined; throw error; });
  await fontReady;
}
export function paymentCardPdfDimensions(templateId: QrExportTemplateId, size: QrOutputSize = "original") {
  outputDimensions(templateId, size);
  if (size === "original") {
    const { width, height } = templateDimensions(templateId);
    return { width: width / 4, height: height / 4 };
  }
  const [short, long] = size === "a4" ? [210, 297] : [148, 210];
  const landscape = templateId.startsWith("bimpay-landscape");
  return { width: (landscape ? long : short) * 72 / 25.4, height: (landscape ? short : long) * 72 / 25.4 };
}
export async function exportPaymentCardPdf(image: string, options: { templateId: QrExportTemplateId; size?: QrOutputSize; title?: string; creator?: string }): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const { width, height } = paymentCardPdfDimensions(options.templateId, options.size);
  const page = pdf.addPage([width, height]);
  const artwork = await pdf.embedPng(image);
  page.drawImage(artwork, { x: 0, y: 0, width, height });
  if (options.title) pdf.setTitle(options.title);
  pdf.setCreator(options.creator ?? "bimpay-payment-cards");
  return pdf.save();
}
