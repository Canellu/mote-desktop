import { createContext, useContext } from "react";

/**
 * Whether the content is inside an open sheet or dialog. A dialog opened on
 * top of one draws its own, see-through backdrop: Base UI renders none for a
 * nested dialog by default, so a click outside it would land on the layer
 * below and close neither, or the wrong one. One click closes one layer.
 */
export const OverlayLayerContext = createContext(false);

export const useInsideOverlayLayer = () => useContext(OverlayLayerContext);
