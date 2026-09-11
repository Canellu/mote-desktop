---
title: "Bridge Maximum Settings"
keywords:
  [
    "bridge limits",
    "maximum settings",
    "resource limits",
    "lights",
    "sensors",
    "rules",
    "schedules",
    "scenes",
  ]
summary: "Quick reference for maximum supported Hue Bridge settings and resource counts such as lights, sensors, rules, schedules, scenes, groups, and apps."
---

# Bridge – Maximum Settings

When developing for hue please bear in mind the Hue bridge has maximum limits, since API 1.15 the maximum number can be requested using api/<username>/capabilities endpoint ([10\. Capabilities API](https://developers.meethue.com/develop/hue-api/10-capabilities-api/)). The maximum number has increased over time, below is a table from before api release 1.15.

| Resource/Device                  | Limit | Notes                                                                                                                                                                                                                 |
| -------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| # of ZigBee devices              | 126   | This is the total number of ZigBee lights (max: 63) and sensors (max: 62). No error will be returned from the bridge upon reaching the limit.                                                                         |
| # of ZigBee lights               | 50    | Up to 63 is supported, but the system becomes less responsive going higher than 50                                                                                                                                    |
| # of ZigBee sensors              | 50    | Up to 63 is supported, but the system becomes less responsive going higher than 50. There is an additional limitiation depending on the number of rules created for each sensor.                                      |
| # of sensors                     | 64    | Including the daylight sensor, CLIP sensors, Hue Tap, Hue Dimmer, etc. If the limit is reached a 502 error will be returned.                                                                                          |
| # of rules                       | 200   | A maximum of 400 conditions and 400 actions can be divided over a maximum of 200 rules. An individual rule can contain a maximum of 8 conditions and 8 actions. If the limit is reached a 601 error will be returned. |
| # of groups                      | 64    | If the limit is reached an 301 error will be returned. (Luminaire and LightSource groups aren’t taken into account)                                                                                                   |
| # of scenes in lamp              | 50    |                                                                                                                                                                                                                       |
| # of scenes in bridge            | 200   | It’s a soft limit, because it’s depending on the amount of lightstates per scene, see next row. Once the limit is reached, the least recently used scene is deleted.                                                  |
| # of lightstates used for scenes | 2048  | Once the limit is reached, the least recently used scene is deleted.                                                                                                                                                  |
| # of whitelist entries           | 100   | If the limit is reached the least recently used whitelist entry is deleted.                                                                                                                                           |
| # of schedules                   | 100   | If the limit is reached an 701 error will be returned.                                                                                                                                                                |
| # of resourcelinks               | 64    |                                                                                                                                                                                                                       |
