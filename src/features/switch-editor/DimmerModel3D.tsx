import { useTheme } from "@/context/ThemeContext";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CanvasTexture,
  ExtrudeGeometry,
  MathUtils,
  PMREMGenerator,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  type Group,
  type Mesh,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** The four buttons of a Hue dimmer switch (v2, RWL022), by control id. */
export type DimmerButton = 1 | 2 | 3 | 4;

// One scene unit is 100 mm. Sizes follow the published dimensions (the wall
// plate is 80 × 125 mm, 15 mm deep with the remote) and product renders. No
// brand marks are drawn on the model.
const mm = (value: number) => value / 100;

const PLATE = {
  width: mm(80),
  height: mm(125),
  depth: mm(4.5),
  radius: mm(2),
  bevel: mm(0.5),
};
const REMOTE = {
  width: mm(35),
  height: mm(92),
  /** The outline's corners: tight, as on the device. */
  radius: mm(4.5),
  /** The back body, inset a little and rounded off toward the wall plate. */
  body: { depth: mm(8.5), inset: mm(0.7), bevel: mm(2.6) },
  /** The flat key layer users press, with a crisp front edge. */
  keys: { depth: mm(3), bevel: mm(0.45) },
};
/** The gap between keys, which shows the body beneath. */
const GROOVE = mm(0.6);
/** Corner radius where a key meets a groove. */
const GROOVE_RADIUS = mm(0.6);
// The face splits top to bottom into on/off, the brighten/dim rocker and Hue.
const SEGMENT_SHARES = [0.305, 0.34, 0.355];

const KEY_COLOR = "#f8f8f6";
const BODY_COLOR = "#ededeb";
const PLATE_COLOR = "#f4f4f2";
const PRINT_COLOR = "#a6a6a3";
const SELECTED_COLOR = "#d6a84f";
const HOVER_COLOR = "#efe1c0";

type Corners = [tl: number, tr: number, br: number, bl: number];

/** A rectangle centred on the origin with its own radius at each corner. */
const roundedRect = (
  width: number,
  height: number,
  [tl, tr, br, bl]: Corners,
) => {
  const x = width / 2;
  const y = height / 2;
  const shape = new Shape();
  shape.moveTo(-x + bl, -y);
  shape.lineTo(x - br, -y);
  shape.absarc(x - br, -y + br, br, -Math.PI / 2, 0, false);
  shape.lineTo(x, y - tr);
  shape.absarc(x - tr, y - tr, tr, 0, Math.PI / 2, false);
  shape.lineTo(-x + tl, y);
  shape.absarc(-x + tl, y - tl, tl, Math.PI / 2, Math.PI, false);
  shape.lineTo(-x, -y + bl);
  shape.absarc(-x + bl, -y + bl, bl, Math.PI, Math.PI * 1.5, false);
  return shape;
};

const all = (radius: number): Corners => [radius, radius, radius, radius];

/** A flat-faced slab from z = 0 to `depth`, its outline exactly as given. */
const slab = (
  width: number,
  height: number,
  corners: Corners,
  depth: number,
  bevel: number,
) => {
  const geometry = new ExtrudeGeometry(roundedRect(width, height, corners), {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 6,
    curveSegments: 20,
  });
  geometry.translate(0, 0, bevel);
  return geometry;
};

/** A printed mark drawn to a texture. */
const printTexture = (draw: (ctx: CanvasRenderingContext2D) => void) => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = PRINT_COLOR;
  ctx.fillStyle = PRINT_COLOR;
  ctx.lineCap = "round";
  draw(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

const drawPower = (ctx: CanvasRenderingContext2D) => {
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.arc(128, 140, 72, -Math.PI * 0.32, Math.PI * 1.32);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(128, 40);
  ctx.lineTo(128, 128);
  ctx.stroke();
};

/** A ring with short rays; brighten's rays are longer than dim's. */
const drawSun = (ctx: CanvasRenderingContext2D, rays: number) => {
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 30, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const inner = 52;
    ctx.beginPath();
    ctx.moveTo(128 + Math.cos(angle) * inner, 128 + Math.sin(angle) * inner);
    ctx.lineTo(
      128 + Math.cos(angle) * (inner + rays),
      128 + Math.sin(angle) * (inner + rays),
    );
    ctx.stroke();
  }
};

/** A neutral mark for the bottom key, in place of the maker's logo. */
const drawScenes = (ctx: CanvasRenderingContext2D) => {
  ctx.lineWidth = 11;
  for (const [x, y] of [
    [96, 96],
    [160, 96],
    [96, 160],
    [160, 160],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.stroke();
  }
};

/** The short dash just above the groove under on/off. */
const drawDash = (ctx: CanvasRenderingContext2D) => {
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(84, 128);
  ctx.lineTo(172, 128);
  ctx.stroke();
};

interface Segment {
  /** The buttons on this key: one, or brighten and dim on the rocker. */
  buttons: DimmerButton[];
  top: number;
  bottom: number;
  corners: Corners;
}

/** The face's three keys, top to bottom, with the grooves between them. */
const SEGMENTS: Segment[] = (() => {
  const usable = REMOTE.height - GROOVE * 2;
  const R = REMOTE.radius;
  const g = GROOVE_RADIUS;
  const corners: Corners[] = [
    [R, R, g, g],
    [g, g, g, g],
    [g, g, R, R],
  ];
  const buttons: DimmerButton[][] = [[1], [2, 3], [4]];
  let top = REMOTE.height / 2;
  return SEGMENT_SHARES.map((share, index) => {
    const bottom = top - usable * share;
    const segment = {
      buttons: buttons[index],
      top,
      bottom,
      corners: corners[index],
    };
    top = bottom - GROOVE;
    return segment;
  });
})();

interface PrintSpec {
  draw: (ctx: CanvasRenderingContext2D) => void;
  size: number;
  /** Height on the key, from its centre. */
  y: number;
}

const printsFor = (segment: Segment): PrintSpec[] => {
  const height = segment.top - segment.bottom;
  if (segment.buttons[0] === 1)
    return [
      { draw: drawPower, size: mm(6), y: mm(2) },
      { draw: drawDash, size: mm(3), y: -height / 2 + mm(1.3) },
    ];
  if (segment.buttons[0] === 4)
    return [{ draw: drawScenes, size: mm(6), y: 0 }];
  return [
    { draw: (ctx) => drawSun(ctx, 30), size: mm(5.5), y: height * 0.22 },
    { draw: (ctx) => drawSun(ctx, 16), size: mm(5.5), y: -height * 0.22 },
  ];
};

/** A flat print lying on a key's face. */
const Print = ({ draw, size, y, z }: PrintSpec & { z: number }) => {
  const texture = useMemo(() => printTexture(draw), [draw]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[0, y, z]} raycast={() => null} renderOrder={2}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-4}
        toneMapped={false}
      />
    </mesh>
  );
};

/**
 * One key: a flat slab with a crisp edge. On/off and the bottom key press in
 * when chosen; the rocker tips toward its chosen half. The chosen part of the
 * face is lit, and a hovered one tinted.
 */
const Key = ({
  segment,
  selected,
  hovered,
  onHover,
  onSelect,
}: {
  segment: Segment;
  selected: DimmerButton | null;
  hovered: DimmerButton | null;
  onHover: (button: DimmerButton | null) => void;
  onSelect: (button: DimmerButton) => void;
}) => {
  const tilt = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  const width = REMOTE.width;
  const height = segment.top - segment.bottom;
  const rocker = segment.buttons.length === 2;
  const geometry = useMemo(
    () =>
      slab(
        width,
        height,
        segment.corners,
        REMOTE.keys.depth,
        REMOTE.keys.bevel,
      ),
    [width, height, segment],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  const prints = useMemo(() => printsFor(segment), [segment]);

  // The lit face: the whole key, or one half of the rocker.
  const faceFor = (button: DimmerButton) => {
    const inset = REMOTE.keys.bevel;
    const [tl, tr, br, bl] = segment.corners.map((r) =>
      Math.max(r - inset, mm(0.1)),
    ) as Corners;
    const w = width - inset * 2;
    if (!rocker) {
      const shape = roundedRect(w, height - inset * 2, [tl, tr, br, bl]);
      return { geometry: new ShapeGeometry(shape, 20), y: 0 };
    }
    const half = height / 2 - inset;
    const upper = button === segment.buttons[0];
    const shape = roundedRect(w, half, upper ? [tl, tr, 0, 0] : [0, 0, br, bl]);
    return {
      geometry: new ShapeGeometry(shape, 20),
      y: upper ? half / 2 : -half / 2,
    };
  };
  const lit = segment.buttons.filter(
    (button) => button === selected || button === hovered,
  );
  const faces = useMemo(
    () =>
      lit.map((button) => ({
        button,
        color: button === selected ? SELECTED_COLOR : HOVER_COLOR,
        ...faceFor(button),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lit.join(","), selected],
  );
  useEffect(
    () => () => faces.forEach((face) => face.geometry.dispose()),
    [faces],
  );

  const buttonAt = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (!rocker || !mesh.current) return segment.buttons[0];
    const local = mesh.current.worldToLocal(event.point.clone());
    return local.y >= 0 ? segment.buttons[0] : segment.buttons[1];
  };

  useFrame((_, delta) => {
    if (!tilt.current) return;
    const pressed = selected != null && segment.buttons.includes(selected);
    const depth = pressed && !rocker ? -mm(0.8) : 0;
    const angle =
      pressed && rocker ? (selected === segment.buttons[0] ? -0.03 : 0.03) : 0;
    tilt.current.position.z = MathUtils.damp(
      tilt.current.position.z,
      depth,
      14,
      delta,
    );
    tilt.current.rotation.x = MathUtils.damp(
      tilt.current.rotation.x,
      angle,
      14,
      delta,
    );
  });

  const faceZ = REMOTE.keys.depth + mm(0.02);

  return (
    <group
      position={[
        0,
        (segment.top + segment.bottom) / 2,
        REMOTE.body.depth - mm(0.5),
      ]}
    >
      <group ref={tilt}>
        <mesh
          ref={mesh}
          geometry={geometry}
          castShadow
          receiveShadow
          onPointerMove={(event) => {
            event.stopPropagation();
            onHover(buttonAt(event));
          }}
          onPointerOut={() => onHover(null)}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(buttonAt(event));
          }}
        >
          <meshPhysicalMaterial
            color={KEY_COLOR}
            roughness={0.4}
            clearcoat={0.2}
            clearcoatRoughness={0.5}
          />
        </mesh>
        {faces.map((face) => (
          <mesh
            key={face.button}
            geometry={face.geometry}
            position={[0, face.y, faceZ]}
            raycast={() => null}
            renderOrder={1}
          >
            <meshPhysicalMaterial
              color={face.color}
              roughness={0.4}
              clearcoat={0.2}
              clearcoatRoughness={0.5}
              polygonOffset
              polygonOffsetFactor={-1}
            />
          </mesh>
        ))}
        {prints.map((print, index) => (
          <Print key={index} {...print} z={faceZ + mm(0.1)} />
        ))}
      </group>
    </group>
  );
};

/** Soft studio reflections, so the edges and faces read. */
/** How far the wheel can zoom, relative to the fitted view. */
const ZOOM_RANGE = { closest: 0.45, farthest: 1.6 };
/** The view the editor opens on, and a double-click returns to. */
const DEFAULT_VIEW = { yaw: 0.5, pitch: 0.12, zoom: 1.15 };
/** Room left around the switch when it is fitted to the view. */
const FIT_MARGIN = 1.18;

/**
 * Fits the whole switch to the canvas, however narrow, and lets the wheel
 * zoom a little in or out from there. A double-click returns to the fit.
 */
const FitCamera = () => {
  const { camera, size, gl } = useThree();
  const zoom = useRef(DEFAULT_VIEW.zoom);

  useEffect(() => {
    const element = gl.domElement;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoom.current = MathUtils.clamp(
        zoom.current * Math.exp(event.deltaY * 0.0012),
        ZOOM_RANGE.closest,
        ZOOM_RANGE.farthest,
      );
    };
    const onReset = () => {
      zoom.current = DEFAULT_VIEW.zoom;
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("dblclick", onReset);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("dblclick", onReset);
    };
  }, [gl]);

  useFrame((_, delta) => {
    if (!("fov" in camera)) return;
    // The distance at which the plate fills the view's height, or its width
    // when the view is the narrower of the two.
    const halfFov = MathUtils.degToRad(camera.fov / 2);
    const aspect = size.width / Math.max(size.height, 1);
    const byHeight = PLATE.height / 2 / Math.tan(halfFov);
    const byWidth = PLATE.width / 2 / (Math.tan(halfFov) * aspect);
    const target = Math.max(byHeight, byWidth) * FIT_MARGIN * zoom.current;
    camera.position.z = MathUtils.damp(camera.position.z, target, 10, delta);
  });
  return null;
};

const StudioLight = () => {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      environment.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
};

const Dimmer = ({
  selected,
  configurable,
  onSelect,
}: {
  selected: DimmerButton | null;
  configurable: (button: DimmerButton) => boolean;
  onSelect: (button: DimmerButton) => void;
}) => {
  const turn = useRef<Group>(null);
  const [hovered, setHovered] = useState<DimmerButton | null>(null);
  const plate = useMemo(
    () =>
      slab(
        PLATE.width,
        PLATE.height,
        all(PLATE.radius),
        PLATE.depth,
        PLATE.bevel,
      ),
    [],
  );
  const body = useMemo(
    () =>
      slab(
        REMOTE.width - REMOTE.body.inset * 2,
        REMOTE.height - REMOTE.body.inset * 2,
        all(REMOTE.radius - REMOTE.body.inset),
        REMOTE.body.depth,
        REMOTE.body.bevel,
      ),
    [],
  );
  useEffect(
    () => () => {
      plate.dispose();
      body.dispose();
    },
    [plate, body],
  );
  const drag = useRef<{ x: number; y: number } | null>(null);
  const rotation = useRef({
    yaw: DEFAULT_VIEW.yaw,
    pitch: DEFAULT_VIEW.pitch,
  });
  const { gl } = useThree();
  useEffect(() => {
    const element = gl.domElement;
    const onReset = () => {
      rotation.current = { yaw: DEFAULT_VIEW.yaw, pitch: DEFAULT_VIEW.pitch };
    };
    element.addEventListener("dblclick", onReset);
    return () => element.removeEventListener("dblclick", onReset);
  }, [gl]);

  useEffect(() => {
    document.body.style.cursor =
      hovered != null && configurable(hovered) ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered, configurable]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!drag.current) return;
      const dx = event.clientX - drag.current.x;
      const dy = event.clientY - drag.current.y;
      drag.current = { x: event.clientX, y: event.clientY };
      rotation.current.yaw = MathUtils.clamp(
        rotation.current.yaw + dx * 0.008,
        -1.1,
        1.1,
      );
      rotation.current.pitch = MathUtils.clamp(
        rotation.current.pitch + dy * 0.006,
        -0.6,
        0.6,
      );
    };
    const onUp = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  useFrame((_, delta) => {
    if (!turn.current) return;
    turn.current.rotation.y = MathUtils.damp(
      turn.current.rotation.y,
      rotation.current.yaw,
      8,
      delta,
    );
    turn.current.rotation.x = MathUtils.damp(
      turn.current.rotation.x,
      rotation.current.pitch,
      8,
      delta,
    );
  });

  return (
    <group
      ref={turn}
      onPointerDown={(event) => {
        drag.current = { x: event.clientX, y: event.clientY };
      }}
    >
      {/* Centred on the whole switch's depth, so it turns about its middle. */}
      <group position={[0, 0, -mm(7.5)]}>
        <mesh geometry={plate} position={[0, 0, -PLATE.depth]} receiveShadow>
          <meshStandardMaterial color={PLATE_COLOR} roughness={0.55} />
        </mesh>
        <group position={[0, mm(1), 0]}>
          <mesh geometry={body} castShadow receiveShadow>
            <meshStandardMaterial color={BODY_COLOR} roughness={0.5} />
          </mesh>
          {SEGMENTS.map((segment) => (
            <Key
              key={segment.top}
              segment={segment}
              selected={selected}
              hovered={hovered}
              onHover={setHovered}
              onSelect={(button) => configurable(button) && onSelect(button)}
            />
          ))}
        </group>
      </group>
    </group>
  );
};

/**
 * A Hue dimmer switch (v2) in 3D. Click a button to choose it; drag to turn
 * the switch. The chosen button lights up and presses in; the brighten/dim
 * rocker tips toward the chosen half.
 */
export const DimmerModel3D = ({
  selected,
  configurable,
  onSelect,
  className,
}: {
  selected: DimmerButton | null;
  /** Whether a button has settings, so it can be chosen. */
  configurable: (button: DimmerButton) => boolean;
  onSelect: (button: DimmerButton) => void;
  className?: string;
}) => {
  const { resolvedThemeMode } = useTheme();
  const dark = resolvedThemeMode === "dark";
  return (
    <Canvas
      className={className}
      shadows
      camera={{ position: [0, 0, 2.5], fov: 36 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <StudioLight />
      <FitCamera />
      <ambientLight intensity={dark ? 0.35 : 0.5} />
      <directionalLight
        position={[1.2, 1.8, 2.6]}
        intensity={dark ? 1.5 : 1.8}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-radius={6}
        shadow-camera-left={-1}
        shadow-camera-right={1}
        shadow-camera-top={1}
        shadow-camera-bottom={-1}
      />
      <directionalLight position={[-2, -0.5, 1.5]} intensity={0.3} />
      <Dimmer
        selected={selected}
        configurable={configurable}
        onSelect={onSelect}
      />
    </Canvas>
  );
};
