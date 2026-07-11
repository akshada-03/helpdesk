import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios, { type AxiosResponse } from "axios";

import { Role } from "core/constants/role.ts";
import type { UserListItem } from "core/schemas/users.ts";
import { renderWithQuery } from "@/test/render";
import DeleteUserDialog from "./DeleteUserDialog";

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
  id: "u-9",
  name: "Bob Agent",
  email: "bob@example.com",
  role: Role.agent,
  emailVerified: true,
  createdAt: "2026-02-20T10:00:00.000Z",
};

function renderDialog() {
  const onOpenChange = vi.fn();
  const utils = renderWithQuery(
    <DeleteUserDialog open user={user} onOpenChange={onOpenChange} />,
  );
  const dialog = screen.getByRole("dialog");
  return { ...utils, onOpenChange, dialog };
}

describe("DeleteUserDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a confirmation naming the user", () => {
    const { dialog } = renderDialog();

    expect(
      within(dialog).getByRole("heading", { name: "Delete user" }),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Bob Agent");
    expect(dialog).toHaveTextContent("bob@example.com");
    expect(
      within(dialog).getByRole("button", { name: /^delete user$/i }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /cancel/i }),
    ).toBeInTheDocument();
  });

  it("closes without deleting when cancelled", async () => {
    const u = userEvent.setup();
    const { dialog, onOpenChange } = renderDialog();

    await u.click(within(dialog).getByRole("button", { name: /cancel/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockedAxios.delete).not.toHaveBeenCalled();
  });

  it("DELETEs the user and closes on confirm", async () => {
    mockedAxios.delete.mockResolvedValue({} as AxiosResponse);

    const u = userEvent.setup();
    const { dialog, onOpenChange, queryClient } = renderDialog();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await u.click(within(dialog).getByRole("button", { name: /^delete user$/i }));

    await waitFor(() =>
      expect(mockedAxios.delete).toHaveBeenCalledWith("/api/users/u-9"),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["users"] });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("surfaces a server error and keeps the dialog open", async () => {
    mockedAxios.delete.mockRejectedValue({});

    const u = userEvent.setup();
    const { dialog, onOpenChange } = renderDialog();

    await u.click(within(dialog).getByRole("button", { name: /^delete user$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to delete user",
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
