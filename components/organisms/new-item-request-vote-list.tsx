import type { NewItemRequestVoteView } from "@/lib/new-item-requests/types";

export function NewItemRequestVoteList({ votes }: { votes: NewItemRequestVoteView[] }) {
  if (votes.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">Votes</p>
      <ul className="space-y-1">
        {votes.map((vote, index) => {
          const customer = [vote.customerName, vote.customerPhone, vote.customerEmail]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={`${vote.userName}-${vote.createdAt}-${index}`} className="text-muted-foreground text-xs">
              <span className="text-foreground font-medium">{vote.userName}</span>
              {customer ? ` · ${customer}` : ""}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
