import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LogoDropdown } from "@/components/LogoDropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { conversationsApi } from "@/api";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bot,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageSquarePlus,
  Monitor,
  Moon,
  MoreHorizontal,
  Pin,
  PinOff,
  Search,
  Settings,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const qc = useQueryClient();
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: conversationsApi.list,
  });
  const search = useQuery({
    queryKey: ["conversation-search", term],
    queryFn: () => conversationsApi.search(term.trim()),
    enabled: term.trim().length > 0,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["conversations"] });
  const rename = useMutation({ mutationFn: (v: { id: string; title: string }) => conversationsApi.rename(v.id, v.title), onSuccess: refresh });
  const setPinned = useMutation({ mutationFn: (v: { id: string; pinned: boolean }) => conversationsApi.setPinned(v.id, v.pinned), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (v: { id: string }) => conversationsApi.remove(v.id), onSuccess: refresh });

  const list = useMemo(() => {
    const source = term.trim() ? (search.data ?? []) : (conversations.data ?? []);
    const pinned = source.filter((c) => c.pinned);
    const rest = source.filter((c) => !c.pinned);
    return { pinned, rest };
  }, [conversations.data, search.data, term]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleNewChat = () => {
    setMobileOpen(false);
    navigate("/dashboard");
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      qc.clear();
      navigate("/auth?mode=login", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign out");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove.mutateAsync({ id });
      toast.success("Conversation deleted");
      if (conversationId === id) navigate("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleRename = async (id: string) => {
    const title = window.prompt("Rename conversation");
    if (title?.trim()) {
      try {
        await rename.mutateAsync({ id, title: title.trim() });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Rename failed");
      }
    }
  };

  const nav = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Chat" },
    { to: "/app/assistants", icon: Bot, label: "Assistants" },
    { to: "/app/documents", icon: FileText, label: "Documents" },
    { to: "/app/analytics", icon: BarChart3, label: "Analytics" },
    { to: "/app/settings", icon: Settings, label: "Settings" },
  ];

  const sidebar = (
    <div className="flex h-full w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between px-4 pt-4">
        <NavLink to="/" className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400 text-sm font-black text-white">
            N
          </div>
          <span className="font-display text-lg font-bold tracking-tight">
            Nexus<span className="text-gradient">AI</span>
          </span>
        </NavLink>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="px-3 pt-4">
        <Button
          className="w-full justify-start gap-2 rounded-xl"
          onClick={handleNewChat}
        >
          <MessageSquarePlus className="size-4" />
          New chat
        </Button>
        <button
          onClick={() => setSearchOpen(true)}
          className="mt-2 flex w-full items-center gap-2 rounded-xl border border-sidebar-border bg-background/40 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60"
        >
          <Search className="size-3.5" />
          Search chats
          <kbd className="ml-auto rounded border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>
        </button>
      </div>

      <ScrollArea className="scrollbar-slim mt-3 min-h-0 flex-1 px-2 pb-2">
        <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Conversations
        </p>
        {list.pinned.length > 0 && (
          <>
            {list.pinned.map((c) => (
              <ConversationRow
                key={c._id}
                id={c._id}
                title={c.title}
                active={conversationId === c._id}
                pinned
                onClick={() => {
                  setMobileOpen(false);
                  navigate(`/dashboard/c/${c._id}`);
                }}
                onPin={() => setPinned.mutate({ id: c._id, pinned: !c.pinned })}
                onRename={() => handleRename(c._id)}
                onDelete={() => handleDelete(c._id)}
              />
            ))}
            <div className="mx-2 my-1.5 border-t border-sidebar-border/60" />
          </>
        )}
        {list.rest.map((c) => (
          <ConversationRow
            key={c._id}
            id={c._id}
            title={c.title}
            active={conversationId === c._id}
            pinned={false}
            onClick={() => {
              setMobileOpen(false);
              navigate(`/dashboard/c/${c._id}`);
            }}
            onPin={() => setPinned.mutate({ id: c._id, pinned: !c.pinned })}
            onRename={() => handleRename(c._id)}
            onDelete={() => handleDelete(c._id)}
          />
        ))}
        {list.pinned.length + list.rest.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {term ? "No matches" : "No conversations yet"}
          </p>
        )}
      </ScrollArea>

      <div className="border-t border-sidebar-border px-3 py-3">
        <nav className="space-y-0.5">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/dashboard"}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  isActive &&
                    "bg-sidebar-accent text-sidebar-accent-foreground",
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-3 flex items-center justify-between rounded-xl border border-sidebar-border bg-background/40 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <LogoDropdown />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">
                {user?.name ?? user?.email ?? "Guest"}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {user?.email ?? "Anonymous session"}
              </p>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-destructive"
              >
                <LogOut className="size-3" />
                Log out
              </button>
            </div>
          </div>
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <div className="hidden lg:block">{sidebar}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border/70 px-4 py-2.5 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
          >
            <Search className="size-4" />
          </Button>
          <span className="font-display font-bold">
            Nexus<span className="text-gradient">AI</span>
          </span>
          <div className="ml-auto">
            <ThemeToggle theme={theme} setTheme={setTheme} />
          </div>
        </header>

        <main className="min-h-0 flex-1">{children}</main>
      </div>

      <SearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        term={term}
        setTerm={setTerm}
        results={search.data}
        onNavigate={(id) => {
          setSearchOpen(false);
          setTerm("");
          navigate(`/dashboard/c/${id}`);
        }}
      />
    </div>
  );
}

function ConversationRow({
  title,
  active,
  pinned,
  onClick,
  onPin,
  onRename,
  onDelete,
}: {
  id: string;
  title: string;
  active: boolean;
  pinned: boolean;
  onClick: () => void;
  onPin: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group grid w-full min-w-0 grid-cols-[minmax(0,1fr)_1.5rem] items-center rounded-lg pr-1 transition-colors",
        active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
      )}
    >
      <button
        onClick={onClick}
        className="flex w-full min-w-0 items-center gap-2 overflow-hidden px-2.5 py-2 text-left"
        title={title}
      >
        {pinned && <Pin className="size-3 shrink-0 text-primary" />}
        <span
          className={cn(
            "block min-w-0 flex-1 truncate text-sm",
            active ? "font-semibold" : "text-muted-foreground",
          )}
        >
          {title}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 justify-self-center"
            aria-label="Conversation actions"
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={onPin} className="cursor-pointer">
            {pinned ? <PinOff className="mr-2 size-3.5" /> : <Pin className="mr-2 size-3.5" />}
            {pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onRename} className="cursor-pointer">
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onDelete}
            className="cursor-pointer text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ThemeToggle({
  theme,
  setTheme,
}: {
  theme: string;
  setTheme: (t: "light" | "dark" | "system") => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7 rounded-lg">
          {theme === "dark" ? (
            <Moon className="size-3.5" />
          ) : theme === "light" ? (
            <Sun className="size-3.5" />
          ) : (
            <Monitor className="size-3.5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")} className="cursor-pointer">
          <Sun className="mr-2 size-3.5" /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} className="cursor-pointer">
          <Moon className="mr-2 size-3.5" /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")} className="cursor-pointer">
          <Monitor className="mr-2 size-3.5" /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SearchDialog({
  open,
  onOpenChange,
  term,
  setTerm,
  results,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  term: string;
  setTerm: (t: string) => void;
  results?: { _id: string; title: string }[];
  onNavigate: (id: string) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="glass relative w-full max-w-lg rounded-2xl border border-border/70 p-3 shadow-2xl">
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/60 px-3">
          <Search className="size-4 text-muted-foreground" />
          <Input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search conversations…"
            className="border-0 bg-transparent px-0 focus-visible:ring-0"
          />
          <Badge variant="secondary" className="font-mono text-[10px]">
            esc
          </Badge>
        </div>
        <div className="scrollbar-slim mt-2 max-h-72 space-y-0.5 overflow-y-auto">
          {(results ?? []).map((r) => (
            <button
              key={r._id}
              onClick={() => onNavigate(r._id)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <MessageSquarePlus className="size-3.5 text-muted-foreground" />
              <span className="truncate">{r.title}</span>
            </button>
          ))}
          {term.trim() && (results ?? []).length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No conversations found
            </p>
          )}
          {!term.trim() && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Type to search your chat history
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
