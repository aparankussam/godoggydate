'use client';
// web/components/ChatBubble.tsx
// Renders a single chat message bubble.

interface Props {
  text: string;
  fromMe: boolean;
  isSystem?: boolean;
  /** Display timestamp e.g. "2:34 PM" */
  time?: string;
}

export default function ChatBubble({ text, fromMe, isSystem, time }: Props) {
  if (isSystem) {
    return (
      <div className="self-center max-w-[90%] text-center">
        <div className="inline-block bg-cream-dark text-brown-mid text-xs border border-border rounded-2xl px-4 py-2">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-0.5 max-w-[80%] ${fromMe ? 'self-end items-end' : 'self-start items-start'}`}>
      <div
        className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          fromMe
            ? 'bg-primary text-white rounded-br-sm'
            : 'bg-white text-brown shadow-sm rounded-bl-sm'
        }`}
      >
        {text}
      </div>
      {time && (
        <span className="text-[10px] text-brown-light px-1">{time}</span>
      )}
    </div>
  );
}
