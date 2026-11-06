import { describe, expect, it } from 'vitest';
import { dataUriToBlob, diagramName, diagramXmlFromPng, isDiagram, newDiagramName } from './drawio';

/** A PNG with the given chunks (CRCs are not checked by the reader, so zeros do). */
function png(chunks: { type: string; data: Uint8Array }[]): Uint8Array {
  const parts: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (const chunk of [...chunks, { type: 'IEND', data: new Uint8Array() }]) {
    const n = chunk.data.length;
    parts.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
    parts.push(...[...chunk.type].map((c) => c.charCodeAt(0)), ...chunk.data, 0, 0, 0, 0);
  }
  return new Uint8Array(parts);
}
const text = (keyword: string, value: string) => ({ type: 'tEXt', data: new Uint8Array([...`${keyword}\0${value}`].map((c) => c.charCodeAt(0))) });

describe('diagram files (US-32)', () => {
  it('are PNGs named …drawio.png', () => {
    expect(isDiagram({ fileName: 'Ablauf.drawio.png', mimeType: 'image/png' })).toBe(true);
    expect(isDiagram({ fileName: 'Foto.png', mimeType: 'image/png' })).toBe(false);
    expect(diagramName('Ablauf.drawio.png')).toBe('Ablauf');
  });

  it('get a name not used yet', () => {
    expect(newDiagramName([])).toBe('Diagramm');
    expect(newDiagramName(['Diagramm.drawio.png', 'Diagramm 2.drawio.png'])).toBe('Diagramm 3');
  });
});

describe('diagramXmlFromPng', () => {
  const xml = '<mxfile><diagram name="Seite-1">äöü & <x/></diagram></mxfile>';

  it('reads the diagram draw.io put into the picture', () => {
    const bytes = png([{ type: 'IHDR', data: new Uint8Array(13) }, text('Software', 'draw.io'), text('mxfile', encodeURIComponent(xml))]);
    expect(diagramXmlFromPng(bytes)).toBe(xml);
  });

  it('finds nothing in other pictures and in other files', () => {
    expect(diagramXmlFromPng(png([{ type: 'IHDR', data: new Uint8Array(13) }]))).toBeUndefined();
    expect(diagramXmlFromPng(new TextEncoder().encode('<svg/>'))).toBeUndefined();
    // A chunk claiming more bytes than there are.
    expect(diagramXmlFromPng(png([text('mxfile', 'x')]).subarray(0, 20))).toBeUndefined();
  });
});

describe('dataUriToBlob', () => {
  it('turns base64 data into bytes of the given type', async () => {
    const blob = dataUriToBlob('data:image/png;base64,iVBORw0KGgo=');
    expect(blob.type).toBe('image/png');
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});
