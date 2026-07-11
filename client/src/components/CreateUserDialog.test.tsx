import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios, { type AxiosResponse } from "axios";

import { renderWithQuery } from "@/test/render";
import CreateUserDialog from "./CreateUserDialog";

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

// Opens the dialog and returns its element for scoped queries.
async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /new user/i }));
  return screen.getByRole("dialog");
}

describe("CreateUserDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the modal with name, email, and password fields", async () => {
    const user = userEvent.setup();
    renderWithQuery(<CreateUserDialog />);

    // Closed initially.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const dialog = await openDialog(user);
    expect(within(dialog).getByLabelText("Name")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Email")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Password")).toBeInTheDocument();
  });

  it("shows validation messages and does not submit when the form is invalid", async () => {
    const user = userEvent.setup();
    renderWithQuery(<CreateUserDialog />);
    const dialog = await openDialog(user);

    // Submit empty.
    await user.click(within(dialog).getByRole("button", { name: /create user/i }));

    expect(
      await screen.findByText("Name must be at least 3 characters"),
    ).toBeInTheDocument();
    expect(screen.getByText("Email is required")).toBeInTheDocument();
    expect(
      screen.getByText("Password must be at least 8 characters"),
    ).toBeInTheDocument();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("rejects a too-short name and password", async () => {
    const user = userEvent.setup();
    renderWithQuery(<CreateUserDialog />);
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByLabelText("Name"), "Jo");
    await user.type(within(dialog).getByLabelText("Email"), "jo@example.com");
    await user.type(within(dialog).getByLabelText("Password"), "short");
    await user.click(within(dialog).getByRole("button", { name: /create user/i }));

    expect(
      await screen.findByText("Name must be at least 3 characters"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Password must be at least 8 characters"),
    ).toBeInTheDocument();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("creates the user and closes the modal on a valid submit", async () => {
    mockedAxios.post.mockResolvedValue({
      data: { user: {} },
    } as AxiosResponse);

    const user = userEvent.setup();
    const { queryClient } = renderWithQuery(<CreateUserDialog />);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByLabelText("Name"), "Jane Doe");
    await user.type(within(dialog).getByLabelText("Email"), "jane@example.com");
    await user.type(within(dialog).getByLabelText("Password"), "supersecret");
    await user.click(within(dialog).getByRole("button", { name: /create user/i }));

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith("/api/users", {
        name: "Jane Doe",
        email: "jane@example.com",
        password: "supersecret",
      });
    });

    // List query is invalidated so the new user shows up.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["users"] });

    // Modal closes.
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("surfaces a server error and keeps the modal open", async () => {
    mockedAxios.post.mockRejectedValue({});

    const user = userEvent.setup();
    renderWithQuery(<CreateUserDialog />);
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByLabelText("Name"), "Jane Doe");
    await user.type(within(dialog).getByLabelText("Email"), "jane@example.com");
    await user.type(within(dialog).getByLabelText("Password"), "supersecret");
    await user.click(within(dialog).getByRole("button", { name: /create user/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to create user",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("rejects a malformed email with a format message", async () => {
    const user = userEvent.setup();
    renderWithQuery(<CreateUserDialog />);
    const dialog = await openDialog(user);

    // Name and password are valid, so only the email rule can fail here.
    await user.type(within(dialog).getByLabelText("Name"), "Jane Doe");
    await user.type(within(dialog).getByLabelText("Email"), "not-an-email");
    await user.type(within(dialog).getByLabelText("Password"), "supersecret");
    await user.click(within(dialog).getByRole("button", { name: /create user/i }));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("trims surrounding whitespace before submitting", async () => {
    mockedAxios.post.mockResolvedValue({
      data: { user: {} },
    } as AxiosResponse);

    const user = userEvent.setup();
    renderWithQuery(<CreateUserDialog />);
    const dialog = await openDialog(user);

    // The schema's .trim() runs as part of validation, so the mutation should
    // receive the trimmed name — not the raw padded input.
    await user.type(within(dialog).getByLabelText("Name"), "  Jane Doe  ");
    await user.type(within(dialog).getByLabelText("Email"), "jane@example.com");
    await user.type(within(dialog).getByLabelText("Password"), "supersecret");
    await user.click(within(dialog).getByRole("button", { name: /create user/i }));

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith("/api/users", {
        name: "Jane Doe",
        email: "jane@example.com",
        password: "supersecret",
      });
    });
  });

  it("disables the submit button while the create request is in flight", async () => {
    // A promise that never settles keeps the mutation in its pending state.
    mockedAxios.post.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    renderWithQuery(<CreateUserDialog />);
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByLabelText("Name"), "Jane Doe");
    await user.type(within(dialog).getByLabelText("Email"), "jane@example.com");
    await user.type(within(dialog).getByLabelText("Password"), "supersecret");

    const submit = within(dialog).getByRole("button", { name: /create user/i });
    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
  });
});
