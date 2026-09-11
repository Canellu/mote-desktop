---
title: "Hue System Performance"
keywords:
  [
    "performance",
    "bridge load",
    "rate limits",
    "commands per second",
    "latency",
    "polling",
    "best practices",
  ]
summary: "Guidance for keeping Hue systems responsive, including bridge performance characteristics, command pacing, polling behavior, and application best practices."
---

# Hue System Performance

It is strongly advised to send less commands than the maximum indicated in this note, otherwise the ZigBee network of the hue system may not function correctly with other commands on the network, e.g. hue Tap. For any feature where you need to send fast light updates for an extended period of time, you must use the dedicated [Hue Entertainment Streaming API](https://developers.meethue.com/develop/hue-entertainment/).

Aspects of System Performance

In this note, the following aspects of the hue system performance will be discussed:

System latency:

This is the time between sending a hue API command to the bridge and completion of the light effect on the lamp, e.g. setting a lamp to certain brightness and color when transitiontime=0 is used.

System throughput:

This is the number of light effects per second that can be handled by the hue bridge (and the rest of the system).

Also, some special situations will be discussed, in which the performance of the system can deviate from the normal latency and throughput behavior.

System Latency

Using the CLIP interface, an application can dispatch light commands into the bridge. The bridge will translate these commands into (one or more) corresponding ZigBee message(s). These messages will be transmitted over the ZigBee network; the lamp(s) will receive these message(s), and update their light state(s). The system latency is defined as the time between sending a hue API command (CLIP command in image) to the bridge and completion of the light effect on the lamp, e.g. setting a lamp to certain brightness and color – when using parameter transitiontime=0 (i.e. immediate transition).

Table 1 below summarizes the system latency that one can expect. As obvious from the table, this latency depends on the number of ZigBee messages that result out of the hue API command – details of this translation will be discussed in the Translation of hue API commands section below. The system latencies listed in Table 1 have been measured under the following conditions:

- he hue API command is controlling a single lamp (unicast message)
- The lamp is already on
- The parameter transitiontime is set to 0
- The lamp can be reached via a single ZigBee hop
- A wired Ethernet connection is used between PC or app and router and between router and hue bridge (being independent of Wifi latencies)
- There is no background ZigBee traffic (such as software download)
- The maximum system throughput rate from the System Throughput section is respected

The values in the table are averages from a series of measurements; variations of about +/-5 ms are typical.

Table 1: Average latency for various hue API messages

| Column 1                             | Column 2                                             | Column 3        |
| ------------------------------------ | ---------------------------------------------------- | --------------- |
| #ZigBee messages per hue API command | parameters used in body of hue API command (example) | average latency |
| 1                                    | brightness                                           | 55 ms           |
| 2                                    | brightness + color                                   | 95 ms           |
| 3                                    | brightness + color + on                              | 125 ms          |

Translation of Hue API Commands to ZigBee Messages

The bridge has to translate the set of parameters in the hue API command into one or more ZigBee messages; Table 1 above summarizes the number of ZigBee messages that are transmitted by the bridge as result of the parameters used in a single hue API command. As an example, a hue API command with “bri” and “sat” parameters, will be translated into 2 ZigBee messages.

As a consequence, for optimal performance, the application should not send superfluous parameters in a hue API command, e.g. there is no need to include an “on” parameter in the hue API command when a lamp is already (known to be) on, and no need to include a “bri” parameter when only the color of a lamp needs to be updated.

Table 2: Translation of hue API commands to ZigBee messages

| Field                                      | Value            |
| ------------------------------------------ | ---------------- |
| Parameters used in body of hue API command | #ZigBee messages |
| bri                                        | 1                |
| hue                                        | 1                |
| sat                                        | 1                |
| xy                                         | 1                |
| ct                                         | 1                |
| on                                         | 1                |
| transitiontime                             | 02               |
| bri + xy                                   | 2                |
| bri + xy + on                              | 3                |
| bri + hue                                  | 2                |
| bri + sat                                  | 2                |
| bri + hue + sat                            | 2                |
| bri + hue + sat + on                       | 3                |
| bri + ct                                   | 2                |
| bri + ct + on                              | 3                |

System Throughput

Hue API commands are dispatched by an application into the bridge. The bridge will translate these into corresponding ZigBee message(s), and transmit those. In this process, the bridge will take into account the known throughput of the various parts of the system, and maximum allowed ZigBee messages indicated in the ZigBee standard, and will schedule messages for ZigBee transmission at a corresponding rate (“throttling” to prevent overloading the ZigBee network). Apart from the ZigBee messages resulting from the CLIP commands sent by your application, other ZigBee messages are also sent and received by the bridge (e.g. scene setting due to hue tap switch, system housekeeping, software download, ..).

The throttling takes into account the combined system load of these messages of various sources. The available system throughput (from the hue API) is thus restricted by the number of ZigBee messages per second that can be handled by the system, which is approximately 25 ZigBee messages/s. Depending on the number of ZigBee messages that result from a hue API command, the throughput (in hue API commands/s) and time between consecutive hue API commands as illustrated in Table 3 can be derived.

Table 3: Throughput for various hue API commands

| Column 1                             | Column 2                                             | Column 3              | Column 4                      |
| ------------------------------------ | ---------------------------------------------------- | --------------------- | ----------------------------- |
| #ZigBee messages per hue API command | Parameters used in body of hue API command (example) | System throughput     | Time between hue API messages |
| 1                                    | setting brightness                                   | brightness            | 40 ms                         |
| 1                                    | setting brightness+color                             | 25 hue API commands/s | 80 ms                         |
| 3                                    | setting brightness + color+on                        | 2 hue API commands/s  | 120 ms                        |

As soon as an application exceeds these rates, buffering will occur in the bridge, which will significantly increase the latency for following commands. Therefore, exceeding these rates should be avoided.

Special Situations

In certain situations, the performance of the system can deviate from the latency and throughput mentioned in the previous sections. This section will discuss some situations, and provide tips how to avoid them.

Clogging

As indicated in the System Throughput section, sending hue API commands at a rate exceeding the throughput limit will cause the commands to be piled up inside the bridge (“buffering”), leading to considerable latency increase. Worst case this can be several seconds.

When exceeding the throughput limit (and hence buffering occurring), there is no direct indication to the application that buffering is occurring – so (initially) the application is unaware of the buffering, and the latency will be significantly larger than described above. When the application continues to send at such a rate exceeding the capabilities of the system, after some time the buffer in bridge will become full, and the hue API command will be dropped, and an error similar to this one is reported in the reply to the hue API command that got dropped:

```json
{
  "error": {
    "type": 901,
    "address": "/lights/1/state",
    "description": "Internal error, 503"
  }
}
```

Parallel Activity

The described latency and throughput behavior assumes that a single application is controlling the system. In case of multiple applications sending hue API commands, the available resources in the system have to be shared, resulting in that these applications will experience a reduced throughput and increased latency.

Interruptions in IP Connection

The latency and throughput figures reported in the preceding sections are relevant for a wired Ethernet connection from the device sending the hue API commands to the bridge. If this wired connection is replaced with a wireless connection, it results in additional latencies, e.g. 4 ms in a particular test setup, which is small compared to the total latency described in the above Translation of hue API commands section.

However, in specific situations where a packet gets lost on the wireless connection between the device supplying the hue API commands and the access point, it can result in latencies of several seconds. Different access points can give quite different results and drop rates of this phenomenon. Suggested workaround to such wireless issues: Use a wired connection in case optimum performance is required.

ZigBee Multi-Hop Network

As all wireless communication, ZigBee transmissions signals are dependent on the environment, and can get weaker due to increased distance, reflections or obstructions. When two devices within a ZigBee network are not within reach of each other, intermediate nodes could relay the signal. This is called hopping and is arranged automatically. When hopping is applicable for the connection between the bridge and a light, the latency will increase and the throughput will decrease. To get optimal performance we suggest placing the bridge nearby or at least in the same room as the lights that need to be controlled.

Group Commands

The system also supports group commands via the hue API. This group command will be translated in a broadcast message on the ZigBee network. The ZigBee standard puts a limitation of the number of broadcast messages of around 1 per second to prevent possible overloading on the ZigBee network. Care should be taken to limit the number of group commands, as they will also limit the unicast commands. From an application one should balance the group and single light commands.

Entertainment API

The previous explanations were related to the REST API. Sometimes there are use cases such as syncing lights with entertainment content where you need to send fast updates to multiple lights for an extended period of time. In that case, the REST API should not be used, and instead the dedicated [Hue Entertainment Streaming API](https://developers.meethue.com/develop/hue-entertainment/) should be used which is specifically designed for that purpose.

Conclusion

As a general guideline we always recommend to our developers to stay at roughly 10 commands per second to the /lights resource with a 100ms gap between each API call. For /groups commands you should keep to a maximum of 1 per second. It is however always recommended to take into consideration the above information and to of course stress test your app/system to find the optimal values for your application. For updating multiple lights at a high update rate for more than just a few seconds, the dedicated Entertainment Streaming API must be used instead of the REST API.
