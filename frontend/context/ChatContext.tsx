import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { sendMessageToMother, fetchVisitorHistory, type ChatMessage } from "@/services/a2a";
import { getVisitorId } from "@/services/visitor-identity";

type ChatMode = "idle" | "overlay" | "bar";

interface ChatContextValue {
  mode: ChatMode;
  messages: ChatMessage[];
  isStreaming: boolean;
  isSending: boolean;
  isLoadingHistory: boolean;
  hasPreviousChat: boolean;
  lastMotherMessage: string | null;
  startChat: (initialMessage: string) => void;
  sendMessage: (text: string) => void;
  collapseToBar: () => void;
  expandToOverlay: () => void;
  endChat: () => void;
  restorePreviousChat: () => void;
  currentTaskId: string | null;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}

// ============================================
// LocalStorage persistence helpers
// ============================================

const TASK_ID_KEY = "motherbrain_task_id";

function saveTaskId(taskId: string) {
  try {
    localStorage.setItem(TASK_ID_KEY, taskId);
  } catch {
    // localStorage unavailable
  }
}

function loadTaskId(): string | null {
  try {
    return localStorage.getItem(TASK_ID_KEY);
  } catch {
    return null;
  }
}

function clearTaskId() {
  try {
    localStorage.removeItem(TASK_ID_KEY);
  } catch {
    // localStorage unavailable
  }
}

// ============================================
// ChatProvider
// ============================================

export function ChatProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ChatMode>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasPreviousChat, setHasPreviousChat] = useState(false);
  const [lastMotherMessage, setLastMotherMessage] = useState<string | null>(null);
  const streamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTaskIdRef = useRef<string | null>(loadTaskId());
  const visitorIdRef = useRef<string | null>(null);

  // Initialize: load visitor ID and check for previous conversations
  useEffect(() => {
    (async () => {
      try {
        const vid = await getVisitorId();
        visitorIdRef.current = vid;

        // Check if there's a previous conversation to restore
        const savedTaskId = loadTaskId();
        if (savedTaskId) {
          // Verify the task exists by trying to fetch history
          const { conversations } = await fetchVisitorHistory(vid, 1);
          if (conversations.length > 0) {
            setHasPreviousChat(true);

            // Extract last Mother message for preview
            const latest = conversations[0];
            const lastAssistant = [...latest.messages]
              .reverse()
              .find(m => m.role === "assistant" && m.text);
            if (lastAssistant) {
              setLastMotherMessage(lastAssistant.text);
            }

            // Auto-restore the latest conversation messages
            // (but don't open the chat — keep collapsed)
            currentTaskIdRef.current = latest.taskId;
            saveTaskId(latest.taskId);

            const restoredMessages: ChatMessage[] = latest.messages
              .filter(m => m.text)
              .map(m => ({
                role: m.role === "user" ? "user" : "assistant",
                text: m.text,
                toolCalls: [],
              }));
            setMessages(restoredMessages);
            setMode("bar");
          } else {
            // Task ID is stale, clear it
            clearTaskId();
            currentTaskIdRef.current = null;
          }
        }
      } catch {
        // Visitor ID generation failed — chat still works without persistence
      }
    })();
  }, []);

  /** Typewriter effect: reveal text character by character */
  const streamText = useCallback((fullText: string, messageIndex: number) => {
    setIsStreaming(true);
    let charIndex = 0;
    const speed = 12;

    const tick = () => {
      charIndex++;
      const visibleText = fullText.slice(0, charIndex);

      setMessages(prev =>
        prev.map((m, i) => (i === messageIndex ? { ...m, text: visibleText } : m))
      );

      if (charIndex < fullText.length) {
        streamTimerRef.current = setTimeout(tick, speed);
      } else {
        setIsStreaming(false);
      }
    };

    setMessages(prev => prev.map((m, i) => (i === messageIndex ? { ...m, text: "" } : m)));
    streamTimerRef.current = setTimeout(tick, speed);
  }, []);

  /** Stream tool calls appearing one by one before the response */
  const streamToolCalls = useCallback(
    (toolCalls: ChatMessage["toolCalls"], messageIndex: number, onComplete: () => void) => {
      if (!toolCalls || toolCalls.length === 0) {
        onComplete();
        return;
      }

      setIsStreaming(true);
      let callIndex = 0;
      const delay = 400;

      const showNext = () => {
        if (callIndex >= toolCalls.length) {
          onComplete();
          return;
        }

        const callsSoFar = toolCalls.slice(0, callIndex + 1);
        setMessages(prev =>
          prev.map((m, i) => (i === messageIndex ? { ...m, toolCalls: callsSoFar } : m))
        );

        callIndex++;
        streamTimerRef.current = setTimeout(showNext, delay);
      };

      showNext();
    },
    []
  );

  /** Internal: send message to Mother and handle streaming */
  const sendAndStream = useCallback(
    (userText: string, messageStartIndex: number) => {
      return sendMessageToMother(userText, "product-info", currentTaskIdRef.current ?? undefined)
        .then(({ text, toolCalls, taskId }) => {
          if (taskId) {
            currentTaskIdRef.current = taskId;
            saveTaskId(taskId);
          }
          const idx = messageStartIndex;

          if (toolCalls.length > 0) {
            streamToolCalls(toolCalls, idx, () => {
              streamText(text, idx);
            });
          } else {
            setIsSending(false);
            streamText(text, idx);
          }
        })
        .catch(err => {
          setMessages(prev => [
            ...prev.slice(0, -1),
            { role: "assistant", text: `Error: ${err.message}. Please try again.` },
          ]);
          setIsStreaming(false);
        })
        .finally(() => setIsSending(false));
    },
    [streamText, streamToolCalls]
  );

  const startChat = useCallback(
    (initialMessage: string) => {
      setMessages([{ role: "user", text: initialMessage }]);
      setMode("overlay");
      setIsSending(true);
      setHasPreviousChat(false);

      // Placeholder for assistant
      setMessages(prev => [...prev, { role: "assistant", text: "", toolCalls: [] }]);

      sendAndStream(initialMessage, 1);
    },
    [sendAndStream]
  );

  const sendMessage = useCallback(
    (text: string) => {
      const userMsg: ChatMessage = { role: "user", text };
      setMessages(prev => [...prev, userMsg]);
      setIsSending(true);

      // Placeholder
      setMessages(prev => [...prev, { role: "assistant", text: "", toolCalls: [] }]);

      sendAndStream(text, messages.length + 1);
    },
    [sendAndStream, messages.length]
  );

  /** Restore the previous conversation from the backend */
  const restorePreviousChat = useCallback(async () => {
    if (!visitorIdRef.current) return;

    setIsLoadingHistory(true);
    setMode("overlay");

    try {
      const { conversations } = await fetchVisitorHistory(visitorIdRef.current, 5);

      if (conversations.length === 0) {
        setHasPreviousChat(false);
        setMode("idle");
        return;
      }

      // Take the most recent conversation
      const latest = conversations[0];
      currentTaskIdRef.current = latest.taskId;
      saveTaskId(latest.taskId);

      // Convert backend messages to ChatMessages
      const restoredMessages: ChatMessage[] = latest.messages
        .filter(m => m.text) // Skip empty messages
        .map(m => ({
          role: m.role === "user" ? "user" : "assistant",
          text: m.text,
          toolCalls: [],
        }));

      setMessages(restoredMessages);
      setHasPreviousChat(true);
    } catch {
      // Failed to restore — start fresh
      setMode("idle");
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  const collapseToBar = useCallback(() => setMode("bar"), []);
  const expandToOverlay = useCallback(() => setMode("overlay"), []);
  const endChat = useCallback(() => {
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    setMode("idle");
    setMessages([]);
    setIsStreaming(false);
    setIsSending(false);
    // Keep taskId in localStorage + ref so next chat can continue
  }, []);

  return (
    <ChatContext.Provider
      value={{
        mode,
        messages,
        isStreaming,
        isSending,
        isLoadingHistory,
        hasPreviousChat,
        lastMotherMessage,
        startChat,
        sendMessage,
        collapseToBar,
        expandToOverlay,
        endChat,
        restorePreviousChat,
        currentTaskId: currentTaskIdRef.current,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
