---
title: "Watch that Transition Time"
keywords:
  [
    "transition time",
    "light transitions",
    "user experience",
    "Hue API",
    "timing",
    "animations",
  ]
summary: "Short application design guidance explaining why Hue apps should choose transition times carefully to avoid slow, surprising, or inconsistent light behavior."
---

# Watch that Transition Time!

We attend hackathons with our developer kits and have a chance to work with developers directly trying out hue for the first time. What we have found pretty consistent is that people find the hue API easy to use.

But that doesn’t mean it’s easy for them to complete their application. Once developers start using hue they start find out a bit more about non-functional characteristics, like performance. There is a very simple component to this which people quite often fall over: transition time. Transition time is an attribute on light state. So when you set the light state there will be a transition time. However it is an optional attribute. If you don’t set it specifically, it will use the default. Transition time is set in hundred milliseconds increments. The default is 4, meaning 400 ms. So if you are changing the light state from red to blue it will do that over 400 milliseconds – by default. This is a pleasing transition for day to day use. However it is not what you need for a rapidly responsive app.

**In order to make the light change its state quickly, set the transition time to zero. Also note that the transition time attribute is not persistent, it will reset to 400 ms (4) unless you set it specifically each time you set the light state!**
