import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowRight, CheckCircle2, Clock3, Copy, ExternalLink, FileText, Info, Share, TriangleAlert, Wallet } from 'lucide-react';
import type { LocalPaymentRequest, LocalPaymentRequestDraft } from '../lib/payment-requests';
import { validateLocalPaymentRequest } from '../lib/payment-requests';
import { MUSD_ADDRESS, MEZO_TESTNET_ID, EXPLORER } from '../lib/mezo-config';

type PaymentRequestPageProps = {
  walletAddress?: `0x${string}`;
  connected: boolean;
  onCreateRequest: (draft: LocalPaymentRequestDraft) => LocalPaymentRequest;
  onCopy: (value: string, label: string) => Promise<boolean>;
  requests: LocalPaymentRequest[];
};

function shortAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function validatedRequestLink(request: LocalPaymentRequest) {
  return validateLocalPaymentRequest(request).link;
}

export function PaymentRequestPage({
  walletAddress,
  connected,
  onCreateRequest,
  onCopy,
  requests,
}: PaymentRequestPageProps) {
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [createdRequest, setCreatedRequest] = useState<LocalPaymentRequest>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function clearCreatedRequest() {
    setCreatedRequest(undefined);
    setNotice('');
  }

  function createRequest() {
    setError('');
    setNotice('');
    if (!connected || !walletAddress) {
      setError('Connect a wallet before creating a payment request.');
      return;
    }
    try {
      const request = onCreateRequest({
        recipient: walletAddress,
        ...(amount.trim() ? { amount: amount.trim() } : {}),
        ...(memo.trim() ? { memo: memo.trim() } : {}),
      });
      setCreatedRequest(request);
      setNotice('Request created and saved in this browser. Its payment status is unknown.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The payment request could not be created.');
    }
  }

  async function shareRequest() {
    if (!createdRequest) return;
    let link: string;
    try {
      link = validatedRequestLink(createdRequest);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'The saved request is invalid.');
      return;
    }
    if (typeof navigator.share !== 'function') {
      const copied = await onCopy(link, 'Payment link');
      setNotice(copied ? 'Payment link copied.' : 'Could not copy the payment link.');
      return;
    }
    try {
      await navigator.share({
        title: 'MezoFlow MUSD payment request',
        text: createdRequest.amount
          ? `Requesting ${createdRequest.amount} MUSD on Mezo Testnet`
          : 'MUSD payment request on Mezo Testnet',
        url: link,
      });
      setNotice('Payment request shared.');
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      setNotice('Could not share the payment request.');
    }
  }

  async function copyCreatedLink() {
    if (!createdRequest) return;
    try {
      const copied = await onCopy(validatedRequestLink(createdRequest), 'Payment link');
      setNotice(copied ? 'Payment link copied.' : 'Could not copy the payment link.');
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'The saved request is invalid.');
    }
  }

  return (
    <main className="page-wrap" data-testid="page-payment-request">
      <header className="page-head">
        <div>
          <div className="eyebrow">MUSD · MEZO TESTNET</div>
          <h1>Request MUSD</h1>
          <p className="page-sub">Create a versioned payment link and QR code for the official Testnet token.</p>
        </div>
      </header>

      <div className="two-col">
        <section className="card card-pad">
          <div style={{ marginBottom: 18 }}>
            <h2 style={{ margin: 0, fontSize: 14 }}>Create a payment request</h2>
            <p className="section-caption">No transaction is created or signed by making a request.</p>
          </div>
          {!connected || !walletAddress ? (
            <div className="callout warning"><Wallet size={16} />Connect MetaMask to create a request for your wallet.</div>
          ) : (
            <>
              <div className="info-line">
                <span className="muted">Recipient</span>
                <span className="mono" style={{ fontSize: 10, overflowWrap: 'anywhere', textAlign: 'right' }}>{walletAddress}</span>
              </div>
              <div className="info-line"><span className="muted">Network</span><span>Mezo Testnet · {MEZO_TESTNET_ID}</span></div>
              <div className="info-line"><span className="muted">Token contract</span><span className="mono">{shortAddress(MUSD_ADDRESS)}</span></div>
              <div className="field" style={{ marginTop: 18 }}>
                <label htmlFor="request-musd-amount">Requested amount <span className="muted">(optional)</span></label>
                <div className="input-row">
                  <input
                    id="request-musd-amount"
                    className="input"
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => { setAmount(event.target.value); clearCreatedRequest(); }}
                    placeholder="Any amount"
                    data-testid="input-request-musd-amount"
                  />
                  <span className="input-suffix">MUSD</span>
                </div>
              </div>
              <div className="field">
                <label htmlFor="request-musd-note">Note <span className="muted">(optional)</span></label>
                <textarea
                  id="request-musd-note"
                  className="input"
                  rows={3}
                  maxLength={140}
                  value={memo}
                  onChange={(event) => { setMemo(event.target.value); clearCreatedRequest(); }}
                  placeholder="A note for the person opening this link"
                  data-testid="input-request-musd-note"
                />
                <div className="fine-print" style={{ textAlign: 'right' }}>{memo.length}/140</div>
              </div>
              <div className="callout"><Info size={15} />The note is included in the link only. It is not attached to an on-chain transfer.</div>
              {error && <p className="form-error" role="alert" data-testid="error-create-payment-request">{error}</p>}
              <button
                type="button"
                className="button primary"
                style={{ width: '100%', marginTop: 15 }}
                onClick={createRequest}
                data-testid="button-create-payment-request"
              >
                Create payment request <ArrowRight size={14} />
              </button>
            </>
          )}
        </section>

        <section className="card card-pad" aria-label="Payment request preview">
          <div style={{ marginBottom: 18 }}>
            <h2 style={{ margin: 0, fontSize: 14 }}>Share request</h2>
            <p className="section-caption">The request link specifies its version, network, and MUSD contract.</p>
          </div>
          {createdRequest ? (
            <>
              <div className="receive-qr-wrap" aria-label="QR code containing the versioned MezoFlow payment link">
                <QRCodeSVG value={createdRequest.link} size={184} level="Q" includeMargin />
              </div>
              <div className="receive-qr-caption">
                {createdRequest.amount ? `Requesting ${createdRequest.amount} MUSD` : 'No preset amount'}
                {createdRequest.memo ? ` · ${createdRequest.memo}` : ''}
              </div>
              <label className="field" style={{ marginTop: 16 }}>
                <span>Payment link</span>
                <input className="input mono" value={createdRequest.link} readOnly data-testid="text-created-payment-link" />
              </label>
              <div className="row-actions" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="button primary" onClick={() => void copyCreatedLink()} data-testid="button-copy-created-payment-link">
                  <Copy size={13} />Copy link
                </button>
                <button type="button" className="button secondary" onClick={() => void shareRequest()} data-testid="button-share-created-payment-request">
                  <Share size={13} />Share
                </button>
              </div>
              <div className="callout warning" style={{ marginTop: 16 }} data-testid="status-created-payment-request">
                <CheckCircle2 size={15} />Created locally. Payment status is unknown; this request does not prove that funds arrived.
              </div>
              {notice && <p className="fine-print" role="status" data-testid="status-payment-request-action">{notice}</p>}
            </>
          ) : (
            <div className="empty-state" style={{ minHeight: 260 }}>
              <div>
                <div className="empty-icon"><FileText size={17} /></div>
                <strong>No request to share yet</strong>
                <p>Create a request to show its QR code and shareable link.</p>
              </div>
            </div>
          )}
          <div className="info-line" style={{ marginTop: 18 }}><span className="muted">Network</span><span>Mezo Testnet · {MEZO_TESTNET_ID}</span></div>
          <div className="info-line"><span className="muted">Official MUSD</span><a className="verified-tag mono" href={`${EXPLORER}token/${MUSD_ADDRESS}`} target="_blank" rel="noreferrer">{shortAddress(MUSD_ADDRESS)} <ExternalLink size={11} /></a></div>
        </section>
      </div>
      <p className="page-footnote"><TriangleAlert size={14} />The sender must review the recipient, amount, network, and token, then approve the transfer in their connected wallet. Opening a request never signs or submits a transaction.</p>
      <section className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div><h2 style={{ margin: 0, fontSize: 14 }}>Request history</h2><p className="section-caption">Created requests are stored locally in this browser.</p></div>
          <a className="button secondary" href={`${import.meta.env.BASE_URL}requests`} data-testid="link-payment-request-history">View history</a>
        </div>
          <div className="fine-print" style={{ marginTop: 12 }}>Saved locally: {requests.length} {requests.length === 1 ? 'request' : 'requests'}.</div>
      </section>
    </main>
  );
}

export function PaymentRequestHistoryPage({
  requests,
  onCopy,
}: {
  requests: LocalPaymentRequest[];
  onCopy: (value: string, label: string) => Promise<boolean>;
}) {
  async function copyHistoryLink(request: LocalPaymentRequest) {
    try {
      await onCopy(validatedRequestLink(request), 'Payment link');
    } catch {
      // Stored records are revalidated on load; a changed record is not copied.
    }
  }

  return (
    <main className="page-wrap" data-testid="page-payment-request-history">
      <header className="page-head">
        <div>
          <div className="eyebrow">LOCAL UTILITY · REQUESTS</div>
          <h1>Payment request history</h1>
          <p className="page-sub">Requests created in this browser. Payment status is not inferred from an amount or a transaction hash.</p>
        </div>
        <a className="button primary" href={`${import.meta.env.BASE_URL}request`}>Request MUSD</a>
      </header>
      <div className="callout warning" data-testid="notice-payment-status-limits">
        <Clock3 size={15} />Incoming payments cannot be reliably tied to a request on-chain. Status stays unknown unless request-specific evidence becomes available.
      </div>
      {requests.length === 0 ? (
        <section className="card empty-state" style={{ minHeight: 250, marginTop: 16 }} data-testid="state-payment-request-history-empty">
          <div>
            <div className="empty-icon"><FileText size={17} /></div>
            <strong>No payment requests yet</strong>
            <p>Create a request to save its link and local creation time here.</p>
            <a className="button primary" href={`${import.meta.env.BASE_URL}request`}>Create a request</a>
          </div>
        </section>
      ) : (
        <div style={{ display: 'grid', gap: 10, marginTop: 16 }} data-testid="list-payment-requests">
          {requests.map((request) => (
            <article className="card card-pad" key={request.id} data-testid={`card-payment-request-${request.id}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="eyebrow">CREATED LOCALLY · PAYMENT STATUS UNKNOWN</div>
                  <h2 style={{ margin: '8px 0', fontSize: 15 }}>{request.amount ? `${request.amount} MUSD requested` : 'MUSD requested'}</h2>
                  <div className="info-line"><span className="muted">Recipient</span><span className="mono" style={{ overflowWrap: 'anywhere' }}>{request.recipient}</span></div>
                  {request.memo && <div className="info-line"><span className="muted">Note</span><span>{request.memo}</span></div>}
                  <div className="info-line"><span className="muted">Created</span><time dateTime={new Date(request.createdAt).toISOString()}>{new Date(request.createdAt).toLocaleString()}</time></div>
                  <div className="info-line"><span className="muted">Status</span><span>Payment status unknown</span></div>
                </div>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => void copyHistoryLink(request)}
                  data-testid={`button-copy-payment-request-${request.id}`}
                >
                  <Copy size={13} />Copy link
                </button>
              </div>
              <details style={{ marginTop: 12 }}>
                <summary className="fine-print" style={{ cursor: 'pointer' }}>Show saved request link</summary>
                <a className="mono fine-print" style={{ display: 'block', marginTop: 8, overflowWrap: 'anywhere' }} href={request.link} data-testid={`link-saved-payment-request-${request.id}`}>{request.link}</a>
              </details>
            </article>
          ))}
        </div>
      )}
      <p className="page-footnote"><Info size={14} />No payment is marked verified from a matching amount or manually entered transaction. The available transfer history remains in Wallet Activity.</p>
    </main>
  );
}
