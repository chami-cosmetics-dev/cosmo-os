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
  initialModule?: string;
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
  initialModule,
  initialQuery,
}: AuditFilterFormProps) {
  const router = useRouter();
  const [moduleValue, setModuleValue] = useState(initialModule ?? ALL_OPTION);
  const [queryValue, setQueryValue] = useState(initialQuery ?? "");

  function applyFilters(nextModuleValue = moduleValue, nextQueryValue = queryValue) {
    const params = new URLSearchParams();

    if (nextModuleValue !== ALL_OPTION) {
      params.set("module", nextModuleValue);
    }
    if (nextQueryValue.trim()) {
      params.set("q", nextQueryValue.trim());
    }

    const query = params.toString();
    router.push(query ? `/dashboard/audit?${query}` : "/dashboard/audit");
  }

  function clearFilters() {
    setModuleValue(ALL_OPTION);
    setQueryValue("");
    router.push("/dashboard/audit");
  }

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
      <Select
        value={moduleValue}
        onValueChange={(value) => {
          setModuleValue(value);
          applyFilters(value);
        }}
      >
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

      <Button type="button" variant="outline" onClick={clearFilters}>
        Clear
      </Button>
    </div>
  );
}
