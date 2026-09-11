import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowLeft, Minus, Square, X } from "lucide-react";
import React from "react";
import logo from "../assets/rectangle.svg";
import { ProBadge } from "./ProBadge";

interface TitleBarProps {
  /** Dev-only: when set, shows a "back to wizard" control in the title bar. */
  onDevBack?: () => void;
  /** App-wide controls that would otherwise float over the content. */
  actions?: React.ReactNode;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onDevBack, actions }) => {
  const handleMinimize = async () => {
    try {
      await invoke("minimize-main-window");
    } catch {
      try {
        await getCurrentWindow().minimize();
      } catch {
        // Running in a plain browser during Vite previews.
      }
    }
  };

  const handleMaximize = async () => {
    try {
      await getCurrentWindow().toggleMaximize();
    } catch {
      // Running in a plain browser during Vite previews.
    }
  };

  const handleClose = async () => {
    try {
      await invoke("handle-main-window-close");
    } catch {
      try {
        await getCurrentWindow().close();
      } catch {
        // Running in a plain browser during Vite previews.
      }
    }
  };

  const handleMouseDown = async (e: React.MouseEvent) => {
    // Only react to the primary (left) button on non-button areas.
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) {
      return;
    }
    // The second click of a double-click maximizes. Starting a drag here
    // instead would put Windows into a move loop that restores the window
    // the moment the cursor moves, so the two paths must be mutually exclusive.
    if (e.detail === 2) {
      await handleMaximize();
      return;
    }
    try {
      await getCurrentWindow().startDragging();
    } catch {
      // Running in a plain browser during Vite previews.
    }
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className="pointer-events-auto fixed top-0 right-0 left-0 z-9999 flex h-10 items-stretch justify-between bg-background/80 pl-4 backdrop-blur supports-backdrop-filter:bg-background/60"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {onDevBack && (
          <button
            type="button"
            aria-label="Back to setup wizard"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDevBack();
            }}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground dark:hover:bg-foreground/10"
          >
            <ArrowLeft size={14} strokeWidth={2.2} />
            Wizard
          </button>
        )}
        <img src={logo} alt="Mote Desktop logo" className="h-6 w-6" />
        <span className="text-base">Mote Desktop</span>
        {/* The tier mark sits with the product name rather than the page
          header: it describes the build, not whatever screen is open. */}
        <ProBadge className="ml-0.5" />
      </div>
      <div className="flex items-stretch">
        {actions}
        <button
          type="button"
          aria-label="Minimize window"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={async (e) => {
            e.stopPropagation();
            await handleMinimize();
          }}
          className="flex aspect-square h-full items-center justify-center text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground dark:hover:bg-foreground/10"
        >
          <Minus size={16} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          aria-label="Maximize window"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={async (e) => {
            e.stopPropagation();
            await handleMaximize();
          }}
          className="flex aspect-square h-full items-center justify-center text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground dark:hover:bg-foreground/10"
        >
          <Square size={13} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          aria-label="Close window"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={async (e) => {
            e.stopPropagation();
            await handleClose();
          }}
          className="flex aspect-square h-full items-center justify-center text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground dark:hover:bg-foreground/10 "
        >
          <X size={16} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
};
