---
paths:
  - "apps/web/**"
---

# Asking before a change

Whether a button asks "are you sure?" before it changes data is a product decision, made per
button by the person you are working with - not something the code decides on its own.

**Before you build or change a button that changes stored data, ask the person whether it
needs a confirm dialog.** Build one only when they say yes. Never add one unasked, and never
remove an existing one without asking.

## Which buttons this covers

| Ask about | Do not ask about |
|---|---|
| a button that creates (sign up, add, create), updates (save, rename), removes (delete, revoke), sends or publishes - anything that calls a Server Action or a write | sign-in and sign-out, which change no stored data; a button that only opens something, navigates, filters or sorts; a Cancel |

When it is unclear: if the click changes data that is still there after a reload, ask.

## How to ask

Name the button and what it changes, so the answer is easy to give:

> The "Delete invoice" button removes the invoice and its payments, and it cannot be undone.
> Should it ask for confirmation first?

Ask once per button, alongside the rest of the task's questions - not one question per
click path.

## When the answer is yes

- **A popup, never inline text, a toast or `window.confirm()`:** shadcn's `AlertDialog`,
  owned by the same component as the button that opens it (`component-design.md`). Review
  what `shadcn add alert-dialog` changes before keeping it - it can offer to overwrite the
  vendored `button.tsx` and add packages this app does not use.
- **The title asks the action, naming the thing it acts on:** "Delete invoice INV-42?" -
  never "Are you sure?" The description says what will happen, and says plainly when it
  cannot be undone.
- **Cancel has the focus when it opens,** so a stray Enter never confirms. The confirm button
  repeats the verb - "Delete invoice", never "Yes" or "OK" - and uses the destructive variant
  when the change cannot be undone.
- **While the change runs,** the confirm button shows a pending label and both buttons are
  disabled, so it cannot run twice. A failure shows as a toast, and the popup closes.
- **A form is checked first,** so the popup only asks about valid values. A form that already
  opens in a popup does not get a second one on top: if it needs confirming, its own title and
  submit button name the change ("Rename invoice INV-42", "Rename invoice").
