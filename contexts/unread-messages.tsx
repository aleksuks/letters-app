import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

interface UnreadMessagesContextType {
  unreadCount: number;
  markRead: (conversationId: string) => void;
}

const UnreadMessagesContext = createContext<UnreadMessagesContextType>({
  unreadCount: 0,
  markRead: () => {},
});

export function UnreadMessagesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    supabase.rpc("unread_message_count").then(({ data }) => {
      if (typeof data === "number") setUnreadCount(data);
    });
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Any message insert this user can see (RLS already scopes it to their
  // own conversations) might change the badge — re-fetch the aggregate
  // rather than reasoning locally about which conversation/read-state it
  // touches.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("unread-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  const markRead = useCallback(
    (conversationId: string) => {
      if (!user) return;
      void supabase
        .rpc("mark_conversation_read", { p_conversation_id: conversationId })
        .then(() => refresh());
    },
    [user, refresh]
  );

  return (
    <UnreadMessagesContext.Provider value={{ unreadCount, markRead }}>
      {children}
    </UnreadMessagesContext.Provider>
  );
}

export function useUnreadMessages() {
  return useContext(UnreadMessagesContext);
}
