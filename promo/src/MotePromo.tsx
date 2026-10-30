import React from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Geist";

const { fontFamily } = loadFont("normal", { weights: ["400", "600", "700"] });

// Palette from mote-website/DESIGN.md.
const C = {
  night: "#0b0c0b",
  text: "#f5f5f1",
  muted: "#a9ada6",
  orange: "#ff4500",
  golden: "#ffb342",
  sunset: "#ff7d6b",
  aurora: "#71e0cf",
  violet: "#5123bc",
  magenta: "#d72be8",
  focus: "#e7f06a",
};

type Shot = {
  frames: number;
  title: string;
  sub?: string;
  glow: [string, string];
  // Width over height of the capture, so the card never crops it.
  aspect: number;
  media: ReactNode;
};

const FADE = 12;

const fit: CSSProperties = { height: "100%", width: "100%", objectFit: "contain" };

const shots: Shot[] = [
  {
    frames: 300,
    title: "Your Hue lights,\nright on your desktop.",
    sub: "Rooms, scenes, color and brightness without reaching for your phone.",
    glow: [C.golden, C.sunset],
    aspect: 2400 / 2650,
    // The real recorded walkthrough, played at 1.6× so ~16s fits in 10s.
    media: (
      <OffthreadVideo
        src={staticFile("mote-hero-demo-hd.mp4")}
        playbackRate={1.6}
        muted
        style={fit}
      />
    ),
  },
  {
    frames: 120,
    title: "Every scene,\none click away.",
    glow: [C.magenta, C.violet],
    aspect: 1402 / 1122,
    media: <Img src={staticFile("mote-scene-gallery-dark.png")} style={fit} />,
  },
  {
    frames: 120,
    title: "Widgets that stay\nwhere you work.",
    sub: "Keep a room, zone or light in a small always-available window.",
    glow: [C.aurora, C.violet],
    aspect: 340 / 516,
    media: (
      <Img src={staticFile("mote-widget-stack-top3.png")} style={fit} />
    ),
  },
  {
    frames: 150,
    title: "Lights that follow\nyour screen.",
    sub: "PC Sync for video, games and music.",
    glow: [C.orange, C.magenta],
    aspect: 988 / 1107,
    media: <Img src={staticFile("mote-sync-this-pc-dark.png")} style={fit} />,
  },
  {
    frames: 120,
    title: "Placed where your\nlights really are.",
    glow: [C.aurora, C.focus],
    aspect: 1301 / 1119,
    media: <Img src={staticFile("mote-sync-placement-room-dark.png")} style={fit} />,
  },
];

const OUTRO = 150;
export const PROMO_DURATION = shots.reduce((n, s) => n + s.frames, 0) + OUTRO;


export const MotePromo = ({ vertical }: { vertical: boolean }) => {
  let from = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: C.night, fontFamily, color: C.text }}>
      {shots.map((shot, i) => {
        const seq = (
          <Sequence key={i} from={from} durationInFrames={shot.frames + FADE}>
            <ShotScene shot={shot} vertical={vertical} />
          </Sequence>
        );
        from += shot.frames;
        return seq;
      })}
      <Sequence from={from}>
        <Outro vertical={vertical} />
      </Sequence>
    </AbsoluteFill>
  );
};

function useFadeInOut(total: number) {
  const frame = useCurrentFrame();
  return interpolate(frame, [0, FADE, total - FADE, total], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function Glow({ colors }: { colors: [string, string] }) {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 40) * 60;
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(60% 70% at ${70 + drift / 20}% 45%, ${colors[0]}55, transparent 70%),
            radial-gradient(50% 60% at ${20 - drift / 30}% 90%, ${colors[1]}40, transparent 70%)`,
          filter: "blur(40px)",
        }}
      />
    </AbsoluteFill>
  );
}

function ShotScene({ shot, vertical }: { shot: Shot; vertical: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useFadeInOut(shot.frames + FADE);
  const rise = spring({ frame, fps, config: { damping: 200 } });
  const zoom = interpolate(frame, [0, shot.frames], [1, 1.03], { easing: Easing.inOut(Easing.ease) });
  // Largest card of the capture's own aspect that fits the layout box.
  const [boxW, boxH] = vertical ? [940, 1100] : [960, 880];
  const cardW = Math.min(boxW, boxH * shot.aspect);

  const text = (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: vertical ? 900 : 640 }}>
      <h1
        style={{
          margin: 0,
          fontSize: vertical ? 84 : 76,
          fontWeight: 700,
          lineHeight: 1.04,
          letterSpacing: "-0.035em",
          whiteSpace: "pre-line",
          transform: `translateY(${(1 - rise) * 40}px)`,
        }}
      >
        {shot.title}
      </h1>
      {shot.sub ? (
        <p
          style={{
            margin: 0,
            fontSize: vertical ? 40 : 32,
            lineHeight: 1.35,
            color: C.muted,
            opacity: interpolate(frame, [10, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          {shot.sub}
        </p>
      ) : null}
    </div>
  );

  const card = (
    <div
      style={{
        width: cardW,
        height: cardW / shot.aspect,
        borderRadius: 16,
        overflow: "hidden",
        filter: `drop-shadow(0 30px 60px ${shot.glow[0]}40) drop-shadow(0 10px 24px #000a)`,
        transform: `scale(${zoom}) translateY(${(1 - rise) * 60}px)`,
      }}
    >
      {shot.media}
    </div>
  );

  return (
    <AbsoluteFill style={{ opacity }}>
      <Glow colors={shot.glow} />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: vertical ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          gap: vertical ? 80 : 100,
          padding: vertical ? "120px 90px" : "0 110px",
        }}
      >
        {text}
        {card}
      </AbsoluteFill>
      <Brand vertical={vertical} />
    </AbsoluteFill>
  );
}

function Brand({ vertical }: { vertical: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        top: vertical ? 70 : 56,
        left: vertical ? 90 : 110,
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontSize: 30,
        fontWeight: 600,
      }}
    >
      <Img src={staticFile("mote-app-icon.png")} style={{ width: 48, height: 48, borderRadius: 12 }} />
      Mote Desktop
    </div>
  );
}

function Outro({ vertical }: { vertical: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, mass: 0.8 } });
  const late = interpolate(frame, [18, 36], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity }}>
      <Glow colors={[C.golden, C.magenta]} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 36, textAlign: "center" }}>
        <Img
          src={staticFile("mote-app-icon.png")}
          style={{ width: 180, height: 180, borderRadius: 40, transform: `scale(${pop})` }}
        />
        <div style={{ fontSize: vertical ? 104 : 112, fontWeight: 700, letterSpacing: "-0.04em" }}>Mote Desktop</div>
        <div style={{ fontSize: vertical ? 42 : 40, color: C.muted, opacity: late, padding: "0 60px" }}>
          Control Philips Hue from Windows
        </div>
        <div
          style={{
            marginTop: 16,
            opacity: late,
            padding: "22px 44px",
            borderRadius: 999,
            backgroundColor: C.text,
            color: C.night,
            fontSize: 36,
            fontWeight: 600,
          }}
        >
          Free on the Microsoft Store
        </div>
        <div style={{ fontSize: 30, color: C.muted, opacity: late }}>motedesktop.com</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
