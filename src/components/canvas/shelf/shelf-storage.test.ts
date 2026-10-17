import { afterEach, describe, expect, it } from "vitest"
import {
  CANVAS_LAYOUT_EVENT,
  loadCanvasLayoutMode,
  loadShelfConversationOrder,
  loadShelfFolderOrder,
  loadShelfCollapsedFolderIds,
  loadShelfExpandedConversationIds,
  loadShelfShowAll,
  loadShelfShowAllConversationFolderIds,
  loadShelfSessionRailOpen,
  loadShelfVisibleConversationIds,
  loadShelfVisibleFolderIds,
  saveCanvasLayoutMode,
  saveShelfCollapsedFolderIds,
  saveShelfExpandedConversationIds,
  saveShelfSessionRailOpen,
  saveShelfShowAll,
  saveShelfShowAllConversationFolderIds,
  saveShelfConversationOrder,
  saveShelfFolderOrder,
  saveShelfVisibleConversationIds,
  saveShelfVisibleFolderIds,
  setCanvasLayoutMode,
} from "./shelf-storage"

afterEach(() => localStorage.clear())

describe("shelf storage", () => {
  it("defaults layout to shelf", () => {
    expect(loadCanvasLayoutMode()).toBe("shelf")
  })

  it("persists a layout change and tells listeners", () => {
    const seen: string[] = []
    const on = (event: Event) => {
      seen.push((event as CustomEvent<string>).detail)
    }
    window.addEventListener("codeg:canvas-layout", on)
    setCanvasLayoutMode("board")
    expect(loadCanvasLayoutMode()).toBe("board")
    expect(seen).toEqual(["board"])
    expect(CANVAS_LAYOUT_EVENT).toBe("codeg:canvas-layout")
    window.removeEventListener("codeg:canvas-layout", on)
  })

  it("round-trips board then shelf", () => {
    saveCanvasLayoutMode("board")
    expect(loadCanvasLayoutMode()).toBe("board")
    saveCanvasLayoutMode("shelf")
    expect(loadCanvasLayoutMode()).toBe("shelf")
  })

  it("ignores garbage layout values", () => {
    localStorage.setItem("workspace:canvas-layout", JSON.stringify("kanban"))
    expect(loadCanvasLayoutMode()).toBe("shelf")
  })

  it("defaults layout when the stored json is corrupt", () => {
    localStorage.setItem("workspace:canvas-layout", "{")
    expect(loadCanvasLayoutMode()).toBe("shelf")
  })

  it("round-trips expanded ids", () => {
    saveShelfExpandedConversationIds([3, 9])
    expect(loadShelfExpandedConversationIds()).toEqual([3, 9])
  })

  it("round-trips collapsed folder ids", () => {
    saveShelfCollapsedFolderIds([1, 4])
    expect(loadShelfCollapsedFolderIds()).toEqual([1, 4])
  })

  it("defaults id lists when storage is corrupt or not a list", () => {
    localStorage.setItem("workspace:shelf-expanded-conversations", "nope")
    localStorage.setItem(
      "workspace:shelf-collapsed-folders",
      JSON.stringify({ ids: [1] })
    )
    expect(loadShelfExpandedConversationIds()).toEqual([])
    expect(loadShelfCollapsedFolderIds()).toEqual([])
  })

  it("keeps only integer ids", () => {
    localStorage.setItem(
      "workspace:shelf-expanded-conversations",
      JSON.stringify([3, "9", 9.2, null, 4])
    )
    expect(loadShelfExpandedConversationIds()).toEqual([3, 4])
  })

  it("treats missing visible-folder list as unedited", () => {
    expect(loadShelfVisibleFolderIds()).toBeNull()
    saveShelfVisibleFolderIds([2, 5])
    expect(loadShelfVisibleFolderIds()).toEqual([2, 5])
    saveShelfVisibleFolderIds(null)
    expect(loadShelfVisibleFolderIds()).toBeNull()
  })

  it("round-trips show-all", () => {
    expect(loadShelfShowAll()).toBe(false)
    saveShelfShowAll(true)
    expect(loadShelfShowAll()).toBe(true)
  })

  it("treats missing visible-conversation list as unedited", () => {
    expect(loadShelfVisibleConversationIds()).toBeNull()
    saveShelfVisibleConversationIds([7, 9])
    expect(loadShelfVisibleConversationIds()).toEqual([7, 9])
    saveShelfVisibleConversationIds(null)
    expect(loadShelfVisibleConversationIds()).toBeNull()
  })

  it("round-trips folders whose rows show every conversation", () => {
    expect(loadShelfShowAllConversationFolderIds()).toEqual([])
    saveShelfShowAllConversationFolderIds([10, 20])
    expect(loadShelfShowAllConversationFolderIds()).toEqual([10, 20])
  })

  it("round-trips folder and per-folder conversation order", () => {
    expect(loadShelfFolderOrder()).toBeNull()
    saveShelfFolderOrder([20, 10])
    expect(loadShelfFolderOrder()).toEqual([20, 10])
    saveShelfConversationOrder({ 10: [8, 7] })
    expect(loadShelfConversationOrder()).toEqual({ 10: [8, 7] })
  })

  it("keeps the session rail closed unless the stored json is true", () => {
    expect(loadShelfSessionRailOpen()).toBe(false)
    saveShelfSessionRailOpen(true)
    expect(loadShelfSessionRailOpen()).toBe(true)
    expect(localStorage.getItem("codeg.shelf.sessionRailOpen")).toBe("true")
    saveShelfSessionRailOpen(false)
    expect(loadShelfSessionRailOpen()).toBe(false)
    localStorage.setItem("codeg.shelf.sessionRailOpen", "{")
    expect(loadShelfSessionRailOpen()).toBe(false)
    localStorage.setItem("codeg.shelf.sessionRailOpen", JSON.stringify("true"))
    expect(loadShelfSessionRailOpen()).toBe(false)
  })
})
