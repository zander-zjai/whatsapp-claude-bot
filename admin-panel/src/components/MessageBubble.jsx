import { useEffect, useState } from 'react';
import { formatDateTime } from '../utils/format';
import { getClientAttachmentBlob } from '../api/clientPortalEndpoints';

// Bold + highlight Rand amounts (e.g. "R5,400.00") so prices jump out when
// scanning a long quote conversation.
const AMOUNT_REGEX = /(R\s?[\d,]+(?:\.\d{2})?)/g;

function highlightAmounts(text) {
  const parts = String(text || '').split(AMOUNT_REGEX);
  return parts.map((part, i) =>
    AMOUNT_REGEX.test(part) ? (
      <strong key={i} className="text-green-400">
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function AttachmentPreview({ attachmentId }) {
  const [url, setUrl] = useState(null);
  const [isImage, setIsImage] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl;
    getClientAttachmentBlob(attachmentId)
      .then((blob) => {
        setIsImage((blob.type || '').startsWith('image/'));
        objectUrl = window.URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setError(true));
    return () => {
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId]);

  if (error) return <p className="text-xs text-red-400">Failed to load attachment.</p>;
  if (!url) return <div className="h-32 w-32 animate-pulse rounded-lg bg-panel-2" />;

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img src={url} alt="Attachment" className="h-32 w-32 rounded-lg border border-line object-cover hover:opacity-80" />
      </a>
    );
  }

  return (
    <a href={url} download className="text-xs text-primary underline">
      Download attachment
    </a>
  );
}

export default function MessageBubble({ msg }) {
  const isFailed = msg.status === 'failed';

  return (
    <div className="space-y-1">
      {msg.customer_message && (
        <div className="flex justify-start">
          <div className="max-w-[75%] rounded-2xl rounded-bl-sm bg-panel-2 px-4 py-2 text-sm text-cream">
            {msg.attachment_id && (
              <div className="mb-2">
                <AttachmentPreview attachmentId={msg.attachment_id} />
              </div>
            )}
            <p className="whitespace-pre-wrap">{highlightAmounts(msg.customer_message)}</p>
            <p className="mt-1 text-[11px] text-grey">{formatDateTime(msg.timestamp)}</p>
          </div>
        </div>
      )}

      {msg.bot_reply && (
        <div className="flex justify-end">
          <div
            className={`max-w-[75%] rounded-2xl rounded-br-sm px-4 py-2 text-sm ${
              isFailed ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-primary/10 text-cream'
            }`}
          >
            <p className="whitespace-pre-wrap">{highlightAmounts(msg.bot_reply)}</p>
            <div className="mt-1 flex items-center justify-end gap-2">
              {isFailed && (
                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                  failed
                </span>
              )}
              {msg.status === 'handover' && (
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                  handover
                </span>
              )}
              <p className="text-[11px] text-grey">{formatDateTime(msg.timestamp)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
