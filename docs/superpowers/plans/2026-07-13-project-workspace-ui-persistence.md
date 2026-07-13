# Project Workspace UI Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the project workspace's left panel and Assistant panel open state and widths after a browser refresh.

**Architecture:** Store one small, versioned UI-preference object in `localStorage` through a project-page hook. Initialize React state lazily from storage, validate every field, write changes back after render, and keep the existing runtime width clamps so persisted dimensions remain safe on smaller windows.

**Tech Stack:** React 19, TypeScript 6, Vitest, Testing Library, browser `localStorage`.

## Global Constraints

- Keep the change inside the existing project route composition and do not alter backend contracts.
- Persist only non-sensitive presentation preferences.
- Preserve the Assistant panel's current transition behavior and 50% maximum-width rule.
- Do not add ahooks unless the implementation needs more than the existing React primitives can provide.

---

### Task 1: Add the workspace preference hook

**Files:**
- Create: `website/src/views/project/use-project-workspace-preferences.ts`
- Test: `website/src/views/project/use-project-workspace-preferences.test.tsx`

**Interfaces:**
- Consumes: browser `localStorage` and the current default panel values.
- Produces: `useProjectWorkspacePreferences()` with the four preference values and React-compatible setters.

- [x] **Step 1: Write failing tests for defaults, restoration, malformed storage, and persistence**

```tsx
const { result } = renderHook(() => useProjectWorkspacePreferences())
expect(result.current.isAiChatOpen).toBe(false)
act(() => result.current.setLeftPanelWidth(360))
expect(readStoredPreferences().leftPanelWidth).toBe(360)
```

- [x] **Step 2: Run the focused test and verify it fails because the hook does not exist**

Run: `npm --prefix website test -- use-project-workspace-preferences.test.tsx`
Expected: FAIL because `use-project-workspace-preferences` cannot be resolved.

- [x] **Step 3: Implement versioned parsing and lazy persisted state**

```ts
type ProjectWorkspacePreferences = {
  version: 1
  isLeftPanelCollapsed: boolean
  isAiChatOpen: boolean
  leftPanelWidth: number
  aiChatPanelWidth: number
}
```

- [x] **Step 4: Run the focused test and verify it passes**

Run: `npm --prefix website test -- use-project-workspace-preferences.test.tsx`
Expected: all workspace preference tests PASS.

### Task 2: Wire persisted preferences into the project page

**Files:**
- Modify: `website/src/views/project/index.tsx`

**Interfaces:**
- Consumes: `useProjectWorkspacePreferences()`.
- Produces: the same visible panel interactions, initialized and saved through local storage.

- [x] **Step 1: Replace the four standalone panel state declarations with the hook**

```tsx
const {
  isAiChatOpen,
  isLeftPanelCollapsed,
  aiChatPanelWidth,
  leftPanelWidth,
  setAiChatPanelWidth,
  setIsAiChatOpen,
  setIsLeftPanelCollapsed,
  setLeftPanelWidth,
} = useProjectWorkspacePreferences()
```

- [x] **Step 2: Initialize the animated Assistant grid column from the restored open state**

```tsx
const [isAiChatColumnVisible, setIsAiChatColumnVisible] = useState(isAiChatOpen)
```

- [x] **Step 3: Run frontend tests and repository checks**

Run: `npm --prefix website test`
Expected: all Vitest tests PASS.

Run: `task check`
Expected: backend and frontend checks exit 0.

- [x] **Step 4: Run behavior and browser regression suites**

Run: `task test`
Expected: all tests PASS.

Run: `task test-browser`
Expected: the deterministic Playwright workbench smoke PASS, including existing panel interactions.
