import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { ServerError } from "@/components/auth/ServerError";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { UserWithAccess } from "@/lib/services/user-admin";

interface BookOption {
  id: string;
  title: string;
}

interface UsersTableProps {
  users: UserWithAccess[];
  books: BookOption[];
}

const NONE_BOOK_VALUE = "__none__";
const columnHelper = createColumnHelper<UserWithAccess>();

export function UsersTable({ users, books }: UsersTableProps) {
  const [rows, setRows] = useState(users);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);
  const [addSelectionByUserId, setAddSelectionByUserId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const visibleRows = useMemo(
    () => (showPendingOnly ? rows.filter((row) => row.books.length === 0) : rows),
    [rows, showPendingOnly],
  );

  const handleGrantBook = useCallback(
    async (user: UserWithAccess, bookId: string) => {
      if (user.role !== "student") {
        return;
      }

      const selectedBook = books.find((book) => book.id === bookId);
      if (!selectedBook) {
        setError("Wybrana książka nie istnieje");
        setAddSelectionByUserId((prev) => ({ ...prev, [user.id]: NONE_BOOK_VALUE }));
        return;
      }

      const previousBooks = user.books;

      setError(null);
      setLoadingUserId(user.id);

      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== user.id) {
            return row;
          }

          const alreadyAssigned = row.books.some((book) => book.book_id === bookId);
          if (alreadyAssigned) {
            return row;
          }

          return {
            ...row,
            books: [
              ...row.books,
              {
                book_id: bookId,
                title: selectedBook.title,
                granted_at: new Date().toISOString(),
              },
            ],
          };
        }),
      );

      const response = await fetch(`/api/admin/users/${user.id}/grant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ book_id: bookId }),
      });

      if (!response.ok) {
        let responseError = "Nie udało się przyznać dostępu";
        try {
          const payload = (await response.json()) as { error?: string };
          responseError = payload.error ?? responseError;
        } catch {
          // noop
        }

        setRows((prev) =>
          prev.map((row) => {
            if (row.id !== user.id) {
              return row;
            }
            return {
              ...row,
              books: previousBooks,
            };
          }),
        );
        setError(responseError);
      }

      setLoadingUserId(null);
      setAddSelectionByUserId((prev) => ({ ...prev, [user.id]: NONE_BOOK_VALUE }));
    },
    [books],
  );

  const handleRevokeBook = useCallback(async (user: UserWithAccess, bookId: string) => {
    if (user.role !== "student") {
      return;
    }

    const previousBooks = user.books;

    setError(null);
    setLoadingUserId(user.id);

    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== user.id) {
          return row;
        }

        return {
          ...row,
          books: row.books.filter((book) => book.book_id !== bookId),
        };
      }),
    );

    const response = await fetch(`/api/admin/users/${user.id}/revoke?book_id=${encodeURIComponent(bookId)}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      let responseError = "Nie udało się odebrać dostępu";
      try {
        const payload = (await response.json()) as { error?: string };
        responseError = payload.error ?? responseError;
      } catch {
        // noop
      }

      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== user.id) {
            return row;
          }

          return {
            ...row,
            books: previousBooks,
          };
        }),
      );
      setError(responseError);
    }

    setLoadingUserId(null);
  }, []);

  const columns = useMemo(
    () => [
      columnHelper.accessor("email", {
        header: "Email",
        cell: (cell) => <span className="font-medium">{cell.getValue()}</span>,
      }),
      columnHelper.accessor("role", {
        header: "Rola",
        cell: (cell) => (
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-1 text-xs font-medium",
              cell.getValue() === "admin" ? "bg-blue-500/15 text-blue-300" : "bg-muted text-muted-foreground",
            )}
          >
            {cell.getValue()}
          </span>
        ),
      }),
      columnHelper.display({
        id: "books",
        header: "Książki",
        cell: (cell) => {
          const row = cell.row.original;
          if (row.books.length === 0) {
            return <span className="text-muted-foreground">—</span>;
          }

          return (
            <div className="flex flex-wrap gap-1">
              {row.books.map((book) => (
                <span key={`${row.id}-${book.book_id}`} className="bg-muted rounded px-2 py-1 text-xs">
                  {book.title}
                </span>
              ))}
            </div>
          );
        },
      }),
      columnHelper.accessor("created_at", {
        header: "Rejestracja",
        cell: (cell) => {
          const createdAt = new Date(cell.getValue());
          return createdAt.toLocaleDateString("pl-PL");
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "Akcje",
        cell: (cell) => {
          const row = cell.row.original;

          if (row.role !== "student") {
            return <span className="text-muted-foreground text-xs">Brak</span>;
          }

          const assignedBookIds = new Set(row.books.map((book) => book.book_id));
          const availableBooks = books.filter((book) => !assignedBookIds.has(book.id));
          const selectValue = addSelectionByUserId[row.id] ?? NONE_BOOK_VALUE;
          const isLoading = loadingUserId === row.id;

          return (
            <div className="space-y-2">
              <Select
                value={selectValue}
                onValueChange={(value) => {
                  setAddSelectionByUserId((prev) => ({ ...prev, [row.id]: value }));
                  if (value !== NONE_BOOK_VALUE) {
                    void handleGrantBook(row, value);
                  }
                }}
                disabled={isLoading || availableBooks.length === 0}
              >
                <SelectTrigger className="h-8 w-56">
                  <SelectValue placeholder="Dodaj książkę" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_BOOK_VALUE}>Dodaj książkę…</SelectItem>
                  {availableBooks.map((book) => (
                    <SelectItem key={book.id} value={book.id}>
                      {book.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {row.books.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {row.books.map((book) => (
                    <button
                      key={`${row.id}-remove-${book.book_id}`}
                      type="button"
                      onClick={() => {
                        void handleRevokeBook(row, book.book_id);
                      }}
                      disabled={isLoading}
                      className="bg-destructive/10 text-destructive hover:bg-destructive/20 rounded px-2 py-1 text-xs transition-colors disabled:opacity-50"
                    >
                      Usuń: {book.title}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        },
      }),
    ],
    [books, addSelectionByUserId, loadingUserId, handleGrantBook, handleRevokeBook],
  );

  const table = useReactTable({
    data: visibleRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
    onSortingChange: setSorting,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">{visibleRows.length} użytkowników</p>
        <button
          type="button"
          onClick={() => {
            setShowPendingOnly((value) => !value);
          }}
          className={cn(
            "border-border inline-flex h-9 items-center rounded-md border px-3 text-sm transition-colors",
            showPendingOnly ? "bg-primary text-primary-foreground" : "hover:bg-muted",
          )}
        >
          {showPendingOnly ? "Pokaż wszystkich" : "Tylko oczekujący"}
        </button>
      </div>

      <ServerError message={error} />

      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-border bg-muted/30 border-b">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDirection = header.column.getIsSorted();

                  return (
                    <th key={header.id} className="px-4 py-3 text-left font-medium">
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:underline"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span className="text-muted-foreground text-xs">
                            {sortDirection === "asc" ? "↑" : sortDirection === "desc" ? "↓" : "↕"}
                          </span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-muted-foreground px-4 py-6 text-center">
                  Brak użytkowników do wyświetlenia.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-border hover:bg-muted/20 border-b last:border-0">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
