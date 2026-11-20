'use client';
// web/components/ChatBubble.tsx
// Renders a single chat message bubble.

interface Props {
  text: string;
  fromMe: boolean;
  isSystem?: boolean;
  /** Display timestamp e.g. "2:34 PM" */
  time?: string;
  /** Written locally, not yet acknowledged by the server (e.g. sent offline). */
  pending?: boolean;
}

export default function ChatBubble({ text, fromMe, isSystem, time, pending }: Props) {
  if (isSystem) {
    return (
      <div className="self-center max-w-[90%] text-center">
        <div className="inline-block bg-cream-dark text-brown-mid text-xs border border-border rounded-2xl px-4 py-2 break-words max-w-full">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-0.5 max-w-[80%] ${fromMe ? 'self-end items-end' : 'self-start items-start'}`}>
      <div
        className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words max-w-full ${
          fromMe
            ? 'bg-primary text-white rounded-br-sm'
            : 'bg-white text-brown shadow-sm rounded-bl-sm'
        }`}
      >
        {text}
      </div>
      {pending ? (
        <span className="text-[10px] italic text-brown-light px-1" role="status">Sending…</span>
      ) : time && (
        <span className="text-[10px] text-brown-light px-1">{time}</span>
      )}
    </div>
  );
}
