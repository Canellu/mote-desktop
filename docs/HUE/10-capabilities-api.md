---
title: "Hue API v1 Capabilities API"
keywords:
  [
    "Hue API v1",
    "capabilities",
    "bridge limits",
    "resource limits",
    "creatable resources",
    "available resources",
  ]
summary: "Reference for Hue API v1 capabilities, including bridge resource limits and what resource types can still be created on a bridge."
---

# 10\. Capabilities API

## 10.1. Get all Capabilities

| URL        | /api/<username>/capabilities |
| ---------- | ---------------------------- |
| Method     | GET                          |
| Version    | 1.15.0                       |
| Permission | Whitelist                    |

### 10.1.1. Description

Allows the user to list capabilities of resources supported in the bridge.

### 10.1.2. Response

Returns a list of all supported capabilities in the bridge.

### 10.1.3. Sample Response

```json
{
"lights":{
  "available": 10,
},
"sensors":{
  "availble": 60,
  "clip": {
      "available": 60,
  },
  "zll": {
      "available": 60,
  },
  "zgp": {
      "available": 60
  }
},
"groups": {...},
"scenes": {
      "available": 100,

      "lightstates": {
          "available": 1500
      }
"rules": {...},
"schedules": {...},
"resourcelinks": {...},
"whitelists": {...}
"timezones": {
      "values":[
         "Africa/Abidjan",
         "Africa/Accra",
         (...)
         "Pacific/Wallis",
         "US/Pacific-New" }
 }
}
```

## 10.2. Capability List

### 10.2.1. Creatable resources

| Column 1                                               | Column 2 | Column 3                                                                                                                                                                                                        |
| ------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                                                   | Type     | Description                                                                                                                                                                                                     |
| available                                              | int      | Total (maximum) number of resources which still can be created by POST on this resource path. The number of creatable resources for a specific subresource type might be lower. Apply to all below.             |
| total                                                  | int      | Total number of resources which can be read on this resource path. Apply to all below.                                                                                                                          |
| <subresource>                                          | object   | Resource capabilities of child resource <subresources>Creation of this resource requires creation of subresources which comes from a limited shared resource pool                                               |
| <resourcetype>                                         | object   | Lists the resource capabilities of resource of <resourcetype>. The amount of available resources can differ based on the type of resource which can be created by POST.                                         |
| /api/<username>/capabilities/<resource>/<subresource>  |          |                                                                                                                                                                                                                 |
| available                                              | int      | Total number of sub-resources which can be used when creating parent by POST                                                                                                                                    |
| total                                                  | int      | Total remaining number of sub-resources available                                                                                                                                                               |
| /api/<username>/capabilities/<resource>/<resourcetype> |          |                                                                                                                                                                                                                 |
| available                                              | int      | Total number of resources of <resourcetype> which still can be created by POST. This is linked to the total available attribute on top level which is always greater or equal then availability of resourcetype |
| total                                                  | int      | Total remaining number of resourcetype available                                                                                                                                                                |

| Column 1                               | Column 2                                   | Column 3                                                                                                                                 |
| -------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| /api/<username>/capabilities/lights    |                                            |                                                                                                                                          |
| available                              | int                                        |                                                                                                                                          |
| total                                  | int                                        |                                                                                                                                          |
| /api/<username>/capabilities/sensors   |                                            |                                                                                                                                          |
| available                              | int                                        |                                                                                                                                          |
| total                                  | int                                        |                                                                                                                                          |
| clip                                   | resourcetype                               | Capability information of resources which are directly created by POST                                                                   |
| zll                                    | resourcetype                               | Capability information of Zigbee resources which are discovered by POST                                                                  |
| zgp                                    | resourcetype                               | Capability information of ZGP resources which are discovered by POST                                                                     |
| /api/<username>/capabilities/groups    |                                            |                                                                                                                                          |
| available                              | int                                        |                                                                                                                                          |
| total                                  | int                                        |                                                                                                                                          |
| /api/<username>/capabilities/scenes    |                                            |                                                                                                                                          |
| lightstates                            | subresource                                | Represents the total pool of individual lightsstates (scene setting per lamp) which can be used across all scenes in /scenes/lightstates |
| /api/<username>/capabilities/schedules |                                            |                                                                                                                                          |
|                                        | No <subresource> or <resourcetype> defined |                                                                                                                                          |
| /api/<username>/capabilities/rules     |                                            |                                                                                                                                          |
| actions                                | subresource                                | Represents the total pool of individual actions which can be used across all rules in /rules/actions                                     |

## 10.2.2. Other resources

| Column 1                               | Column 2        | Column 3                                                                                                                                    |
| -------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| /api/<username>/capabilities/timezones |                 |                                                                                                                                             |
| values                                 | array of String | List of supported time zones represented as tz database strings. Each value can be set in /config/timezone. Other values are not supported. |

## 10.2.3. Features

| Column 1                               | Column 2 | Column 3 | Column 4                                                                 |
| -------------------------------------- | -------- | -------- | ------------------------------------------------------------------------ |
| /api/<username>/capabilities/streaming |          |          |                                                                          |
| available                              | int      | 1.22.0   | Number of currently available client streams (max one stream per client) |
| total                                  | int      | 1.22.0   | Total number of available client streams (max one stream per client)     |
| channels                               | int      | 1.22.0   | Number of channels per stream                                            |
