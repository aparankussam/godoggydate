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
        <div className="inline-block bg-cream text-brown-mid text-[13px] font-extrabold border-2 border-brown rounded-2xl px-4 py-2 break-words max-w-full shadow-[0_2px_0_rgba(42,31,74,0.18)]">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-0.5 max-w-[80%] ${fromMe ? 'self-end items-end' : 'self-start items-start'}`}>
      <div
        dir="auto"
        className={`border-[1.5px] border-brown px-3.5 py-2 text-[15px] font-extrabold leading-snug whitespace-pre-wrap break-words max-w-full shadow-[0_2px_0_rgba(42,31,74,0.16)] ${
          fromMe
            ? 'bg-note rounded-[15px_15px_4px_15px] rotate-[0.6deg]'
            : 'bg-cream rounded-[15px_15px_15px_4px] -rotate-[0.6deg]'
        } text-brown`}
      >
        {text}
      </div>
      {pending ? (
        <span className="text-xs italic font-bold text-brown-mid px-1" role="status">Sending…</span>
      ) : time && (
        <span className="text-xs font-bold text-brown-mid px-1">{time}</span>
      )}
    </div>
  );
}
