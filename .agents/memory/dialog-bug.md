---
name: Dialog removeChild fix
description: How to avoid the React/Radix removeChild DOM error with Dialog components
---

## Rule
Never wrap a plain `<div>` (or any non-button element) with `<DialogTrigger asChild>`.

**Why:** Radix Dialog tries to return focus to the trigger element on close. When the trigger is a non-focusable div, this causes a DOM `removeChild` error in certain React 18 / Radix UI versions, especially under StrictMode.

## How to apply
Instead of:
```jsx
<Dialog>
  <DialogTrigger asChild>
    <div onClick={...}>Card content</div>
  </DialogTrigger>
  ...
</Dialog>
```

Use controlled state:
```jsx
const [open, setOpen] = useState(false);
<div onClick={() => setOpen(true)}>Card content</div>
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>...</DialogContent>
</Dialog>
```

This pattern is used in `directory/index.tsx` for `VolunteerCard` and `HelpRequestCard`, and in `united/index.tsx`.
