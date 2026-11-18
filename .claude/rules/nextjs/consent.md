---
paths:
  - "apps/web/**"
---

# Consent before a change

Every button that changes stored data asks first, in a popup, and runs only once the
person confirms. Nothing is written on a single click.

## Which buttons ask

| Asks | Does not ask |
|---|---|
| a button that creates (sign up, add, create), updates (save, rename), removes (delete, revoke), sends or publishes - anything that calls a Server Action or a write to `apps/api` | sign-in and sign-out, which change no stored data; a button that only opens something, navigates, filters or sorts; a Cancel |

When it is unclear: if the click changes data that is still there after a reload, it asks.

## The popup

Always the shared `ConfirmChange` popup (`src/components/shared/confirm-change.tsx`), built on
shadcn's `AlertDialog`. A modal: it covers the page, keeps focus inside, and Escape or a
click outside cancels. Never an inline message, a toast, or the browser's `window.confirm()`.

- **The title asks the action, naming the thing it acts on:** "Delete invoice INV-42?" -
  never "Are you sure?"
- **The description says what will happen,** in the person's terms, and says so plainly when
  it cannot be undone: "We will send a confirmation email to asha@example.com." / "Its
  payments are removed and cannot be recovered."
- **Two buttons.** Cancel, which has the focus when the popup opens so a stray Enter never
  confirms, and a confirm button labelled with the same verb as the button that opened it -
  "Delete invoice", "Create account" - never "Yes" or "OK". An action that cannot be undone
  uses the destructive variant.
- **While the change runs,** the confirm button shows a pending label ("Deleting...") and
  both buttons are disabled, so it cannot run twice. The popup closes when the change
  succeeds. A failure is a toast, as every failure is (`web-data-access.md`), and the popup
  closes with it.

## With a form

The form is checked first, and the popup asks about values that are already valid:

1. Submit runs react-hook-form's `handleSubmit`. Invalid input shows its field errors, and
   no popup opens.
2. Valid input opens the popup, which names what matters in it - the email an account is
   created for, the amount an invoice is sent for.
3. Confirm runs the write. Cancel closes the popup and leaves the form as it was, values kept.

A field error the server returns - `{ ok: false, field, problem }` from a Server Action
(`code-placement.md`) - closes the popup and shows the error on that field of the form.

## A form in a popup

When the form itself opens in a popup - Rename, Edit details, Add member - that popup is the
consent: opening it and pressing a button that names the change is the second, deliberate
step. No `ConfirmChange` opens over it; a popup never opens on top of another.

```
+ Rename invoice INV-42 ---------+
| Name  [ March retainer      ]  |
|  [ Cancel ]  [ Rename invoice ]|
+--------------------------------+
```

- **The title names the change and the thing,** as a confirmation's would: "Rename invoice
  INV-42", "Remove Asha from the team".
- **The submit button names the action** - "Rename invoice", never "Save", "Submit" or "OK" -
  and uses the destructive variant when the change cannot be undone.
- **Everything else is as above.** The form is checked before anything is written; while the
  change runs the submit shows a pending label and both buttons are disabled; the popup
  closes when it succeeds; a field error from the server shows on its field, in the popup.

It is built on shadcn's `Dialog`, and the button that opens it and the popup are one
component (`component-design.md`): `RenameInvoiceDialog`.

## Where it lives

- **`ConfirmChange` is the one confirmation popup,** in `src/components/shared/`, with props
  for the title, the description, the confirm label, the tone (`default` / `destructive`),
  the pending state and `onConfirm`. Every asking button and every form on a page uses it;
  none builds its own. A form that is already in a popup does not - see above.
- **A button and its popup are one component,** as `component-design.md` says of every
  trigger and its overlay: `DeleteInvoiceButton` owns its `ConfirmChange` and its open state.
- **Not built yet.** `ConfirmChange` and shadcn's `alert-dialog` arrive with the first
  button that needs them - `shadcn add alert-dialog`, which uses the `radix-ui` package
  already installed. The sign-up form is the first: it writes today without asking.
