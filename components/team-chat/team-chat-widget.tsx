'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowLeft,
  LoaderCircle,
  MessageCircle,
  Plus,
  Search,
  Send,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';

type Member = {
  key: string;
  name: string;
  email: string;
  role: string;
  online: boolean;
};

type Message = {
  id: number;
  channelType: 'everyone' | 'direct';
  senderKey: string;
  senderName: string;
  recipientKey: string | null;
  body: string;
  createdAt: string;
};

type ChatData = {
  actor: { key: string; name: string };
  members: Member[];
  messages: Message[];
  reads: Record<string, number>;
};

type View = 'list' | 'new' | 'chat';
type LauncherPosition = { x: number; y: number };

const EMPTY_DATA: ChatData = {
  actor: { key: '', name: '' },
  members: [],
  messages: [],
  reads: {},
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'S';
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatConversationDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return formatTime(value);
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function directChannelKey(memberKey: string) {
  return `direct:${memberKey}`;
}

export function TeamChatWidget() {
  const [open, setOpen] = useState(false);
  const [edgeExpanded, setEdgeExpanded] = useState(false);
  const [edgeTop, setEdgeTop] = useState<number | null>(null);
  const [view, setView] = useState<View>('list');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [data, setData] = useState<ChatData>(EMPTY_DATA);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [launcherPosition, setLauncherPosition] = useState<LauncherPosition | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const launcherDragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    moved: boolean;
    lastPosition: LauncherPosition;
  } | null>(null);
  const suppressLauncherClickRef = useRef(false);

  useEffect(() => {
    const positionBesideControls = () => {
      const height = window.innerHeight;
      const width = window.innerWidth;
      const controls = Array.from(document.querySelectorAll('button, input, textarea, select, a[href], [role="button"]'))
        .filter((element) => !element.closest('[aria-label="Safawala CRM team chat"]') && element.getAttribute('aria-label') !== 'Open team chat')
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0 && rect.height < 120 && rect.right > width - 120 && rect.left < width);
      let best = Math.round(height / 2);
      let bestScore = Number.POSITIVE_INFINITY;
      for (let top = 60; top <= height - 60; top += 8) {
        const overlap = controls.filter((rect) => rect.top < top + 22 && rect.bottom > top - 22).length;
        const score = overlap * 10000 + Math.abs(top - height / 2);
        if (score < bestScore) { bestScore = score; best = top; }
      }
      setEdgeTop(best);
    };
    positionBesideControls();
    const observer = new MutationObserver(positionBesideControls);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', positionBesideControls);
    window.addEventListener('scroll', positionBesideControls, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', positionBesideControls); window.removeEventListener('scroll', positionBesideControls, true); };
  }, []);

  const clampLauncherPosition = useCallback((_x: number, y: number): LauncherPosition => {
    const margin = 24;
    const size = 36;
    return {
      x: 0,
      y: Math.min(Math.max(margin, y), Math.max(margin, window.innerHeight - size - margin)),
    };
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('safawala-team-chat-launcher-position');
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<LauncherPosition>;
      if (typeof parsed.y === 'number') {
        setLauncherPosition(clampLauncherPosition(0, parsed.y));
      }
    } catch {
      // Keep the default edge position when storage is unavailable.
    }
  }, [clampLauncherPosition]);

  useEffect(() => {
    function keepLauncherOnScreen() {
      setLauncherPosition((current) =>
        current ? clampLauncherPosition(current.x, current.y) : current,
      );
    }
    window.addEventListener('resize', keepLauncherOnScreen);
    return () => window.removeEventListener('resize', keepLauncherOnScreen);
  }, [clampLauncherPosition]);

  function startLauncherDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    launcherDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      lastPosition: { x: rect.left, y: rect.top },
    };
  }

  function moveLauncher(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = launcherDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) {
      drag.moved = true;
    }
    if (!drag.moved) return;
    event.preventDefault();
    const next = clampLauncherPosition(
      0,
      event.clientY - drag.offsetY,
    );
    drag.lastPosition = next;
    setLauncherPosition(next);
  }

  function finishLauncherDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = launcherDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.moved) {
      suppressLauncherClickRef.current = true;
      try {
        window.localStorage.setItem(
          'safawala-team-chat-launcher-position',
          JSON.stringify(drag.lastPosition),
        );
      } catch {
        // Position persistence is optional; dragging still works.
      }
    }
    launcherDragRef.current = null;
  }

  function cancelLauncherDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = launcherDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    launcherDragRef.current = null;
    suppressLauncherClickRef.current = false;
  }

  const loadChat = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch('/api/team-chat', { cache: 'no-store' });
      const payload = (await response.json()) as ChatData & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not load team chat.');
      setData(payload);
      setError('');
    } catch (loadError) {
      if (!quiet) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load team chat.');
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChat(true);
  }, [loadChat]);

  useEffect(() => {
    if (!open) return;
    void loadChat();
    const interval = window.setInterval(() => void loadChat(true), 5000);
    return () => window.clearInterval(interval);
  }, [loadChat, open]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  const selectedMember = useMemo(
    () => data.members.find((member) => member.key === selectedKey) ?? null,
    [data.members, selectedKey],
  );

  const selectedMessages = useMemo(() => {
    if (selectedKey === 'everyone') {
      return data.messages.filter((message) => message.channelType === 'everyone');
    }
    if (!selectedKey) return [];
    return data.messages.filter(
      (message) =>
        message.channelType === 'direct' &&
        ((message.senderKey === data.actor.key && message.recipientKey === selectedKey) ||
          (message.senderKey === selectedKey && message.recipientKey === data.actor.key)),
    );
  }, [data.actor.key, data.messages, selectedKey]);

  const channelKey = selectedKey === 'everyone'
    ? 'everyone'
    : selectedKey
      ? directChannelKey(selectedKey)
      : '';

  const markRead = useCallback(async (key: string, messageId: number) => {
    if (!messageId) return;
    setData((current) => ({
      ...current,
      reads: { ...current.reads, [key]: Math.max(current.reads[key] ?? 0, messageId) },
    }));
    await fetch('/api/team-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read', channelKey: key, lastMessageId: messageId }),
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open || view !== 'chat' || !channelKey || selectedMessages.length === 0) return;
    const lastMessage = selectedMessages[selectedMessages.length - 1];
    void markRead(channelKey, lastMessage.id);
    window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [channelKey, markRead, open, selectedMessages, view]);

  const conversations = useMemo(() => {
    const everyoneMessages = data.messages.filter((message) => message.channelType === 'everyone');
    const directMembers = data.members
      .filter((member) => member.key !== data.actor.key)
      .map((member) => {
        const messages = data.messages.filter(
          (message) =>
            message.channelType === 'direct' &&
            ((message.senderKey === data.actor.key && message.recipientKey === member.key) ||
              (message.senderKey === member.key && message.recipientKey === data.actor.key)),
        );
        return { member, messages, last: messages[messages.length - 1] };
      })
      .filter((item) => item.last);

    return {
      everyone: everyoneMessages[everyoneMessages.length - 1],
      direct: directMembers.sort(
        (a, b) => new Date(b.last.createdAt).getTime() - new Date(a.last.createdAt).getTime(),
      ),
    };
  }, [data.actor.key, data.members, data.messages]);

  const unreadFor = useCallback((key: string, messages: Message[]) => {
    const lastRead = data.reads[key] ?? 0;
    return messages.filter(
      (message) => message.id > lastRead && message.senderKey !== data.actor.key,
    ).length;
  }, [data.actor.key, data.reads]);

  const totalUnread = useMemo(() => {
    const everyone = data.messages.filter((message) => message.channelType === 'everyone');
    let count = unreadFor('everyone', everyone);
    for (const member of data.members) {
      if (member.key === data.actor.key) continue;
      const messages = data.messages.filter(
        (message) =>
          message.channelType === 'direct' &&
          ((message.senderKey === data.actor.key && message.recipientKey === member.key) ||
            (message.senderKey === member.key && message.recipientKey === data.actor.key)),
      );
      count += unreadFor(directChannelKey(member.key), messages);
    }
    return count;
  }, [data.actor.key, data.members, data.messages, unreadFor]);

  function openChannel(key: string) {
    setSelectedKey(key);
    setView('chat');
    setDraft('');
    setSearch('');
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selectedKey || sending) return;
    setSending(true);
    setError('');
    try {
      const response = await fetch('/api/team-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          body,
          recipientKey: selectedKey === 'everyone' ? null : selectedKey,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Message was not sent.');
      setDraft('');
      await loadChat(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Message was not sent.');
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage(messageId: number) {
    setData((current) => ({
      ...current,
      messages: current.messages.filter((message) => message.id !== messageId),
    }));
    await fetch('/api/team-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', messageId }),
    }).catch(() => undefined);
  }

  const filteredMembers = data.members.filter((member) => {
    if (member.key === data.actor.key) return false;
    const query = search.trim().toLowerCase();
    return !query || `${member.name} ${member.email} ${member.role}`.toLowerCase().includes(query);
  });

  return (
    <>
      {open ? (
        <section
          aria-label="Safawala CRM team chat"
          className="fixed bottom-[5.25rem] right-4 z-[70] flex h-[min(650px,calc(100dvh-6.5rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-[0_24px_70px_rgba(60,38,18,0.22)] max-sm:inset-0 max-sm:h-dvh max-sm:w-full max-sm:rounded-none dark:bg-card"
        >
          {view === 'list' ? (
            <>
              <ChatHeader
                icon={<MessageCircle className="size-5" />}
                title="Team Chat"
                subtitle="Safawala CRM internal team"
                onClose={() => setOpen(false)}
              />
              <SearchBox value={search} onChange={setSearch} placeholder="Search conversations..." />
              <div className="flex items-center justify-between border-y border-border/70 bg-[#fcfaf7] px-4 py-3 dark:bg-muted/30">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Recent conversations
                </p>
                <button
                  type="button"
                  onClick={() => { setView('new'); setSearch(''); }}
                  className="inline-flex h-7 items-center gap-1 rounded-lg bg-primary/10 px-2.5 text-xs font-semibold text-primary transition hover:bg-primary/15"
                >
                  <Plus className="size-3.5" /> New chat
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
                {loading ? <LoadingState /> : null}
                {!loading && error ? <ErrorState message={error} onRetry={() => void loadChat()} /> : null}
                {!loading && !error ? (
                  <>
                    <ConversationButton
                      name="Everyone"
                      detail={conversations.everyone?.body || 'Message the whole Safawala CRM team'}
                      date={conversations.everyone ? formatConversationDate(conversations.everyone.createdAt) : ''}
                      unread={unreadFor(
                        'everyone',
                        data.messages.filter((message) => message.channelType === 'everyone'),
                      )}
                      icon={<UsersRound className="size-5" />}
                      onClick={() => openChannel('everyone')}
                    />
                    {conversations.direct.map(({ member, messages, last }) => (
                      <ConversationButton
                        key={member.key}
                        name={member.name}
                        detail={last.body}
                        date={formatConversationDate(last.createdAt)}
                        unread={unreadFor(directChannelKey(member.key), messages)}
                        avatar={initials(member.name)}
                        online={member.online}
                        onClick={() => openChannel(member.key)}
                      />
                    ))}
                    {conversations.direct.length === 0 && !conversations.everyone ? (
                      <div className="mx-2 mt-5 rounded-xl border border-dashed border-border bg-[#fcfaf7] px-4 py-5 text-center dark:bg-muted/20">
                        <MessageCircle className="mx-auto mb-2 size-6 text-primary/60" />
                        <p className="text-sm font-semibold">No messages yet</p>
                        <p className="mt-1 text-xs text-muted-foreground">Start with Everyone or choose a team member.</p>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </>
          ) : null}

          {view === 'new' ? (
            <>
              <ChatHeader
                back={() => { setView('list'); setSearch(''); }}
                icon={<MessageCircle className="size-5" />}
                title="New Chat"
                subtitle="Safawala CRM internal team"
                onClose={() => setOpen(false)}
              />
              <SearchBox value={search} onChange={setSearch} placeholder="Search team members..." />
              <div className="min-h-0 flex-1 overflow-y-auto border-t border-border/70 p-2">
                {filteredMembers.map((member) => (
                  <button
                    key={member.key}
                    type="button"
                    onClick={() => openChannel(member.key)}
                    className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-[#fbf7f2] dark:hover:bg-muted/40"
                  >
                    <Avatar name={member.name} online={member.online} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{member.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {member.role}{member.email ? ` · ${member.email}` : ''}
                      </span>
                    </span>
                    <span className={member.online ? 'text-[10px] font-medium text-emerald-600' : 'text-[10px] text-muted-foreground'}>
                      {member.online ? 'Online' : 'Offline'}
                    </span>
                  </button>
                ))}
                {filteredMembers.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">No team member found.</p>
                ) : null}
              </div>
            </>
          ) : null}

          {view === 'chat' && selectedKey ? (
            <>
              <ChatHeader
                back={() => { setView('list'); setSelectedKey(null); }}
                icon={selectedKey === 'everyone'
                  ? <UsersRound className="size-5" />
                  : <span className="text-xs font-bold">{initials(selectedMember?.name || 'S')}</span>}
                title={selectedKey === 'everyone' ? 'Everyone' : selectedMember?.name || 'Team member'}
                subtitle={selectedKey === 'everyone'
                  ? 'Safawala CRM-wide team chat'
                  : selectedMember?.online ? 'Online' : selectedMember?.role || 'Team member'}
                onClose={() => setOpen(false)}
              />
              <div className="min-h-0 flex-1 overflow-y-auto bg-[#fcfaf8] px-3 py-4 dark:bg-muted/20 sm:px-4">
                {selectedMessages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                      <MessageCircle className="size-6" />
                    </div>
                    <p className="mt-3 text-sm font-semibold">Start the conversation</p>
                    <p className="mt-1 max-w-52 text-xs text-muted-foreground">
                      Messages stay inside your Safawala CRM team.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedMessages.map((message) => {
                      const mine = message.senderKey === data.actor.key;
                      return (
                        <div key={message.id} className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[82%] rounded-2xl px-3 py-2 shadow-sm ${
                            mine
                              ? 'rounded-br-md bg-primary text-primary-foreground'
                              : 'rounded-bl-md border border-border bg-white text-foreground dark:bg-card'
                          }`}>
                            {!mine ? <p className="mb-1 text-[10px] font-bold text-primary">{message.senderName}</p> : null}
                            <p className="whitespace-pre-wrap break-words text-sm leading-5">{message.body}</p>
                            <div className={`mt-1 flex items-center justify-end gap-1.5 ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                              <span className="text-[9px]">{formatTime(message.createdAt)}</span>
                              {mine ? (
                                <button
                                  type="button"
                                  onClick={() => void deleteMessage(message.id)}
                                  className="opacity-0 transition hover:opacity-100 group-hover:opacity-70 focus:opacity-100"
                                  aria-label="Delete message"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>
                )}
              </div>
              {error ? <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p> : null}
              <form onSubmit={sendMessage} className="flex items-end gap-2 border-t border-border bg-white p-3 dark:bg-card">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Write a message..."
                  rows={1}
                  maxLength={2000}
                  className="max-h-24 min-h-10 flex-1 resize-none rounded-xl border border-border bg-[#fcfaf7] px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/10 dark:bg-muted/30"
                  aria-label="Message"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label="Send message"
                >
                  {sending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
                </button>
              </form>
            </>
          ) : null}
        </section>
      ) : null}

      <button
        type="button"
        onPointerDown={startLauncherDrag}
        onPointerMove={moveLauncher}
        onPointerUp={finishLauncherDrag}
        onPointerCancel={cancelLauncherDrag}
        onMouseEnter={() => setEdgeExpanded(true)}
        onMouseLeave={() => setEdgeExpanded(false)}
        onFocus={() => setEdgeExpanded(true)}
        onBlur={() => setEdgeExpanded(false)}
        onClick={() => {
          if (suppressLauncherClickRef.current) {
            suppressLauncherClickRef.current = false;
            return;
          }
          if (!edgeExpanded && window.matchMedia('(hover: none)').matches) {
            setEdgeExpanded(true);
            return;
          }
          setOpen((current) => !current);
          if (window.matchMedia('(hover: none)').matches) setEdgeExpanded(false);
        }}
        style={{ top: launcherPosition ? launcherPosition.y + 18 : edgeTop ?? '50%' }}
        className={`group fixed right-0 z-[71] flex h-11 touch-none cursor-grab select-none items-center overflow-visible rounded-l-xl border border-r-0 border-[#d9b982] bg-gradient-to-br from-[#ae762f] to-[#89551d] text-white shadow-[0_10px_28px_rgba(94,55,24,0.28)] transition-[width,box-shadow,background-color] duration-200 ease-out hover:shadow-[0_14px_34px_rgba(94,55,24,0.34)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 active:cursor-grabbing ${edgeExpanded ? 'w-[108px]' : 'w-10'}`}
        aria-label={open ? 'Close team chat' : 'Open team chat'}
        aria-expanded={open}
        title="Drag along edge · Click to open team chat"
      >
        <span className="ml-1.5 grid size-7 shrink-0 place-items-center rounded-lg bg-white/14 ring-1 ring-inset ring-white/15">
          {open ? <X className="size-4" /> : <UsersRound className="size-[17px]" />}
        </span>
        <span
          className={`ml-2 whitespace-nowrap text-xs font-semibold tracking-wide transition-opacity duration-150 ${edgeExpanded ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          aria-hidden={!edgeExpanded}
        >
          {open ? 'Close chat' : 'Team chat'}
        </span>
        <span aria-hidden="true" className="absolute inset-y-2 right-0 w-px bg-white/20" />
        {!open && totalUnread > 0 ? (
          <span className="absolute left-0 top-0 grid min-h-[17px] min-w-[17px] -translate-x-[30%] -translate-y-[30%] place-items-center rounded-full border-2 border-white bg-red-500 px-0.5 text-[8px] font-bold leading-none text-white shadow-sm dark:border-card">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        ) : null}
      </button>
    </>
  );
}

function ChatHeader({
  back,
  icon,
  title,
  subtitle,
  onClose,
}: {
  back?: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  return (
    <header className="flex h-[68px] shrink-0 items-center gap-3 border-b border-border/70 bg-white px-4 dark:bg-card">
      {back ? (
        <button type="button" onClick={back} className="-ml-1 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Back">
          <ArrowLeft className="size-4" />
        </button>
      ) : null}
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-bold">{title}</h2>
        <p className="truncate text-[10px] text-muted-foreground">{subtitle}</p>
      </div>
      <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Close team chat">
        <X className="size-4" />
      </button>
    </header>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="shrink-0 bg-white p-3 dark:bg-card">
      <label className="flex h-10 items-center gap-2 rounded-xl border border-border bg-[#fafbfc] px-3 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 dark:bg-muted/25">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>
    </div>
  );
}

function Avatar({ name, online = false }: { name: string; online?: boolean }) {
  return (
    <span className="relative grid size-11 shrink-0 place-items-center rounded-full border border-primary/15 bg-primary/10 text-xs font-bold text-primary">
      {initials(name)}
      <span className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-white dark:border-card ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
    </span>
  );
}

function ConversationButton({
  name,
  detail,
  date,
  unread,
  icon,
  avatar,
  online,
  onClick,
}: {
  name: string;
  detail: string;
  date: string;
  unread: number;
  icon?: React.ReactNode;
  avatar?: string;
  online?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-1 flex w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-2.5 text-left transition hover:border-primary/10 hover:bg-primary/[0.04]"
    >
      {icon ? (
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">{icon}</span>
      ) : (
        <span className="relative grid size-11 shrink-0 place-items-center rounded-full border border-primary/15 bg-primary/10 text-xs font-bold text-primary">
          {avatar}
          <span className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-white dark:border-card ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{name}</span>
          <span className="shrink-0 text-[9px] text-muted-foreground">{date}</span>
        </span>
        <span className={`mt-0.5 flex items-center justify-between gap-2 text-xs ${unread ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
          <span className="truncate">{detail}</span>
          {unread ? <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">{unread}</span> : null}
        </span>
      </span>
    </button>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" /> Loading team chat...
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="m-2 rounded-xl border border-red-200 bg-red-50 p-4 text-center">
      <p className="text-sm text-red-700">{message}</p>
      <button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700">Try again</button>
    </div>
  );
}
