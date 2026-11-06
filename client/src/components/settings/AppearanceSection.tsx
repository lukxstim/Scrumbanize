import { useId, useRef, useState, type ReactNode } from 'react';
import { useAppearance } from '../../hooks/useAppearance';
import { backgroundFromFile, PALETTES, PRESET_BACKGROUNDS, type BackgroundChoice } from '../../utils/appearance';
import { CheckIcon } from '../icons';
import Button from '../ui/Button';
import Section from '../ui/Section';
import { labelClass } from '../ui/styles';

const sameChoice = (a: BackgroundChoice, b: BackgroundChoice) =>
  a.kind === b.kind && (a.kind !== 'preset' || (b.kind === 'preset' && a.id === b.id));

/** "Darstellung" in the settings (US-30): a color theme and a background, for this browser. */
export default function AppearanceSection() {
  const { appearance, setAppearance, customImage, setCustomImage, removeCustomImage } = useAppearance();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const choose = (background: BackgroundChoice) => setAppearance({ ...appearance, background });

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      setCustomImage(await backgroundFromFile(file));
    } catch (failure) {
      const reason = failure instanceof Error ? failure.message : '';
      setError(
        reason === 'not_an_image'
          ? 'Das ist kein Bild. Möglich sind z. B. JPG, PNG oder WebP.'
          : reason === 'too_large'
            ? 'Das Bild ist auch verkleinert zu groß. Versuche ein anderes.'
            : 'Das Bild konnte nicht gespeichert werden (der Speicher des Browsers ist vielleicht voll).',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Darstellung" description="Farbthema und Hintergrund. Gilt in diesem Browser, zusammen mit Hell oder Dunkel oben rechts.">
      <fieldset>
        <legend className={`mb-2 ${labelClass}`}>Farbthema</legend>
        <div className="flex flex-wrap gap-2">
          {PALETTES.map((palette) => {
            const active = appearance.palette === palette.id;
            return (
              <label
                key={palette.id}
                className={`relative flex cursor-pointer items-center gap-2 rounded-full py-1 pr-3 pl-1.5 text-sm ring-1 ring-inset transition-colors has-focus-visible:outline-2 has-focus-visible:outline-accent ${
                  active ? 'bg-accent-muted font-medium text-accent-text ring-accent-line' : 'text-fg-muted ring-line hover:bg-surface-hover'
                }`}
              >
                <input
                  type="radio"
                  name="palette"
                  className="sr-only"
                  checked={active}
                  onChange={() => setAppearance({ ...appearance, palette: palette.id })}
                />
                <span aria-hidden="true" className={`grid size-5 place-items-center rounded-full text-white ${palette.swatch}`}>
                  {active && <CheckIcon className="size-3" />}
                </span>
                {palette.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className={`mb-2 ${labelClass}`}>Hintergrund</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
          <BackgroundTile label="Keiner" active={appearance.background.kind === 'none'} onSelect={() => choose({ kind: 'none' })}>
            <span className="absolute inset-0 bg-canvas" />
          </BackgroundTile>
          {PRESET_BACKGROUNDS.map((preset) => (
            <BackgroundTile
              key={preset.id}
              label={preset.label}
              active={sameChoice(appearance.background, { kind: 'preset', id: preset.id })}
              onSelect={() => choose({ kind: 'preset', id: preset.id })}
            >
              <span className="absolute inset-0" style={{ background: preset.css }} />
            </BackgroundTile>
          ))}
          <BackgroundTile
            label="Eigenes Bild"
            active={appearance.background.kind === 'custom'}
            onSelect={() => (customImage ? choose({ kind: 'custom' }) : inputRef.current?.click())}
          >
            {customImage ? (
              <span className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${customImage}")` }} />
            ) : (
              <span className="absolute inset-0 grid place-items-center bg-surface-muted text-2xl text-fg-subtle">+</span>
            )}
          </BackgroundTile>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? 'Wird vorbereitet …' : customImage ? 'Anderes Bild hochladen …' : 'Eigenes Bild hochladen …'}
          </Button>
          {customImage && (
            <Button variant="ghost" disabled={busy} onClick={removeCustomImage}>
              Eigenes Bild entfernen
            </Button>
          )}
          <span className="text-xs text-fg-subtle">Wird auf höchstens 1920 Pixel verkleinert und nur in diesem Browser gespeichert.</span>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void upload(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger-text">
            {error}
          </p>
        )}
      </fieldset>
    </Section>
  );
}

function BackgroundTile({ label, active, onSelect, children }: { label: string; active: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <label className="group relative cursor-pointer has-focus-visible:[&>span:first-of-type]:outline-2 has-focus-visible:[&>span:first-of-type]:outline-accent">
      <input type="radio" name="background" className="sr-only" checked={active} onChange={onSelect} />
      <span
        className={`relative block aspect-[4/3] overflow-hidden rounded-lg ring-inset transition-shadow ${
          active ? 'ring-2 ring-accent' : 'ring-1 ring-line group-hover:ring-line-strong'
        }`}
      >
        {children}
        {active && (
          <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-accent text-accent-fg shadow">
            <CheckIcon className="size-3" />
          </span>
        )}
      </span>
      <span className={`mt-1 block text-center text-xs ${active ? 'font-medium text-fg' : 'text-fg-muted'}`}>{label}</span>
    </label>
  );
}
