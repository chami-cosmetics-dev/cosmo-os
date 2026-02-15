"use client";

import { useState, useEffect, useCallback } from "react";
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
  } | null;
};

interface StaffManagementPanelProps {
  canManageStaff: boolean;
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export function StaffManagementPanel({ canManageStaff }: StaffManagementPanelProps) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "resigned">("active");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<StaffMember | null>(null);
  const [resigningMember, setResigningMember] = useState<StaffMember | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchStaff = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    const res = await fetch(`/api/admin/staff?${params}`);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load staff");
      return;
    }
    const data = (await res.json()) as StaffMember[];
    setStaff(data);
  }, [statusFilter, debouncedSearch]);

  const fetchPageData = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    const res = await fetch(`/api/admin/staff/page-data?${params}`);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load staff");
      return;
    }
    const data = (await res.json()) as {
      staff: StaffMember[];
      locations: Location[];
      departments: Department[];
      designations: Designation[];
    };
    setStaff(data.staff);
    setLocations(data.locations);
    setDepartments(data.departments);
    setDesignations(data.designations);
  }, [statusFilter, debouncedSearch]);

  useEffect(() => {
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
  }, [fetchPageData]);

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
    await fetchStaff();
  }

  const filteredStaff = staff;

  if (loading && staff.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Staff</CardTitle>
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
      <Card>
        <CardHeader>
          <CardTitle>Staff</CardTitle>
          <p className="text-muted-foreground text-sm">
            Manage employee details, departments, and designations.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search by name, email, or employee number"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={isBusy}
                className="max-w-xs"
              />
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "all" | "active" | "resigned")
                }
                disabled={isBusy}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="resigned">Resigned</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">Name</th>
                  <th className="text-left p-2 font-medium">Email</th>
                  <th className="text-left p-2 font-medium">Employee #</th>
                  <th className="text-left p-2 font-medium">Department</th>
                  <th className="text-left p-2 font-medium">Designation</th>
                  <th className="text-left p-2 font-medium">Location</th>
                  <th className="text-left p-2 font-medium">Appointment</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  {canManageStaff && <th className="text-right p-2 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((member) => (
                  <tr key={member.id} className="border-b">
                    <td className="p-2">
                      {member.knownName ? (
                        <span>
                          {member.knownName}
                          <span className="text-muted-foreground text-xs">
                            {" "}({member.name})
                          </span>
                        </span>
                      ) : (
                        member.name ?? "—"
                      )}
                    </td>
                    <td className="p-2 text-muted-foreground">{member.email ?? "—"}</td>
                    <td className="p-2">
                      {member.employeeProfile?.employeeNumber ?? "—"}
                    </td>
                    <td className="p-2">
                      {member.employeeProfile?.department?.name ?? "—"}
                    </td>
                    <td className="p-2">
                      {member.employeeProfile?.designation?.name ?? "—"}
                    </td>
                    <td className="p-2">
                      {member.employeeProfile?.location?.name ?? "—"}
                    </td>
                    <td className="p-2">
                      {formatDate(member.employeeProfile?.appointmentDate ?? null)}
                    </td>
                    <td className="p-2">
                      <span
                        className={
                          member.employeeProfile?.status === "resigned"
                            ? "text-muted-foreground"
                            : ""
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

          {filteredStaff.length === 0 && (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No staff members found.
            </p>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!editingId} onOpenChange={(open) => !open && closeEdit()}>
        <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit staff</SheetTitle>
          </SheetHeader>
          {editingId && (
            <StaffEditForm
              staffId={editingId}
              initialData={editData}
              locations={editData?.locations ?? locations}
              departments={editData?.departments ?? departments}
              designations={editData?.designations ?? designations}
              canEdit={canManageStaff}
              onSaved={fetchStaff}
              onClose={closeEdit}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!resigningMember} onOpenChange={(open) => !open && closeResignForm()}>
        <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
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
