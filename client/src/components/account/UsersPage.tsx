import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { adminApi, ApiError, type Account, type Invitation } from '../../utils/api';
import { formatDate } from '../../utils/format';
import { Avatar } from '../auth/UserMenu';
import ConfirmDialog from '../ConfirmDialog';
import Menu from '../Menu';
import Button from '../ui/Button';
import BackToProjects from './BackToProjects';
import Dialog from '../ui/Dialog';
import Section from '../ui/Section';
import { fieldClass, iconButtonClass, labelClass } from '../ui/styles';

const ERRORS: Record<string, string> = {
  email_taken: 'Für diese E-Mail-Adresse gibt es schon ein Konto.',
  last_admin: 'Es muss mindestens einen Administrator geben.',
  sole_owner: 'Dieses Konto ist einziger Owner von Projekten. Übergib die Projekte zuerst an jemand anderen.',
  self: 'Das eigene Konto lässt sich nicht deaktivieren.',
  disabled: 'Das Konto ist deaktiviert.',
};
const errorText = (error: unknown) => (error instanceof ApiError && ERRORS[error.code]) || 'Das hat nicht geklappt. Bitte versuche es erneut.';

/** A link to pass on by hand (there is no email sending): shown once, with a copy button. */
interface ShownLink {
  title: string;
  text: string;
  url: string;
  expiresAt: string;
}

/**
 * /benutzer (US-21c), administrators only: invite people by link, see the accounts, make administrators, reset
 * passwords by link, hand over projects and disable accounts. Project contents stay private to their members; only
 * the names of projects an account alone owns are shown.
 */
export default function UsersPage() {
  const { session } = useAuth();
  const toast = useToast();
  const me = session?.user;
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<ShownLink | null>(null);
  const [handingOver, setHandingOver] = useState<Account | null>(null);
  const [disabling, setDisabling] = useState<Account | null>(null);

  const load = useCallback(async () => {
    try {
      const [users, open] = await Promise.all([adminApi.users(), adminApi.invitations()]);
      setAccounts(users);
      setInvitations(open);
    } catch {
      setError('Die Konten konnten nicht geladen werden.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (session?.mode !== 'required' || me?.systemRole !== 'admin') return <Navigate to="/" replace />;

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      if (done) toast({ message: done });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const linkTo = (kind: 'einladung' | 'passwort', token: string) => `${window.location.origin}/${kind}/${token}`;

  async function invite() {
    await run(async () => {
      const created = await adminApi.invite(email.trim());
      setEmail('');
      setLink({
        title: 'Einladungslink',
        text: `Schick diesen Link an ${created.email}. Damit legt die Person ihr Konto selbst an; danach kannst du sie zu Projekten hinzufügen.`,
        url: linkTo('einladung', created.token),
        expiresAt: created.expiresAt,
      });
    });
  }

  async function resetLink(account: Account) {
    await run(async () => {
      const created = await adminApi.resetLink(account.id);
      setLink({
        title: `Neues Passwort für ${account.name}`,
        text: `Schick diesen Link an ${account.name}. Damit legt die Person ein neues Passwort fest und ist danach auf allen Geräten abgemeldet. Ältere Links gelten nicht mehr.`,
        url: linkTo('passwort', created.token),
        expiresAt: created.expiresAt,
      });
    });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <div>
          <BackToProjects />
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-fg">Benutzerverwaltung</h1>
          <p className="mt-1 text-sm text-fg-subtle">Wer Scrumbanize auf diesem Server benutzen darf. In welchen Projekten jemand mitarbeitet, legen deren Owner fest.</p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-danger-muted px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}

        <Section title="Einladen" description="Ein Einladungslink gilt 7 Tage und einmal. Scrumbanize verschickt keine E-Mails – du gibst den Link selbst weiter.">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void invite();
            }}
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-Mail-Adresse"
              aria-label="E-Mail-Adresse der eingeladenen Person"
              className={`min-w-0 flex-1 ${fieldClass}`}
            />
            <Button type="submit" variant="primary" disabled={busy || !email.trim()}>
              Einladungslink erstellen
            </Button>
          </form>
          {invitations.length > 0 && (
            <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
              {invitations.map((invitation) => (
                <li key={invitation.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-fg">{invitation.email}</span>
                  <span className="shrink-0 text-xs text-fg-subtle">offen bis {formatDate(invitation.expiresAt)}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => adminApi.revokeInvitation(invitation.id), 'Einladung zurückgezogen.')}
                    aria-label={`Einladung an ${invitation.email} zurückziehen`}
                    title="Zurückziehen"
                    className={`${iconButtonClass} hover:text-danger-text`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Konten" description="Deaktivierte Konten können sich nicht mehr anmelden; ihr Name bleibt im Verlauf erhalten.">
          <ul className="divide-y divide-line rounded-lg border border-line" aria-busy={accounts === null}>
            {accounts === null && <li className="px-3 py-3 text-sm text-fg-subtle">Lade …</li>}
            {accounts?.map((account) => {
              const self = account.id === me.id;
              return (
                <li key={account.id} className={`flex items-start gap-3 px-3 py-3 ${account.disabled ? 'opacity-60' : ''}`}>
                  <Avatar user={account} className="mt-0.5 size-8 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                      <span className="truncate">{account.name}</span>
                      {self && <span className="font-normal text-fg-subtle">(du)</span>}
                      {account.systemRole === 'admin' && <Badge>Administrator</Badge>}
                      {account.disabled && <Badge>Deaktiviert</Badge>}
                    </p>
                    <p className="truncate text-xs text-fg-subtle">{account.email}</p>
                    {account.soleOwnerOf.length > 0 && (
                      <p className="mt-1 text-xs text-fg-subtle">Einziger Owner von: {account.soleOwnerOf.map((p) => `„${p.name}“`).join(', ')}</p>
                    )}
                  </div>
                  <Menu
                    label={`Konto ${account.name}: Aktionen`}
                    trigger={<span aria-hidden="true">⋯</span>}
                    triggerClassName={`text-base leading-none ${iconButtonClass}`}
                    items={[
                      account.systemRole === 'admin'
                        ? { label: 'Administrator-Rolle entziehen', onSelect: () => void run(() => adminApi.update(account.id, { systemRole: 'user' }), `${account.name} ist kein Administrator mehr.`) }
                        : { label: 'Zum Administrator machen', onSelect: () => void run(() => adminApi.update(account.id, { systemRole: 'admin' }), `${account.name} ist jetzt Administrator.`) },
                      {
                        label: 'Link für neues Passwort …',
                        onSelect: () => void resetLink(account),
                        disabledReason: account.disabled ? 'Das Konto ist deaktiviert' : undefined,
                      },
                      {
                        label: 'Projekte übergeben …',
                        onSelect: () => setHandingOver(account),
                        disabledReason: account.soleOwnerOf.length === 0 ? 'Ist nirgends einziger Owner' : undefined,
                      },
                      account.disabled
                        ? { label: 'Wieder aktivieren', onSelect: () => void run(() => adminApi.update(account.id, { disabled: false }), `${account.name} ist wieder aktiv.`) }
                        : {
                            label: 'Deaktivieren …',
                            danger: true,
                            onSelect: () => setDisabling(account),
                            disabledReason: self
                              ? 'Das eigene Konto lässt sich nicht deaktivieren'
                              : account.soleOwnerOf.length > 0
                                ? 'Erst die Projekte übergeben'
                                : undefined,
                          },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        </Section>
      </div>

      {link && <LinkDialog link={link} onClose={() => setLink(null)} />}
      {handingOver && accounts && (
        <HandOverDialog
          account={handingOver}
          candidates={accounts.filter((a) => a.id !== handingOver.id && !a.disabled)}
          onConfirm={async (to) => {
            setHandingOver(null);
            await run(() => adminApi.handOver(handingOver.id, to.id), `${to.name} ist jetzt Owner der Projekte von ${handingOver.name}.`);
          }}
          onClose={() => setHandingOver(null)}
        />
      )}
      <ConfirmDialog
        open={disabling !== null}
        title={`${disabling?.name ?? ''} deaktivieren?`}
        message="Die Person wird sofort abgemeldet und kann sich nicht mehr anmelden. Ihre Mitgliedschaften und ihr Name im Verlauf bleiben; du kannst das Konto jederzeit wieder aktivieren."
        confirmLabel="Deaktivieren"
        onConfirm={() => {
          const account = disabling;
          setDisabling(null);
          if (account) void run(() => adminApi.update(account.id, { disabled: true }), `${account.name} ist deaktiviert.`);
        }}
        onCancel={() => setDisabling(null)}
      />
    </div>
  );
}

function Badge({ children }: { children: string }) {
  return <span className="rounded bg-surface-muted px-1.5 py-px text-[11px] font-normal text-fg-subtle ring-1 ring-line ring-inset">{children}</span>;
}

function LinkDialog({ link, onClose }: { link: ShownLink; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog onClose={onClose} labelledBy="link-dialog-title" className="max-w-lg p-6" closeOnBackdrop>
      <h2 id="link-dialog-title" className="text-base font-semibold text-fg">
        {link.title}
      </h2>
      <p className="mt-1 text-sm text-fg-subtle">{link.text}</p>
      <div className="mt-4 flex gap-2">
        <input readOnly value={link.url} aria-label="Link" onFocus={(e) => e.target.select()} data-autofocus className={`min-w-0 flex-1 font-mono text-xs ${fieldClass}`} />
        <Button
          variant="primary"
          onClick={() => {
            void navigator.clipboard?.writeText(link.url).then(() => setCopied(true));
          }}
        >
          {copied ? 'Kopiert' : 'Kopieren'}
        </Button>
      </div>
      <p className="mt-2 text-xs text-fg-subtle">Gültig bis {formatDate(link.expiresAt)}. Der Link wird nur jetzt angezeigt.</p>
      <div className="mt-6 flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Fertig
        </Button>
      </div>
    </Dialog>
  );
}

function HandOverDialog({
  account,
  candidates,
  onConfirm,
  onClose,
}: {
  account: Account;
  candidates: Account[];
  onConfirm: (to: Account) => void;
  onClose: () => void;
}) {
  const [toId, setToId] = useState(candidates[0]?.id);
  const to = candidates.find((c) => c.id === toId);
  return (
    <Dialog onClose={onClose} labelledBy="handover-title" className="max-w-md p-6">
      <h2 id="handover-title" className="text-base font-semibold text-fg">
        Projekte von {account.name} übergeben
      </h2>
      <p className="mt-1 text-sm text-fg-subtle">
        Wer soll zusätzlich Owner von {account.soleOwnerOf.map((p) => `„${p.name}“`).join(', ')} werden? {account.name} bleibt Owner, bis das Konto deaktiviert oder aus den Projekten entfernt wird.
      </p>
      {candidates.length === 0 ? (
        <p className="mt-4 text-sm text-fg-subtle">Es gibt kein anderes aktives Konto. Lade zuerst jemanden ein.</p>
      ) : (
        <label className={`mt-4 block ${labelClass}`}>
          Neuer Owner
          <select value={toId} onChange={(e) => setToId(Number(e.target.value))} className={`mt-1 font-normal ${fieldClass}`}>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.email})
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button variant="primary" disabled={!to} onClick={() => to && onConfirm(to)}>
          Übergeben
        </Button>
      </div>
    </Dialog>
  );
}
