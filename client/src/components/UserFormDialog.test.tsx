import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios, { type AxiosResponse } from "axios";

import { Role } from "core/constants/role.ts";
import type { UserListItem } from "core/schemas/users.ts";
import { renderWithQuery } from "@/test/render";
import UserFormDialog from "./UserFormDialog";

// Mock Axios and drive the shared `api` instance (created via `axios.create`).
vi.mock("axios", () => {
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  return {
    default: Object.assign(instance, {
      create: vi.fn(() => instance),
      isAxiosError: vi.fn(() => false),
    }),
  };
});

const mockedAxios = vi.mocked(axios, { deep: true });

const user: UserListItem = {
  id: "u-1",
  name: "Jane Doe",
  email: "jane@example.com",
  role: Role.agent,
  emailVerified: true,
  createdAt: "2026-03-01T10:00:00.000Z",
};

// Renders the dialog already open in edit mode; returns the dialog element and
// the onOpenChange spy.
function renderEdit() {
  const onOpenChange = vi.fn();
  const utils = renderWithQuery(
    <UserFormDialog open user={user} onOpenChange={onOpenChange} />,
  );
  const dialog = screen.getByRole("dialog");
  return { ...utils, onOpenChange, dialog };
}

describe("UserFormDialog — edit mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pre-populates the fields from the user and shows edit-mode labels", () => {
    const { dialog } = renderEdit();

    expect(within(dialog).getByRole("heading", { name: "Edit user" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Jane Doe");
    expect(within(dialog).getByLabelText("Email")).toHaveValue("jane@example.com");
    // Password starts blank and is labelled as a reset, not a required field.
    expect(within(dialog).getByLabelText("New password")).toHaveValue("");
    expect(
      within(dialog).getByText("Leave blank to keep the current password."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /save changes/i }),
    ).toBeInTheDocument();
  });

  it("PATCHes the changed name (blank password) and closes on success", async () => {
    mockedAxios.patch.mockResolvedValue({
      data: { user: {} },
    } as AxiosResponse);

    const u = userEvent.setup();
    const { dialog, onOpenChange, queryClient } = renderEdit();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const name = within(dialog).getByLabelText("Name");
    await u.click(name);
    await u.clear(name);
    await u.type(name, "Jane Smith");
    await u.click(within(dialog).getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedAxios.patch).toHaveBeenCalledWith("/api/users/u-1", {
        name: "Jane Smith",
        email: "jane@example.com",
        password: "",
        role: Role.agent,
      });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["users"] });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sends a new password when one is provided", async () => {
    mockedAxios.patch.mockResolvedValue({
      data: { user: {} },
    } as AxiosResponse);

    const u = userEvent.setup();
    const { dialog } = renderEdit();

    const password = within(dialog).getByLabelText("New password");
    await u.click(password);
    await u.type(password, "brandnewpass");
    await u.click(within(dialog).getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedAxios.patch).toHaveBeenCalledWith("/api/users/u-1", {
        name: "Jane Doe",
        email: "jane@example.com",
        password: "brandnewpass",
        role: Role.agent,
      });
    });
  });

  it("pre-selects the current role and can change it", async () => {
    mockedAxios.patch.mockResolvedValue({
      data: { user: {} },
    } as AxiosResponse);

    const u = userEvent.setup();
    const { dialog } = renderEdit();

    // The role select starts on the user's current role (agent)...
    expect(within(dialog).getByRole("combobox")).toHaveTextContent("Agent");

    // ...and switching it to Admin is sent in the PATCH payload.
    await u.click(within(dialog).getByRole("combobox"));
    await u.click(await screen.findByRole("option", { name: "Admin" }));
    await u.click(within(dialog).getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedAxios.patch).toHaveBeenCalledWith("/api/users/u-1", {
        name: "Jane Doe",
        email: "jane@example.com",
        password: "",
        role: Role.admin,
      });
    });
  });

  it("rejects a too-short new password and does not submit", async () => {
    const u = userEvent.setup();
    const { dialog } = renderEdit();

    const password = within(dialog).getByLabelText("New password");
    await u.click(password);
    await u.type(password, "short");
    await u.click(within(dialog).getByRole("button", { name: /save changes/i }));

    expect(
      await within(dialog).findByText("Password must be at least 8 characters"),
    ).toBeInTheDocument();
    expect(mockedAxios.patch).not.toHaveBeenCalled();
  });

  it("surfaces a server error and keeps the dialog open", async () => {
    mockedAxios.patch.mockRejectedValue({});

    const u = userEvent.setup();
    const { dialog, onOpenChange } = renderEdit();

    await u.click(within(dialog).getByRole("button", { name: /save changes/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to save changes",
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
