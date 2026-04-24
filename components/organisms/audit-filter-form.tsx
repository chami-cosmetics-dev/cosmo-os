"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_OPTION = "__all__";

type AuditFilterFormProps = {
  moduleOptions: readonly string[];
  actionOptions: readonly string[];
  actionLabels: Record<string, string>;
  initialModule?: string;
  initialAction?: string;
  initialQuery?: string;
};

function toTitleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AuditFilterForm({
  moduleOptions,
  actionOptions,
  actionLabels,
  initialModule,
  initialAction,
  initialQuery,
}: AuditFilterFormProps) {
  const router = useRouter();
  const [moduleValue, setModuleValue] = useState(initialModule ?? ALL_OPTION);
  const [actionValue, setActionValue] = useState(initialAction ?? ALL_OPTION);
  const [queryValue, setQueryValue] = useState(initialQuery ?? "");

  function applyFilters() {
    const params = new URLSearchParams();

    if (moduleValue !== ALL_OPTION) {
      params.set("module", moduleValue);
    }
    if (actionValue !== ALL_OPTION) {
      params.set("action", actionValue);
    }
    if (queryValue.trim()) {
      params.set("q", queryValue.trim());
    }

    const query = params.toString();
    router.push(query ? `/dashboard/audit?${query}` : "/dashboard/audit");
  }

  function clearFilters() {
    setModuleValue(ALL_OPTION);
    setActionValue(ALL_OPTION);
    setQueryValue("");
    router.push("/dashboard/audit");
  }

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.6fr_auto_auto]">
      <Select value={moduleValue} onValueChange={setModuleValue}>
        <SelectTrigger>
          <SelectValue placeholder="All modules" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_OPTION}>All modules</SelectItem>
          {moduleOptions.map((moduleName) => (
            <SelectItem key={moduleName} value={moduleName}>
              {toTitleCase(moduleName)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={actionValue} onValueChange={setActionValue}>
        <SelectTrigger>
          <SelectValue placeholder="All actions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_OPTION}>All actions</SelectItem>
          {actionOptions.map((actionName) => (
            <SelectItem key={actionName} value={actionName}>
              {actionLabels[actionName] ?? toTitleCase(actionName)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        value={queryValue}
        onChange={(event) => setQueryValue(event.target.value)}
        placeholder="Search summary, entity id, user name, or email"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            applyFilters();
          }
        }}
      />

      <Button type="button" onClick={applyFilters}>
        Apply
      </Button>
      <Button type="button" variant="outline" onClick={clearFilters}>
        Clear
      </Button>
    </div>
  );
}
