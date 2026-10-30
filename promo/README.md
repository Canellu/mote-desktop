# Mote promo

Remotion project for landscape and vertical Mote Desktop videos. The files in
`public/` are Mote's own app captures and icon.

From this directory:

```sh
bun install --frozen-lockfile
bun run studio
bun run render
bun run render:vertical
```

Rendered videos go into the ignored `out/` directory.
