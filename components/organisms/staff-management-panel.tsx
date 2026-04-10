"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Pencil, UserMinus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ResignationForm } from "@/components/molecules/resignation-form";
import { StaffEditForm } from "@/components/molecules/staff-edit-form";
import { Pagination } from "@/components/ui/pagination";
import { SortableColumnHeader } from "@/components/ui/sortable-column-header";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { notify } from "@/lib/notify";

type Location = { id: string; name: string; address: string | null };
type Department = { id: string; name: string };
type Designation = { id: string; name: string };

type StaffMember = {
  id: string;
  name: string | null;
  email: string | null;
  nicNo: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  mobile: string | null;
  knownName: string | null;
  userRoles: Array<{ id: string; name: string }>;
  locations?: Location[];
  departments?: Department[];
  designations?: Designation[];
  employeeProfile: {
    id: string;
    employeeNumber: string | null;
    epfNumber: string | null;
    locationId: string | null;
    location: { id: string; name: string } | null;
    departmentId: string | null;
    department: { id: string; name: string } | null;
    designationId: string | null;
    designation: { id: string; name: string } | null;
    appointmentDate: string | null;
    status: string;
    resignedAt: string | null;
    isRider: boolean;
  } | null;
};

export type StaffManagementPanelInitialData = {
  staff: StaffMember[];
  total: number;
  page: number;
  limit: number;
  locations: Location[];
  departments: Department[];
  designations: Designation[];
};

interface StaffManagementPanelProps {
  canManageStaff: boolean;
  initialData?: StaffManagementPanelInitialData | null;
  mode?: "staff" | "riders";
}

function formatDate(date: string | null): string {
  if (!date) return "-";
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
}

export function StaffManagementPanel({
  canManageStaff,
  initialData,
  mode = "staff",
}: StaffManagementPanelProps) {
  const [staff, setStaff] = useState<StaffMember[]>(initialData?.staff ?? []);
  const [locations, setLocations] = useState<Location[]>(initialData?.locations ?? []);
  const [departments, setDepartments] = useState<Department[]>(initialData?.departments ?? []);
  const [designations, setDesignations] = useState<Designation[]>(initialData?.designations ?? []);
  const [loading, setLoading] = useState(!initialData);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "resigned">("active");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(initialData?.page ?? 1);
  const [limit, setLimit] = useState(initialData?.limit ?? 10);
  const [total, setTotal] = useState(initialData?.total ?? 0);
  const [sortBy, setSortBy] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<StaffMember | null>(null);
  const [resigningMember, setResigningMember] = useState<StaffMember | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const isRiderMode = mode === "riders";
  const entityLabel = isRiderMode ? "riders" : "staff";
  const entityTitle = isRiderMode ? "Riders" : "Staff";
  const entitySingular = isRiderMode ? "rider" : "staff";

  const isBusy = busyKey !== null;

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPageData = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (sortBy) {
      params.set("sort_by", sortBy);
      params.set("sort_order", sortOrder);
    }
    if (isRiderMode) {
      params.set("rider_only", "1");
    }
    if (locations.length === 0 || departments.length === 0 || designations.length === 0) {
      params.set("include_lookups", "1");
    }
    const res = await fetch(`/api/admin/staff/page-data?${params}`);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load staff");
      return;
    }
    const data = (await res.json()) as {
      staff: StaffMember[];
      total: number;
      page: number;
      limit: number;
      locations?: Location[];
      departments?: Department[];
      designations?: Designation[];
    };
    setStaff(data.staff);
    setTotal(data.total);
    if (data.locations) setLocations(data.locations);
    if (data.departments) setDepartments(data.departments);
    if (data.designations) setDesignations(data.designations);
  }, [
    statusFilter,
    debouncedSearch,
    page,
    limit,
    sortBy,
    sortOrder,
    isRiderMode,
    locations.length,
    departments.length,
    designations.length,
  ]);

  const skippedInitialFetch = useRef(false);
  useEffect(() => {
    if (initialData && !skippedInitialFetch.current) {
      skippedInitialFetch.current = true;
      return;
    }
    skippedInitialFetch.current = true;
    let cancelled = false;
    setLoading(true);
    fetchPageData()
      .then(() => {
        if (!cancelled) setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          notify.error("Failed to load staff");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPageData, initialData]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch, sortBy, sortOrder]);

  async function openEdit(id: string) {
    setEditingId(id);
    setEditData(null);
    try {
      const res = await fetch(`/api/admin/staff/${id}`);
      if (!res.ok) {
        notify.error("Failed to load staff details");
        setEditingId(null);
        return;
      }
      const data = (await res.json()) as StaffMember;
      setEditData(data);
    } catch {
      notify.error("Failed to load staff details");
      setEditingId(null);
    }
  }

  function closeEdit() {
    setEditingId(null);
    setEditData(null);
  }

  function openResignForm(member: StaffMember) {
    setResigningMember(member);
  }

  function closeResignForm() {
    setResigningMember(null);
  }

  async function handleResignSuccess() {
    closeResignForm();
    await fetchPageData();
  }

  const filteredStaff = staff;

  if (loading && staff.length === 0) {
    return (
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))]">
          <CardTitle className="text-xl tracking-tight">{entityTitle}</CardTitle>
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-9 w-28" />
          </div>
          <TableSkeleton columns={6} rows={6} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="overflow-hidden border-border/70 bg-card shadow-xs">
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
              Total {entityLabel}
            </p>
            <p className="mt-1 text-2xl font-semibold">{total}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-border/70 bg-card shadow-xs">
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Shown on page</p>
            <p className="mt-1 text-2xl font-semibold">{filteredStaff.length}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-border/70 bg-card shadow-xs">
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Status filter</p>
            <p className="mt-1 text-2xl font-semibold capitalize">{statusFilter}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent))]">
          <CardTitle className="text-xl tracking-tight">{entityTitle}</CardTitle>
          <p className="text-muted-foreground text-sm">
            {isRiderMode
              ? "View and manage rider-ready staff who can sign in to the mobile app."
              : "Manage employee details, departments, and designations."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder={`Search ${entityLabel} by name, email, or employee number`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={isBusy}
                className="h-10 w-full rounded-lg border-border/80 bg-background/80 sm:max-w-xs"
              />
              <div className="inline-flex rounded-xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] p-1 shadow-xs">
                {(["all", "active", "resigned"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    disabled={isBusy}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                      statusFilter === status
                        ? "bg-primary text-primary-foreground shadow-[0_10px_22px_-18px_var(--primary)]"
                        : "text-muted-foreground hover:bg-background/80 hover:text-foreground"
                    }`}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-[linear-gradient(180deg,color-mix(in_srgb,var(--secondary)_14%,transparent),transparent)]">
                  <SortableColumnHeader
                    label="Name"
                    sortKey="name"
                    currentSort={sortBy || undefined}
                    currentOrder={sortOrder}
                    onSort={(k, o) => {
                      setSortBy(k);
                      setSortOrder(o);
                      setPage(1);
                    }}
                  />
                  <SortableColumnHeader
                    label="Email"
                    sortKey="email"
                    currentSort={sortBy || undefined}
                    currentOrder={sortOrder}
                    onSort={(k, o) => {
                      setSortBy(k);
                      setSortOrder(o);
                      setPage(1);
                    }}
                  />
                  <SortableColumnHeader
                    label="Employee #"
                    sortKey="employee_number"
                    currentSort={sortBy || undefined}
                    currentOrder={sortOrder}
                    onSort={(k, o) => {
                      setSortBy(k);
                      setSortOrder(o);
                      setPage(1);
                    }}
                  />
                  <SortableColumnHeader
                    label="Department"
                    sortKey="department"
                    currentSort={sortBy || undefined}
                    currentOrder={sortOrder}
                    onSort={(k, o) => {
                      setSortBy(k);
                      setSortOrder(o);
                      setPage(1);
                    }}
                  />
                  <SortableColumnHeader
                    label="Designation"
                    sortKey="designation"
                    currentSort={sortBy || undefined}
                    currentOrder={sortOrder}
                    onSort={(k, o) => {
                      setSortBy(k);
                      setSortOrder(o);
                      setPage(1);
                    }}
                  />
                  <SortableColumnHeader
                    label="Location"
                    sortKey="location"
                    currentSort={sortBy || undefined}
                    currentOrder={sortOrder}
                    onSort={(k, o) => {
                      setSortBy(k);
                      setSortOrder(o);
                      setPage(1);
                    }}
                  />
                  <SortableColumnHeader
                    label="Appointment"
                    sortKey="appointment"
                    currentSort={sortBy || undefined}
                    currentOrder={sortOrder}
                    onSort={(k, o) => {
                      setSortBy(k);
                      setSortOrder(o);
                      setPage(1);
                    }}
                  />
                  <SortableColumnHeader
                    label="Status"
                    sortKey="status"
                    currentSort={sortBy || undefined}
                    currentOrder={sortOrder}
                    onSort={(k, o) => {
                      setSortBy(k);
                      setSortOrder(o);
                      setPage(1);
                    }}
                  />
                  {canManageStaff && <th className="text-right p-2 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((member) => (
                  <tr key={member.id} className="border-b transition-colors hover:bg-secondary/10">
                    <td className="p-2">
                      {member.knownName ? (
                        <span>
                          {member.knownName}
                          <span className="text-muted-foreground text-xs">
                            {" "}({member.name})
                          </span>
                        </span>
                      ) : (
                        member.name ?? "-"
                      )}
                    </td>
                    <td className="p-2 text-muted-foreground">{member.email ?? "-"}</td>
                    <td className="p-2">
                      {member.employeeProfile?.employeeNumber ?? "-"}
                    </td>
                    <td className="p-2">
                      {member.employeeProfile?.department?.name ?? "-"}
                    </td>
                    <td className="p-2">
                      {member.employeeProfile?.designation?.name ?? "-"}
                    </td>
                    <td className="p-2">
                      {member.employeeProfile?.location?.name ?? "-"}
                    </td>
                    <td className="p-2">
                      {formatDate(member.employeeProfile?.appointmentDate ?? null)}
                    </td>
                    <td className="p-2">
                      <span
                        className={
                          member.employeeProfile?.status === "resigned"
                            ? "text-muted-foreground rounded-full border border-border/70 bg-background/60 px-2 py-0.5 text-xs"
                            : "inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300"
                        }
                      >
                        {member.employeeProfile?.status ?? "active"}
                      </span>
                    </td>
                    {canManageStaff && (
                      <td className="p-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-border/70 bg-background/70 hover:bg-secondary/15"
                            onClick={() => openEdit(member.id)}
                            disabled={isBusy}
                          >
                            <Pencil className="size-4" aria-hidden />
                            Edit
                          </Button>
                          {member.employeeProfile?.status !== "resigned" && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => openResignForm(member)}
                              disabled={isBusy}
                            >
                              <UserMinus className="size-4" aria-hidden />
                              Resign
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > 0 && (
            <Pagination
              page={page}
              limit={limit}
              total={total}
              onPageChange={setPage}
              onLimitChange={(l) => {
                setLimit(l);
                setPage(1);
              }}
              limitOptions={[10, 25, 50, 100]}
            />
          )}

          {filteredStaff.length === 0 && !loading && (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No {entityLabel} found.
            </p>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!editingId} onOpenChange={(open) => !open && closeEdit()}>
        <SheetContent side="right" className="overflow-y-auto border-l border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_94%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] sm:max-w-md">
          <SheetHeader className="border-b pb-4">
            <SheetTitle>{`Edit ${entitySingular}`}</SheetTitle>
          </SheetHeader>
          {editingId && (
            <StaffEditForm
              staffId={editingId}
              initialData={editData}
              locations={editData?.locations ?? locations}
              departments={editData?.departments ?? departments}
              designations={editData?.designations ?? designations}
              canEdit={canManageStaff}
              onSaved={fetchPageData}
              onClose={closeEdit}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!resigningMember} onOpenChange={(open) => !open && closeResignForm()}>
        <SheetContent side="right" className="overflow-y-auto border-l border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_94%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] sm:max-w-md">
          <SheetHeader className="border-b pb-4">
            <SheetTitle>Process resignation</SheetTitle>
          </SheetHeader>
          {resigningMember && (
            <ResignationForm
              member={resigningMember}
              onSuccess={handleResignSuccess}
              onCancel={closeResignForm}
              disabled={!canManageStaff}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}



