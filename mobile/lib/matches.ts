/**
 * Matches + Chat data layer.
 *
 * Mock data makes the UI fully testable immediately.
 * Firestore adapter stubs: fetchMatches(), fetchMessages(), sendMessage().
 */

export interface MatchedDog {
  id: string;
  name: string;
  breed: string;
  photos: string[];
  location?: string;
}

export interface MatchItem {
  id: string;
  dog: MatchedDog;
  lastMessage?: string;
  lastMessageAt?: number;
  unread?: boolean;
}

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt: number;
}

const MOCK_MATCHES: MatchItem[] = [
  {
    id: 'match-daisy',
    dog: {
      id: 'mock-1',
      name: 'Daisy',
      breed: 'Golden Retriever',
      photos: ['https://images.unsplash.com/photo-1552053831-71594a27632d?w=400&auto=format&fit=crop'],
      location: 'Ann Arbor, MI',
    },
    lastMessage: "Daisy would love to meet! 🐾",
    lastMessageAt: Date.now() - 1000 * 60 * 10,
    unread: true,
  },
  {
    id: 'match-biscuit',
    dog: {
      id: 'mock-4',
      name: 'Biscuit',
      breed: 'Pembroke Welsh Corgi',
      photos: ['https://images.unsplash.com/photo-1546527868-ccb7ee7dfa6a?w=400&auto=format&fit=crop'],
      location: 'Birmingham, MI',
    },
    lastMessage: 'He has so much energy for a little pup 😄',
    lastMessageAt: Date.now() - 1000 * 60 * 60 * 2,
    unread: false,
  },
  {
    id: 'match-charlie',
    dog: {
      id: 'mock-6',
      name: 'Charlie',
      breed: 'Labrador Retriever',
      photos: ['https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400&auto=format&fit=crop'],
      location: 'Bloomfield Hills, MI',
    },
    lastMessage: 'Charlie loves the park on weekends!',
    lastMessageAt: Date.now() - 1000 * 60 * 60 * 24,
    unread: false,
  },
];

const MOCK_MESSAGES: Record<string, ChatMessage[]> = {
  'match-daisy': [
    { id: 'm1', text: "Hi! Daisy saw your pup's profile and is very interested 🐾", senderId: 'other', createdAt: Date.now() - 1000 * 60 * 15 },
    { id: 'm2', text: "That's so sweet! What's the best park near you?", senderId: 'me', createdAt: Date.now() - 1000 * 60 * 12 },
    { id: 'm3', text: 'We love Gallup Park — it has a great off-leash area!', senderId: 'other', createdAt: Date.now() - 1000 * 60 * 10 },
  ],
  'match-biscuit': [
    { id: 'm1', text: "Biscuit's ears went up when he saw your dog's photo 😄", senderId: 'other', createdAt: Date.now() - 1000 * 60 * 60 * 3 },
    { id: 'm2', text: 'He has so much energy for a little pup 😄', senderId: 'me', createdAt: Date.now() - 1000 * 60 * 60 * 2 },
  ],
  'match-charlie': [
    { id: 'm1', text: 'Charlie loves the park on weekends! Are you free this Saturday?', senderId: 'other', createdAt: Date.now() - 1000 * 60 * 60 * 24 },
  ],
};

export function getMockMatches(): MatchItem[] {
  return MOCK_MATCHES;
}

export function getMockMessages(matchId: string): ChatMessage[] {
  return MOCK_MESSAGES[matchId] ?? [];
}

export function formatMatchTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 1000 * 60) return 'now';
  if (diff < 1000 * 60 * 60) return `${Math.floor(diff / (1000 * 60))}m`;
  if (diff < 1000 * 60 * 60 * 24) return `${Math.floor(diff / (1000 * 60 * 60))}h`;
  return `${Math.floor(diff / (1000 * 60 * 60 * 24))}d`;
}

export async function fetchMatches(_userId: string): Promise<MatchItem[]> {
  return getMockMatches();
}

export async function fetchMessages(_matchId: string): Promise<ChatMessage[]> {
  return getMockMessages(_matchId);
}

export async function sendMessage(
  _matchId: string,
  _senderId: string,
  text: string,
): Promise<ChatMessage> {
  return {
    id: `msg-${Date.now()}`,
    text,
    senderId: 'me',
    createdAt: Date.now(),
  };
}
