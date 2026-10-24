import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Copy, Pencil, Plus, Send, ShieldCheck, Trash2, UserRound, X } from 'lucide-react';
import type { AddressBookContact, AddressBookContactDraft } from '../lib/address-book';

type AddressBookPageProps = {
  contacts: AddressBookContact[];
  onSave: (draft: AddressBookContactDraft, id?: string) => boolean;
  onDelete: (id: string) => boolean;
  onCopy: (address: string) => Promise<boolean>;
  onSend: (contact: AddressBookContact) => void;
};

type ContactForm = {
  name: string;
  address: string;
  note: string;
};

const emptyForm: ContactForm = { name: '', address: '', note: '' };

function abbreviatedAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export default function AddressBookPage({
  contacts,
  onSave,
  onDelete,
  onCopy,
  onSend,
}: AddressBookPageProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<AddressBookContact | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [saveError, setSaveError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!formOpen) return;
    nameInputRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeForm();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [formOpen]);

  function closeForm() {
    setFormOpen(false);
    setEditingContact(null);
    setForm(emptyForm);
    setSaveError('');
  }

  function openNewForm() {
    setEditingContact(null);
    setForm(emptyForm);
    setSaveError('');
    setFormOpen(true);
  }

  function openEditForm(contact: AddressBookContact) {
    setEditingContact(contact);
    setForm({
      name: contact.name,
      address: contact.address,
      note: contact.note ?? '',
    });
    setSaveError('');
    setFormOpen(true);
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError('');
    const draft: AddressBookContactDraft = {
      name: form.name,
      address: form.address,
      ...(form.note.trim() ? { note: form.note } : {}),
    };

    try {
      if (!onSave(draft, editingContact?.id)) {
        setSaveError('This recipient could not be saved. Check the details and try again.');
        return;
      }
      setStatus(editingContact ? 'Recipient updated in your local address book.' : 'Recipient saved to your local address book.');
      closeForm();
    } catch {
      setSaveError('This recipient could not be saved. Check the details and try again.');
    }
  }

  function confirmDelete(contact: AddressBookContact) {
    try {
      if (!onDelete(contact.id)) {
        setStatus(`Could not remove ${contact.name}. Please try again.`);
        return;
      }
      setDeleteId(null);
      setStatus(`${contact.name} removed from your local address book.`);
    } catch {
      setStatus(`Could not remove ${contact.name}. Please try again.`);
    }
  }

  async function copyAddress(contact: AddressBookContact) {
    const copied = await onCopy(contact.address);
    setStatus(copied ? `Address copied for ${contact.name}.` : `Could not copy ${contact.name}'s address.`);
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleContacts = contacts.filter((contact) =>
    !normalizedQuery ||
    contact.name.toLocaleLowerCase().includes(normalizedQuery) ||
    contact.address.toLocaleLowerCase().includes(normalizedQuery) ||
    contact.note?.toLocaleLowerCase().includes(normalizedQuery),
  );

  return (
    <main className="page-wrap address-book-page">
      <style>{`
        .address-book-page .address-book-intro {
          display:flex; align-items:center; justify-content:space-between; gap:24px;
          padding:22px 24px; margin-bottom:22px;
          background:radial-gradient(ellipse at 100% 0%,rgba(183,247,106,.08),transparent 45%),var(--card);
        }
        .address-book-page .address-book-intro-copy { display:flex; align-items:flex-start; gap:14px; min-width:0; }
        .address-book-page .address-book-mark {
          display:grid; place-items:center; flex:0 0 auto; width:42px; height:42px;
          color:#B7F76A; background:rgba(183,247,106,.08); border:1px solid rgba(183,247,106,.2); border-radius:12px;
        }
        .address-book-page .address-book-mark svg { width:19px; height:19px; }
        .address-book-page .address-book-intro strong { display:block; color:var(--foreground); font-size:13px; font-weight:550; }
        .address-book-page .address-book-intro p { margin:5px 0 0; color:var(--muted-foreground); font-size:11px; line-height:1.6; }
        .address-book-page .address-book-count {
          flex:0 0 auto; padding-left:20px; border-left:1px solid var(--border);
          color:var(--muted-foreground); font:10px var(--app-font-mono); text-align:right; text-transform:uppercase; letter-spacing:.08em;
        }
        .address-book-page .address-book-count strong { display:block; margin-bottom:4px; color:var(--foreground); font:500 22px var(--app-font-mono); letter-spacing:-.06em; }
        .address-book-page .address-book-toolbar { display:flex; align-items:center; justify-content:space-between; gap:14px; margin:0 0 13px; }
        .address-book-page .address-book-toolbar h2 { margin:0; color:var(--foreground); font-size:13px; font-weight:550; }
        .address-book-page .address-book-search { position:relative; width:min(100%,340px); }
        .address-book-page .address-book-search svg { position:absolute; top:50%; left:12px; width:15px; height:15px; color:var(--muted-foreground); transform:translateY(-50%); pointer-events:none; }
        .address-book-page .address-book-search .input { padding-left:36px; }
        .address-book-page .address-book-list { display:grid; gap:10px; }
        .address-book-page .address-book-contact { padding:18px 19px; }
        .address-book-page .address-book-contact-main { display:grid; grid-template-columns:minmax(180px,.72fr) minmax(0,1.28fr) auto; align-items:center; gap:20px; }
        .address-book-page .address-book-person { display:flex; align-items:center; gap:11px; min-width:0; }
        .address-book-page .address-book-avatar {
          display:grid; place-items:center; flex:0 0 auto; width:36px; height:36px; border-radius:11px;
          background:var(--secondary); border:1px solid var(--border); color:var(--primary); font:500 11px var(--app-font-mono);
        }
        .address-book-page .address-book-person-name { display:block; overflow:hidden; color:var(--foreground); font-size:12px; font-weight:550; text-overflow:ellipsis; white-space:nowrap; }
        .address-book-page .address-book-local-tag { display:flex; align-items:center; gap:5px; margin-top:5px; color:var(--muted-foreground); font-size:9px; }
        .address-book-page .address-book-local-tag svg { width:12px; height:12px; color:#97b86f; }
        .address-book-page .address-book-address-block { min-width:0; }
        .address-book-page .address-book-address-label { display:block; margin-bottom:5px; color:var(--muted-foreground); font:9px var(--app-font-mono); letter-spacing:.08em; text-transform:uppercase; }
        .address-book-page .address-book-address-line { display:flex; align-items:center; gap:5px; min-width:0; color:var(--foreground); }
        .address-book-page .address-book-address-value { overflow:hidden; font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
        .address-book-page .address-book-note { margin:7px 0 0; overflow:hidden; color:var(--muted-foreground); font-size:10px; line-height:1.5; text-overflow:ellipsis; white-space:nowrap; }
        .address-book-page .address-book-actions { display:flex; justify-content:flex-end; align-items:center; gap:6px; }
        .address-book-page .address-book-actions .button { padding:8px 10px; font-size:10px; }
        .address-book-page .address-book-icon-button { min-width:32px; min-height:32px; padding:7px; }
        .address-book-page .address-book-delete-confirm { display:flex; align-items:center; justify-content:space-between; gap:14px; margin-top:14px; padding-top:13px; border-top:1px solid var(--border); color:var(--muted-foreground); font-size:10px; }
        .address-book-page .address-book-delete-confirm-actions { display:flex; gap:7px; }
        .address-book-page .address-book-empty { min-height:235px; }
        .address-book-page .address-book-empty .button { margin-top:14px; }
        .address-book-page .address-book-footnote { display:flex; align-items:flex-start; gap:8px; margin-top:14px; color:var(--muted-foreground); font-size:10px; line-height:1.6; }
        .address-book-page .address-book-footnote svg { flex:0 0 auto; width:14px; height:14px; margin-top:1px; }
        .address-book-page .address-book-modal { max-height:min(90dvh,760px); overflow-y:auto; }
        .address-book-page .address-book-modal-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:18px; }
        .address-book-page .address-book-modal-heading h2 { margin:0; color:var(--foreground); font-size:19px; font-weight:550; letter-spacing:-.035em; }
        .address-book-page .address-book-modal-heading p { margin:6px 0 0; color:var(--muted-foreground); font-size:11px; line-height:1.6; }
        .address-book-page .address-book-modal .input { color:var(--foreground); }
        .address-book-page .address-book-form-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:21px; }
        .address-book-page .address-book-char-count { margin-top:-10px; color:var(--muted-foreground); font:9px var(--app-font-mono); text-align:right; }
        .address-book-page .address-book-status { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; }
        @media (max-width:760px) {
          .address-book-page .address-book-intro { align-items:flex-start; padding:17px; }
          .address-book-page .address-book-count { padding-left:12px; }
          .address-book-page .address-book-toolbar { align-items:stretch; flex-direction:column; }
          .address-book-page .address-book-search { width:100%; }
          .address-book-page .address-book-contact-main { grid-template-columns:minmax(0,1fr); gap:14px; }
          .address-book-page .address-book-actions { justify-content:flex-start; flex-wrap:wrap; }
          .address-book-page .address-book-delete-confirm { align-items:flex-start; flex-direction:column; }
        }
      `}</style>

      <header className="page-head">
        <div>
          <div className="eyebrow">LOCAL UTILITY · RECIPIENTS</div>
          <h1>Address book</h1>
          <p className="page-sub">Keep trusted wallet addresses close at hand. These saved details stay in your local address book, separate from on-chain activity.</p>
        </div>
        <button className="button primary" type="button" onClick={openNewForm} data-testid="button-add-recipient">
          <Plus aria-hidden="true" /> Add recipient
        </button>
      </header>

      <section className="card address-book-intro" aria-label="Address book details" data-testid="panel-address-book-local">
        <div className="address-book-intro-copy">
          <div className="address-book-mark" aria-hidden="true"><UserRound /></div>
          <div>
            <strong>Your list. Your control.</strong>
            <p>Names and notes are labels for your own use. Saving a recipient does not create a transaction or verify a wallet.</p>
          </div>
        </div>
        <div className="address-book-count" data-testid="text-recipient-count">
          <strong>{contacts.length}</strong>
          {contacts.length === 1 ? 'saved recipient' : 'saved recipients'}
        </div>
      </section>

      <div className="address-book-toolbar">
        <h2>Saved recipients</h2>
        {contacts.length > 0 && (
          <label className="address-book-search">
            <span className="sr-only">Search saved recipients</span>
            <UserRound aria-hidden="true" />
            <input
              className="input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, address or note"
              data-testid="input-search-recipients"
            />
          </label>
        )}
      </div>

      {contacts.length === 0 ? (
        <section className="card empty-state address-book-empty" data-testid="state-address-book-empty">
          <div>
            <div className="empty-icon" aria-hidden="true"><UserRound size={17} /></div>
            <strong>No saved recipients yet</strong>
            <p>Add a wallet address to make your next MUSD payment easier to prepare. Your address book is local-only.</p>
            <button className="button primary" type="button" onClick={openNewForm} data-testid="button-add-first-recipient">
              <Plus aria-hidden="true" /> Add a recipient
            </button>
          </div>
        </section>
      ) : visibleContacts.length === 0 ? (
        <section className="card empty-state address-book-empty" data-testid="state-recipients-no-results">
          <div>
            <div className="empty-icon" aria-hidden="true"><UserRound size={17} /></div>
            <strong>No matches found</strong>
            <p>Try another name, address or note.</p>
            <button className="button" type="button" onClick={() => setQuery('')} data-testid="button-clear-recipient-search">Clear search</button>
          </div>
        </section>
      ) : (
        <div className="address-book-list" aria-label="Saved recipients" data-testid="list-saved-recipients">
          {visibleContacts.map((contact) => (
            <article className="card address-book-contact" key={contact.id} data-testid={`card-recipient-${contact.id}`}>
              <div className="address-book-contact-main">
                <div className="address-book-person">
                  <div className="address-book-avatar" aria-hidden="true">{contact.name.trim().slice(0, 2).toUpperCase()}</div>
                  <div style={{ minWidth: 0 }}>
                    <strong className="address-book-person-name" data-testid={`text-recipient-name-${contact.id}`}>{contact.name}</strong>
                    <span className="address-book-local-tag"><ShieldCheck aria-hidden="true" /> Saved locally</span>
                  </div>
                </div>
                <div className="address-book-address-block">
                  <span className="address-book-address-label">EVM address</span>
                  <div className="address-book-address-line">
                    <span className="mono address-book-address-value" title={contact.address} data-testid={`text-recipient-address-${contact.id}`}>{abbreviatedAddress(contact.address)}</span>
                    <button
                      className="copy-button"
                      type="button"
                      aria-label={`Copy ${contact.name}'s wallet address`}
                      title="Copy address"
                      onClick={() => void copyAddress(contact)}
                      data-testid={`button-copy-recipient-${contact.id}`}
                    >
                      <Copy aria-hidden="true" />
                    </button>
                  </div>
                  {contact.note && <p className="address-book-note" title={contact.note} data-testid={`text-recipient-note-${contact.id}`}>{contact.note}</p>}
                </div>
                <div className="address-book-actions">
                  <button className="button primary" type="button" onClick={() => onSend(contact)} data-testid={`button-send-to-recipient-${contact.id}`}>
                    <Send aria-hidden="true" /> Select for send
                  </button>
                  <button className="button address-book-icon-button" type="button" onClick={() => openEditForm(contact)} aria-label={`Edit ${contact.name}`} title="Edit recipient" data-testid={`button-edit-recipient-${contact.id}`}>
                    <Pencil aria-hidden="true" />
                  </button>
                  <button className="button danger address-book-icon-button" type="button" onClick={() => setDeleteId(deleteId === contact.id ? null : contact.id)} aria-label={`Remove ${contact.name}`} title="Remove recipient" data-testid={`button-delete-recipient-${contact.id}`}>
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              </div>
              {deleteId === contact.id && (
                <div className="address-book-delete-confirm" data-testid={`confirm-delete-recipient-${contact.id}`}>
                  <span>Remove <strong>{contact.name}</strong> from this local address book?</span>
                  <div className="address-book-delete-confirm-actions">
                    <button className="button" type="button" onClick={() => setDeleteId(null)} data-testid={`button-cancel-delete-recipient-${contact.id}`}>Keep recipient</button>
                    <button className="button danger" type="button" onClick={() => confirmDelete(contact)} data-testid={`button-confirm-delete-recipient-${contact.id}`}>Remove</button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <p className="address-book-footnote" data-testid="text-address-book-scope">
        <ShieldCheck aria-hidden="true" />
        <span>Address book entries are local labels, not on-chain records. Always review the destination address before confirming a wallet transaction.</span>
      </p>
      <div className="address-book-status" role="status" aria-live="polite" data-testid="status-address-book">{status}</div>

      {formOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }} data-testid="dialog-recipient-form-backdrop">
          <section className="card modal address-book-modal" role="dialog" aria-modal="true" aria-labelledby="address-book-form-title" data-testid="dialog-recipient-form">
            <div className="address-book-modal-heading">
              <div>
                <div className="eyebrow">{editingContact ? 'UPDATE LOCAL ENTRY' : 'NEW LOCAL ENTRY'}</div>
                <h2 id="address-book-form-title">{editingContact ? 'Edit recipient' : 'Add recipient'}</h2>
                <p>Saved to your local address book only. This will not send MUSD or write to the network.</p>
              </div>
              <button className="button address-book-icon-button" type="button" onClick={closeForm} aria-label="Close recipient form" data-testid="button-close-recipient-form"><X aria-hidden="true" /></button>
            </div>
            <form onSubmit={submitForm}>
              <div className="field">
                <label htmlFor="recipient-name">Name</label>
                <input
                  ref={nameInputRef}
                  id="recipient-name"
                  className="input"
                  type="text"
                  required
                  maxLength={48}
                  autoComplete="off"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="e.g. Treasury wallet"
                  data-testid="input-recipient-name"
                />
              </div>
              <div className="field">
                <label htmlFor="recipient-address">EVM wallet address</label>
                <input
                  id="recipient-address"
                  className="input mono"
                  type="text"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  value={form.address}
                  onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                  placeholder="0x…"
                  aria-describedby="recipient-address-help"
                  data-testid="input-recipient-address"
                />
                <span id="recipient-address-help" className="fine-print">Check the full address before selecting it for a payment.</span>
              </div>
              <div className="field">
                <label htmlFor="recipient-note">Note <span className="muted">(optional)</span></label>
                <textarea
                  id="recipient-note"
                  className="input"
                  rows={3}
                  maxLength={160}
                  value={form.note}
                  onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                  placeholder="A reminder for your own reference"
                  data-testid="input-recipient-note"
                />
                <div className="address-book-char-count" aria-live="polite" data-testid="text-recipient-note-count">{form.note.length}/160</div>
              </div>
              {saveError && <p className="form-error" role="alert" data-testid="error-recipient-save">{saveError}</p>}
              <div className="address-book-form-actions">
                <button className="button" type="button" onClick={closeForm} data-testid="button-cancel-recipient-form">Cancel</button>
                <button className="button primary" type="submit" data-testid="button-save-recipient">{editingContact ? 'Save changes' : 'Save recipient'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
