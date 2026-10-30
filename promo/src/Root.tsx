import React from "react";
import { Composition } from "remotion";
import { MotePromo, PROMO_DURATION } from "./MotePromo";

export const Root = () => (
  <>
    <Composition
      id="MotePromo"
      component={MotePromo}
      durationInFrames={PROMO_DURATION}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ vertical: false }}
    />
    <Composition
      id="MotePromoVertical"
      component={MotePromo}
      durationInFrames={PROMO_DURATION}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ vertical: true }}
    />
  </>
);
